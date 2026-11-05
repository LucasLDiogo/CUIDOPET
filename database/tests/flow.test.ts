import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as domain from '../../packages/domain/src/index.ts';
import { freshDb, asUser, failure, range } from './helpers.ts';

const Q = (n: number, d = 'Hospedagem') => JSON.stringify([{ description: d, quantity: n, unit_price_cents: 12000 }]);
const POLICY = JSON.stringify({ cancellation: 'cancel-v1', location: 'casa da Carla' });
const future = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const PERIOD = range('2030-03-10T15:00:00Z', '2030-03-12T11:00:00Z');

async function requestAndQuote(db: any, ids: any, opts: { pets?: string[]; listing?: string; period?: string; nights?: number } = {}) {
  const { users } = ids;
  const rid = (await asUser(db, users.ana, () => db.query(`select app.create_request($1, $2::tstzrange, 'Olá!', $3::uuid[]) as id`,
    [opts.listing ?? ids.listings.carlaHospedagem, opts.period ?? PERIOD, opts.pets ?? [ids.pets.thor]]))).rows[0].id;
  const owner = (opts.listing ?? ids.listings.carlaHospedagem) === ids.listings.diegoPasseio ? users.diego : users.carla;
  const qid = (await asUser(db, owner, () => db.query(`select app.send_quote($1, $2::jsonb, $3, $4::jsonb) as id`, [rid, Q(opts.nights ?? 2), future(48), POLICY]))).rows[0].id;
  return { rid, qid };
}
const accept = (db: any, ids: any, qid: string, key = 'key-accept-0001') =>
  asUser(db, ids.users.ana, () => db.query(`select app.accept_quote($1, $2) as r`, [qid, key])).then((r: any) => r.rows[0].r);

test('fluxo ponta a ponta: solicitação → proposta → aceite → pagamento → reserva confirmada + ledger', async () => {
  const { db, ids } = await freshDb();
  const { qid, rid } = await requestAndQuote(db, ids);
  const res = await accept(db, ids, qid);
  assert.equal(res.total_cents, 24_000);

  let b = (await db.query(`select status from public.bookings where id = $1`, [res.booking_id])).rows[0];
  assert.equal(b.status, 'awaiting_payment');                              // reserva só confirma após pagamento
  assert.equal((await db.query(`select status from public.capacity_allocations where booking_id = $1`, [res.booking_id])).rows[0].status, 'held');

  await db.query(`select app.register_payment($1, 'sandbox', 'pay_001', 'pix', now() + interval '15 minutes')`, [res.order_id]);
  const r1 = (await db.query(`select app.confirm_payment('sandbox','pay_001') as r`)).rows[0].r;
  assert.equal(r1.result, 'confirmed');
  const r2 = (await db.query(`select app.confirm_payment('sandbox','pay_001') as r`)).rows[0].r;   // evento repetido
  assert.equal(r2.result, 'already_confirmed');

  b = (await db.query(`select status from public.bookings where id = $1`, [res.booking_id])).rows[0];
  assert.equal(b.status, 'confirmed');
  assert.equal((await db.query(`select status from public.capacity_allocations where booking_id = $1`, [res.booking_id])).rows[0].status, 'allocated');
  assert.equal((await db.query(`select status from public.service_requests where id = $1`, [rid])).rows[0].status, 'accepted');

  // Ledger do SQL == ledger do domínio (R$240 → 12% = R$28,80).
  const rows = (await db.query<{ account_code: string; d: number; c: number }>(`select account_code, debit_cents d, credit_cents c from public.ledger_entries`)).rows;
  const exp = domain.bookingPaymentConfirmed('x', 24_000, 1200).entries;
  const norm = (a: any[]) => a.map((e) => `${e.account ?? e.account_code}:${e.debitCents ?? e.d}:${e.creditCents ?? e.c}`).sort();
  assert.deepEqual(norm(rows), norm(exp));
  assert.equal((await db.query(`select count(*)::int c from public.ledger_transactions`)).rows[0].c, 1);   // idempotente: 1 lançamento
  const ev = (await db.query<{ event_type: string }>(`select event_type from public.outbox order by occurred_at`)).rows.map((r) => r.event_type);
  assert.ok(ev.includes('PaymentConfirmed') && ev.includes('BookingConfirmed') && ev.includes('CapacityHeld'));
});

