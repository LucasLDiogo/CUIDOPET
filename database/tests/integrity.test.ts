import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../testdb.ts';
import { applyMigrations } from '../migrate.ts';
import { failure } from './helpers.ts';
import * as domain from '../../packages/domain/src/index.ts';

test('migrations são idempotentes e detectam alteração após aplicadas', async () => {
  const db = await createDb();
  const again = await applyMigrations(db);
  assert.ok(again.every((m) => !m.applied));
  await db.exec(`update public.schema_migrations set checksum = 'adulterado' where name = '0001_base.sql'`);
  await assert.rejects(() => applyMigrations(db), /foi alterada após aplicada/);
});

test('drift: state_transitions no banco == máquinas do pacote de domínio', async () => {
  const db = await createDb();
  const rows = (await db.query<{ machine: string; from_state: string; to_state: string }>(`select * from public.state_transitions`)).rows;
  const dbSet = new Set(rows.map((r) => `${r.machine}:${r.from_state}>${r.to_state}`));
  const machines: Record<string, any> = { profile: domain.profileMachine, request: domain.requestMachine, quote: domain.quoteMachine, booking: domain.bookingMachine, subscription: domain.subscriptionMachine, payment: domain.paymentMachine, verification: domain.verificationMachine };
  const domSet = new Set<string>();
  for (const [n, m] of Object.entries(machines)) for (const [f, ts] of Object.entries(m.transitions)) for (const t of ts as string[]) domSet.add(`${n}:${f}>${t}`);
  assert.deepEqual([...dbSet].sort(), [...domSet].sort());
});

test('drift: estados aceitos pelos CHECKs == estados das máquinas', async () => {
  const db = await createDb();
  const table: Record<string, any> = { provider_profiles: domain.profileMachine, service_requests: domain.requestMachine, quotes: domain.quoteMachine, bookings: domain.bookingMachine, payments: domain.paymentMachine, subscriptions: domain.subscriptionMachine, verifications: domain.verificationMachine };
  for (const [t, m] of Object.entries(table)) {
    const defs = (await db.query<{ d: string }>(`select pg_get_constraintdef(c.oid) d from pg_constraint c where c.conrelid = 'public.${t}'::regclass and c.contype = 'c'`)).rows.map((r) => r.d);
    const statusDef = defs.find((d) => d.includes('status') && d.includes('ARRAY')) ?? '';
    for (const s of Object.keys(m.transitions)) assert.ok(statusDef.includes(`'${s}'`), `${t}: estado ${s} ausente do CHECK`);
  }
});

test('ledger: lançamento desbalanceado é rejeitado no COMMIT; balanceado passa', async () => {
  const db = await createDb();
  await db.exec('begin');
  await db.exec(`insert into public.ledger_transactions(id, origin_key, description) values ('00000000-0000-0000-0000-0000000000a1','t1','x');
    insert into public.ledger_entries(transaction_id, account_code, debit_cents) values ('00000000-0000-0000-0000-0000000000a1','psp_cash',100);
    insert into public.ledger_entries(transaction_id, account_code, credit_cents) values ('00000000-0000-0000-0000-0000000000a1','provider_payable',90);`);
  assert.match((await failure(() => db.exec('commit'))) ?? '', /ledger_unbalanced/);
  await db.exec('rollback').catch(() => {});
  assert.equal((await db.query(`select count(*)::int c from public.ledger_transactions`)).rows[0].c, 0);
  const call = () => db.query(`select app.post_ledger('t2','ok','[{"account":"psp_cash","debit":100},{"account":"provider_payable","credit":100}]'::jsonb) as id`).then((r: any) => r.rows[0].id);
  assert.ok(await call());
  assert.equal(await call(), null);   // idempotente por origin_key
});

test('ledger: imutável (update/delete negados) e reversão por lançamento oposto', async () => {
  const db = await createDb();
  const id = (await db.query(`select app.post_ledger('t3','ok','[{"account":"psp_cash","debit":500},{"account":"provider_payable","credit":500}]'::jsonb) as id`)).rows[0].id;
  assert.match((await failure(() => db.query(`update public.ledger_entries set debit_cents = 1`))) ?? '', /ledger_immutable/);
  assert.match((await failure(() => db.query(`delete from public.ledger_transactions`))) ?? '', /ledger_immutable/);
  await db.query(`select app.post_ledger('t3:rev','reversão','[{"account":"psp_cash","credit":500},{"account":"provider_payable","debit":500}]'::jsonb, $1)`, [id]);
  const net = (await db.query(`select account_code, sum(debit_cents - credit_cents)::int n from public.ledger_entries group by 1`)).rows;
  assert.ok(net.every((r: any) => r.n === 0));
  assert.match((await failure(() => db.query(`insert into public.ledger_entries(transaction_id, account_code, debit_cents, credit_cents) values ($1,'psp_cash',1,1)`, [id]))) ?? '', /check constraint/);
});

test('auditoria é append-only', async () => {
  const db = await createDb();
  await db.exec(`insert into public.audit_logs(action, object_type) values ('x','y')`);
  assert.match((await failure(() => db.exec(`delete from public.audit_logs`))) ?? '', /ledger_immutable/);
});

test('webhook inbox deduplica (provider,event_id)', async () => {
  const db = await createDb();
  const rec = () => db.query(`select app.record_webhook('sandbox','evt_1','PAYMENT_CONFIRMED','abc','{"id":"pay_1"}'::jsonb) as n`).then((r: any) => r.rows[0].n);
  assert.equal(await rec(), true);
  assert.equal(await rec(), false);
  assert.equal((await db.query(`select count(*)::int c from public.webhook_inbox`)).rows[0].c, 1);
});

test('dinheiro é sempre inteiro (centavos)', async () => {
  const db = await createDb();
  const cols = (await db.query<{ column_name: string; data_type: string }>(`select column_name, data_type from information_schema.columns where table_schema='public' and table_name not like 'v\\_%' and column_name like '%cents'`)).rows;
  assert.ok(cols.length > 8);
  for (const c of cols) assert.ok(['integer', 'bigint'].includes(c.data_type), `${c.column_name} deve ser inteiro`);
});

test('dado pessoal sensível não existe em colunas do schema public', async () => {
  const db = await createDb();
  const pub = (await db.query<{ table_name: string; column_name: string }>(`select table_name, column_name from information_schema.columns where table_schema = 'public' and (column_name ~* '(cpf|cnpj|document|email|phone|birth|nascimento|bank|pix_key|address)')`)).rows;
  assert.deepEqual(pub, []);
});