test('aceite é idempotente (mesma Idempotency-Key devolve a mesma reserva)', async () => {
  const { db, ids } = await freshDb();
  const { qid } = await requestAndQuote(db, ids);
  const a = await accept(db, ids, qid, 'idem-key-12345');
  const b = await accept(db, ids, qid, 'idem-key-12345');
  assert.deepEqual(a, b);
  assert.equal((await db.query(`select count(*)::int c from public.bookings`)).rows[0].c, 1);
});

test('aceite revalida espécie, porte e habilitação regional', async () => {
  const { db, ids } = await freshDb();
  // Diego só passeia com cães de porte pequeno/médio; Luna é cão grande.
  const { qid } = await requestAndQuote(db, ids, { listing: ids.listings.diegoPasseio, pets: [ids.pets.thor], period: range('2030-03-10T10:00:00Z', '2030-03-10T11:00:00Z') });
  // Mia (gata do mesmo tutor) não é aceita no passeio — troca o pet no pedido via novo request
  const err = await failure(() => asUser(db, ids.users.ana, () => db.query(`select app.create_request($1,$2::tstzrange,'x',$3::uuid[])`, [ids.listings.diegoPasseio, PERIOD, [ids.pets.mia]])).then(async (r: any) => {
    const rid = r.rows[0].create_request;
    const q = (await asUser(db, ids.users.diego, () => db.query(`select app.send_quote($1,$2::jsonb,$3,$4::jsonb) as id`, [rid, Q(1, 'Passeio'), future(24), POLICY]))).rows[0].id;
    return accept(db, ids, q, 'species-key-001');
  }));
  assert.match(err ?? '', /species_not_accepted: cat/);
  assert.ok(qid);
  // Região desabilitada → bloqueia
  await db.exec(`update public.region_enablement set enabled = false where category_code = 'hospedagem_domiciliar' and species_code = 'dog'`);
  const { qid: q2 } = await requestAndQuote(db, ids, { period: range('2030-04-10T15:00:00Z', '2030-04-12T11:00:00Z') });
  assert.match((await failure(() => accept(db, ids, q2, 'region-key-0001'))) ?? '', /not_enabled_in_region/);
});

test('capacidade: último lugar é vendido uma única vez; outro tutor recebe erro claro', async () => {
  const { db, ids } = await freshDb();
  // Carla tem capacidade 2. Ana reserva 2 unidades (2 pets)…
  await db.query(`insert into public.pets(tutor_id, name, species_code, size) values ($1,'Rex','dog','small')`, [ids.users.ana]);
  const rex = (await db.query(`select id from public.pets where name='Rex'`)).rows[0].id;
  const a = await requestAndQuote(db, ids, { pets: [ids.pets.thor, rex] });
  await accept(db, ids, a.qid, 'cap-key-aaaa1');
  // …Bruno tenta o mesmo período
  const rid = (await asUser(db, ids.users.bruno, () => db.query(`select app.create_request($1,$2::tstzrange,'oi',$3::uuid[]) as id`, [ids.listings.carlaHospedagem, PERIOD, [ids.pets.luna]]))).rows[0].id;
  const qid = (await asUser(db, ids.users.carla, () => db.query(`select app.send_quote($1,$2::jsonb,$3,$4::jsonb) as id`, [rid, Q(2), future(48), POLICY]))).rows[0].id;
  const err = await failure(() => asUser(db, ids.users.bruno, () => db.query(`select app.accept_quote($1,'cap-key-bbbb1')`, [qid])));
  assert.match(err ?? '', /capacity_unavailable/);
  // Falha não deixa reserva órfã
  assert.equal((await db.query(`select count(*)::int c from public.bookings where tutor_id = $1`, [ids.users.bruno])).rows[0].c, 0);
  // Período adjacente (check-out == check-in) é permitido
  const rid2 = (await asUser(db, ids.users.bruno, () => db.query(`select app.create_request($1,$2::tstzrange,'oi',$3::uuid[]) as id`, [ids.listings.carlaHospedagem, range('2030-03-12T11:00:00Z', '2030-03-14T11:00:00Z'), [ids.pets.luna]]))).rows[0].id;
  const q2 = (await asUser(db, ids.users.carla, () => db.query(`select app.send_quote($1,$2::jsonb,$3,$4::jsonb) as id`, [rid2, Q(2), future(48), POLICY]))).rows[0].id;
  await asUser(db, ids.users.bruno, () => db.query(`select app.accept_quote($1,'cap-key-cccc1')`, [q2]));
});

test('slot exclusivo: restrição de exclusão impede sobreposição mesmo fora da função', async () => {
  const { db, ids } = await freshDb();
  const mk = async (name: string) => {
    const b = await requestAndQuote(db, ids, { listing: ids.listings.diegoPasseio, period: range('2030-05-01T10:00:00Z', '2030-05-01T11:00:00Z') });
    return b;
  };
  const a = await mk('a');
  const res = await accept(db, ids, a.qid, 'excl-key-0001');
  assert.ok(res.booking_id);
  const err = await failure(() => db.query(`insert into public.capacity_allocations(booking_id, resource_id, period, units, status, expires_at, exclusive_slot)
     values ($1, $2, '[2030-05-01T10:30:00Z,2030-05-01T11:30:00Z)', 1, 'held', now() + interval '5 min', true)`, [res.booking_id, ids.resources.diego]));
  assert.match(err ?? '', /capacity_no_overlap_exclusive|unique/);
});

test('pagamento confirmado após expiração, com pagamento ainda pendente e sem vaga → paid_unallocated', async () => {
  const { db, ids } = await freshDb();
  const a = await requestAndQuote(db, ids, { pets: [ids.pets.thor] });
  const res = await accept(db, ids, a.qid);
  await db.query(`select app.register_payment($1,'sandbox','late_2','pix', now() + interval '15 minutes')`, [res.order_id]);
  await db.exec(`update public.capacity_allocations set expires_at = now() - interval '1 minute' where status = 'held'`);
  // Outro tutor (Bruno) fecha as 2 unidades do período, sem passar pelo job de expiração da Ana
  await db.query(`insert into public.pets(tutor_id, name, species_code, size) values ($1,'Rex','dog','small')`, [ids.users.bruno]);
  const rex = (await db.query(`select id from public.pets where name='Rex'`)).rows[0].id;
  const rid = (await asUser(db, ids.users.bruno, () => db.query(`select app.create_request($1,$2::tstzrange,'oi',$3::uuid[]) as id`, [ids.listings.carlaHospedagem, PERIOD, [ids.pets.luna, rex]]))).rows[0].id;
  const q = (await asUser(db, ids.users.carla, () => db.query(`select app.send_quote($1,$2::jsonb,$3,$4::jsonb) as id`, [rid, Q(2), future(48), POLICY]))).rows[0].id;
  await asUser(db, ids.users.bruno, () => db.query(`select app.accept_quote($1,'late-key-0002')`, [q]));   // reserve_capacity expira o hold vencido da Ana e ocupa 2/2
  const r = (await db.query(`select app.confirm_payment('sandbox','late_2') as r`)).rows[0].r;
  assert.equal(r.result, 'paid_unallocated');
  assert.equal((await db.query(`select status from public.bookings where id = $1`, [res.booking_id])).rows[0].status, 'awaiting_payment');
  assert.equal((await db.query(`select status from public.orders where id = $1`, [res.order_id])).rows[0].status, 'paid_unallocated');
  const t = (await db.query(`select category, priority, protocol from public.tickets`)).rows[0];
  assert.equal(t.category, 'pagamento'); assert.equal(t.priority, 'high'); assert.match(t.protocol, /^CP-\d{6}-\d{6}$/);
  assert.equal((await db.query(`select credit_cents c from public.ledger_entries where account_code='unallocated_payments'`)).rows[0].c, 24_000);
  assert.equal((await db.query(`select count(*)::int c from public.ledger_entries where account_code='commission_revenue'`)).rows[0].c, 0);  // sem receita reconhecida
});

test('valor divergente do PSP não confirma; status fora de ordem não regride', async () => {
  const { db, ids } = await freshDb();
  const a = await requestAndQuote(db, ids);
  const res = await accept(db, ids, a.qid);
  await db.query(`select app.register_payment($1,'sandbox','p_x','pix')`, [res.order_id]);
  await db.exec(`update public.payments set amount_cents = amount_cents - 100 where external_id = 'p_x'`);
  assert.match((await failure(() => db.query(`select app.confirm_payment('sandbox','p_x')`))) ?? '', /amount_mismatch/);
  assert.equal((await db.query(`select status from public.bookings where id=$1`, [res.booking_id])).rows[0].status, 'awaiting_payment');
  // evento chegando para pagamento que já falhou/expirou não regride o estado
  await db.exec(`update public.payments set amount_cents = amount_cents + 100, status = 'failed' where external_id = 'p_x'`);
  assert.equal((await db.query(`select app.confirm_payment('sandbox','p_x') as r`)).rows[0].r.result, 'ignored');
  assert.match((await failure(() => db.query(`select app.confirm_payment('sandbox','inexistente')`))) ?? '', /payment_not_found/);
});

test('expiração de hold cancela reserva não paga e libera a vaga', async () => {
  const { db, ids } = await freshDb();
  const a = await requestAndQuote(db, ids, { listing: ids.listings.diegoPasseio, period: range('2030-06-01T10:00:00Z', '2030-06-01T11:00:00Z') });
  const res = await accept(db, ids, a.qid);
  await db.query(`select app.register_payment($1,'sandbox','p_exp','pix')`, [res.order_id]);
  await db.exec(`update public.capacity_allocations set expires_at = now() - interval '1 second' where booking_id = '${res.booking_id}'`);
  assert.equal((await db.query(`select app.expire_holds() as n`)).rows[0].n, 1);
  assert.equal((await db.query(`select status from public.bookings where id=$1`, [res.booking_id])).rows[0].status, 'cancelled');
  assert.equal((await db.query(`select status from public.payments where external_id='p_exp'`)).rows[0].status, 'expired');
  assert.equal((await db.query(`select status from public.orders where id=$1`, [res.order_id])).rows[0].status, 'expired');
  assert.equal((await db.query(`select public.listing_has_capacity($1, $2::tstzrange, 1) as ok`, [ids.listings.diegoPasseio, range('2030-06-01T10:00:00Z', '2030-06-01T11:00:00Z')])).rows[0].ok, true);
});

test('proposta: total derivado dos itens, versões, e tutor não vê rascunho; proposta antiga deixa de ser aceitável', async () => {
  const { db, ids } = await freshDb();
  const a = await requestAndQuote(db, ids);
  const q2 = (await asUser(db, ids.users.carla, () => db.query(`select app.send_quote($1,$2::jsonb,$3,$4::jsonb) as id`, [a.rid, Q(3), future(48), POLICY]))).rows[0].id;
  assert.equal((await db.query(`select status from public.quotes where id=$1`, [a.qid])).rows[0].status, 'revised');
  assert.match((await failure(() => accept(db, ids, a.qid, 'old-quote-0001'))) ?? '', /quote_not_open: revised/);
  assert.equal((await accept(db, ids, q2, 'new-quote-0001')).total_cents, 36_000);
  // outro usuário não aceita proposta alheia
  const b = await requestAndQuote(db, ids, { period: range('2030-07-10T15:00:00Z', '2030-07-12T11:00:00Z') });
  assert.match((await failure(() => asUser(db, ids.users.bruno, () => db.query(`select app.accept_quote($1,'steal-key-0001')`, [b.qid])))) ?? '', /forbidden/);
  // prestador de outra organização não envia proposta
  assert.match((await failure(() => asUser(db, ids.users.diego, () => db.query(`select app.send_quote($1,$2::jsonb,$3,$4::jsonb)`, [b.rid, Q(1), future(48), POLICY])))) ?? '', /forbidden/);
});

test('avaliação: só tutor, só após concluir e pagar, uma por reserva, janela de 14 dias; nota agregada atualiza', async () => {
  const { db, ids } = await freshDb();
  const a = await requestAndQuote(db, ids, { listing: ids.listings.diegoPasseio, period: range('2030-08-01T10:00:00Z', '2030-08-01T11:00:00Z') });
  const res = await accept(db, ids, a.qid);
  const review = (user: string, score = 5) => asUser(db, user, () => db.query(
    `insert into public.reviews(booking_id, provider_id, score_communication, score_punctuality, score_care, score_match, comment) values ($1,$2,$3,$3,$3,$3,'ótimo')`,
    [res.booking_id, ids.providers.diego, score]));
  assert.match((await failure(() => review(ids.users.ana))) ?? '', /review_booking_not_completed/);
  await db.query(`select app.register_payment($1,'sandbox','p_rev','pix')`, [res.order_id]);
  await db.query(`select app.confirm_payment('sandbox','p_rev')`);
  for (const to of ['ready', 'in_progress', 'completed']) await asUser(db, ids.users.diego, () => db.query(`select app.set_booking_status($1, $2)`, [res.booking_id, to]));
  assert.match((await failure(() => asUser(db, ids.users.diego, () => db.query(`select app.set_booking_status($1,'cancelled')`, [res.booking_id])))) ?? '', /invalid_transition/);  // completed é terminal
  assert.match((await failure(() => review(ids.users.bruno))) ?? '', /review_not_tutor/);
  assert.match((await failure(() => review(ids.users.diego))) ?? '', /review_not_tutor/);        // prestador não avalia a si mesmo
  await review(ids.users.ana, 4);
  assert.match((await failure(() => review(ids.users.ana))) ?? '', /duplicate key|unique/);       // uma por reserva
  const m = (await db.query(`select rating_avg::float a, rating_count c from public.provider_metrics where provider_id=$1`, [ids.providers.diego])).rows[0];
  assert.deepEqual(m, { a: 4, c: 1 });                    // sobrescreve a nota de demo com a real
  // Plano pago não altera nota: o refresh depende só das avaliações
  await db.query(`insert into public.subscriptions(organization_id, plan_code, status, current_period_end) values ($1,'pro_regional','active', now()+interval '30 days')`, [ids.orgs.diego]);
  await db.query(`select app.refresh_provider_metrics($1)`, [ids.providers.diego]);
  assert.equal((await db.query(`select rating_avg::float a from public.provider_metrics where provider_id=$1`, [ids.providers.diego])).rows[0].a, 4);
  // janela de 14 dias
  const b = await requestAndQuote(db, ids, { listing: ids.listings.diegoPasseio, period: range('2030-08-05T10:00:00Z', '2030-08-05T11:00:00Z') });
  const r2 = await accept(db, ids, b.qid, 'rev-key-window1');
  await db.query(`select app.register_payment($1,'sandbox','p_rev2','pix')`, [r2.order_id]); await db.query(`select app.confirm_payment('sandbox','p_rev2')`);
  for (const to of ['ready', 'in_progress', 'completed']) await asUser(db, ids.users.diego, () => db.query(`select app.set_booking_status($1,$2)`, [r2.booking_id, to]));
  await db.exec(`alter table public.bookings disable trigger bookings_guard; update public.bookings set completed_at = now() - interval '15 days' where id = '${r2.booking_id}'; alter table public.bookings enable trigger bookings_guard;`);
  assert.match((await failure(() => asUser(db, ids.users.ana, () => db.query(
    `insert into public.reviews(booking_id, provider_id, score_communication, score_punctuality, score_care, score_match) values ($1,$2,5,5,5,5)`, [r2.booking_id, ids.providers.diego])))) ?? '', /review_window_closed/);
});

test('assinatura: pagamento confirmado ativa o plano uma única vez, lança receita e libera os limites do plano', async () => {
  const { db, ids } = await freshDb();
  const sub = (await db.query(`insert into public.subscriptions(organization_id, plan_code, status) values ($1,'profissional','pending') returning id`, [ids.orgs.diego])).rows[0].id;
  const ord = (await db.query(`insert into public.orders(purpose, buyer_id, organization_id, subscription_id, subtotal_cents, total_cents) values ('subscription',$1,$2,$3,3990,3990) returning id`, [ids.users.diego, ids.orgs.diego, sub])).rows[0].id;
  await db.query(`select app.register_payment($1,'sandbox','sub_pay_1','pix')`, [ord]);
  // antes de pagar: ainda Essencial (visível na view pública)
  assert.equal((await asUser(db, null, () => db.query(`select is_professional from public.v_public_providers where slug='diego-demo'`))).rows[0].is_professional, false);
  assert.equal((await db.query(`select app.confirm_payment('sandbox','sub_pay_1') as r`)).rows[0].r.result, 'confirmed');
  assert.equal((await db.query(`select app.confirm_payment('sandbox','sub_pay_1') as r`)).rows[0].r.result, 'already_confirmed');
  assert.equal((await db.query(`select status from public.subscriptions where id=$1`, [sub])).rows[0].status, 'active');
  assert.equal((await asUser(db, null, () => db.query(`select is_professional from public.v_public_providers where slug='diego-demo'`))).rows[0].is_professional, true);
  const l = (await db.query(`select account_code, credit_cents c, debit_cents d from public.ledger_entries order by account_code`)).rows;
  assert.deepEqual(l, [{ account_code: 'psp_cash', c: 0, d: 3990 }, { account_code: 'subscription_revenue', c: 3990, d: 0 }]);
  // inadimplência: past_due dentro da tolerância mantém; fora dela volta a Essencial (sem apagar perfil)
  await db.exec(`update public.subscriptions set status='past_due', grace_until = now() + interval '3 days' where id='${sub}'`);
  assert.equal((await asUser(db, null, () => db.query(`select is_professional from public.v_public_providers where slug='diego-demo'`))).rows[0].is_professional, true);
  await db.exec(`update public.subscriptions set grace_until = now() - interval '1 day' where id='${sub}'`);
  assert.equal((await asUser(db, null, () => db.query(`select is_professional from public.v_public_providers where slug='diego-demo'`))).rows[0].is_professional, false);
  assert.equal((await db.query(`select status from public.provider_profiles where slug='diego-demo'`)).rows[0].status, 'published');
});
