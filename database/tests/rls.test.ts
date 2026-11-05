import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, asUser, failure, range } from './helpers.ts';

const future = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

async function bookingFor(db: any, ids: any) {
  const rid = (await asUser(db, ids.users.ana, () => db.query(`select app.create_request($1,$2::tstzrange,'oi',$3::uuid[]) as id`,
    [ids.listings.carlaHospedagem, range('2030-03-10T15:00:00Z', '2030-03-12T11:00:00Z'), [ids.pets.thor]]))).rows[0].id;
  const qid = (await asUser(db, ids.users.carla, () => db.query(`select app.send_quote($1,$2::jsonb,$3,'{}'::jsonb) as id`,
    [rid, JSON.stringify([{ description: 'Hospedagem', quantity: 2, unit_price_cents: 12000 }]), future(48)]))).rows[0].id;
  const res = (await asUser(db, ids.users.ana, () => db.query(`select app.accept_quote($1,'rls-key-00001') as r`, [qid]))).rows[0].r;
  return { rid, qid, ...res };
}

test('visitante (anon): só vê projeções públicas; tabelas-base e schema private são negados', async () => {
  const { db } = await freshDb();
  await asUser(db, null, async () => {
    const pub = (await db.query(`select slug from public.v_public_providers order by slug`)).rows.map((r: any) => r.slug);
    assert.deepEqual(pub, ['carla-demo', 'diego-demo', 'elisa-demo']);
    for (const t of ['public.users', 'public.pets', 'public.provider_profiles', 'public.bookings', 'public.payments', 'public.ledger_entries', 'private.user_contacts', 'private.provider_contacts']) {
      assert.match((await failure(() => db.query(`select * from ${t}`))) ?? '', /permission denied/, t);
    }
    assert.match((await failure(() => db.query(`select app.uid()`))) ?? '', /permission denied/);
  });
});

test('projeções públicas não expõem colunas privadas e escondem perfis não publicados/suspensos', async () => {
  const { db, ids } = await freshDb();
  const cols = (await db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_schema='public' and table_name in ('v_public_providers','v_public_listings','v_public_reviews')`)).rows.map((r) => r.column_name);
  for (const forbidden of ['organization_id', 'responsible_user_id', 'tutor_id', 'reviewer_id', 'professional_phone', 'email', 'phone', 'document', 'resource_id', 'commercial_address']) {
    assert.ok(!cols.includes(forbidden), `coluna privada exposta: ${forbidden}`);
  }
  await db.exec(`update public.provider_profiles set status = 'suspended' where slug = 'diego-demo'`);
  const slugs = (await asUser(db, null, () => db.query(`select slug from public.v_public_providers`))).rows.map((r: any) => r.slug);
  assert.ok(!slugs.includes('diego-demo'));
  const listings = (await asUser(db, null, () => db.query(`select id from public.v_public_listings`))).rows.map((r: any) => r.id);
  assert.ok(!listings.includes(ids.listings.diegoPasseio));        // oferta de perfil suspenso some junto
});

test('espécie: "todos" só considera espécies habilitadas no piloto e na região', async () => {
  const { db, ids } = await freshDb();
  await db.exec(`insert into public.listing_species(listing_id, species_code) values ('${ids.listings.carlaHospedagem}', 'bird')`);   // espécie não habilitada
  const sp = (await asUser(db, null, () => db.query(`select species from public.v_public_listings where id = $1`, [ids.listings.carlaHospedagem]))).rows[0].species;
  assert.deepEqual(sp, ['cat', 'dog']);
});

test('tutor A não lê pets, reservas, pedidos, pagamentos nem conversas do tutor B', async () => {
  const { db, ids } = await freshDb();
  await bookingFor(db, ids);
  await asUser(db, ids.users.bruno, async () => {
    for (const t of ['pets', 'service_requests', 'quotes', 'bookings', 'booking_pets', 'orders', 'order_lines', 'payments', 'conversations', 'messages', 'capacity_allocations']) {
      const n = t === 'pets' ? 1 : 0;   // Bruno só enxerga a própria Luna
      assert.equal((await db.query(`select count(*)::int c from public.${t}`)).rows[0].c, n, `${t} vazou`);
    }
    assert.equal((await db.query(`select count(*)::int c from private.pet_care_plans`)).rows[0].c, 0);
    assert.equal((await db.query(`select count(*)::int c from public.pets where tutor_id <> app.uid()`)).rows[0].c, 0);
  });
  await asUser(db, ids.users.ana, async () => {
    assert.equal((await db.query(`select count(*)::int c from public.bookings`)).rows[0].c, 1);
    assert.equal((await db.query(`select count(*)::int c from private.pet_care_plans`)).rows[0].c, 1);
  });
});

test('organização A não vê solicitações/reservas/ofertas da organização B; prestador não vê pets antes do pagamento', async () => {
  const { db, ids } = await freshDb();
  const b = await bookingFor(db, ids);
  await asUser(db, ids.users.diego, async () => {
    assert.equal((await db.query(`select count(*)::int c from public.service_requests`)).rows[0].c, 0);
    assert.equal((await db.query(`select count(*)::int c from public.bookings`)).rows[0].c, 0);
    assert.equal((await db.query(`select count(*)::int c from public.service_listings where organization_id = $1`, [ids.orgs.carla])).rows[0].c, 0);
    assert.equal((await db.query(`select count(*)::int c from public.resources where organization_id = $1`, [ids.orgs.carla])).rows[0].c, 0);
  });
  await asUser(db, ids.users.carla, async () => {
    assert.equal((await db.query(`select count(*)::int c from public.bookings`)).rows[0].c, 1);
    assert.equal((await db.query(`select count(*)::int c from public.booking_pets`)).rows[0].c, 0, 'pet visível antes do pagamento');
    assert.equal((await db.query(`select count(*)::int c from public.pets`)).rows[0].c, 0, 'prestador não lê tabela de pets');
    assert.equal((await db.query(`select count(*)::int c from public.orders`)).rows[0].c, 0, 'prestador não vê pedido do tutor');
  });
  await db.query(`select app.register_payment($1,'sandbox','p1','pix')`, [b.order_id]);
  await db.query(`select app.confirm_payment('sandbox','p1')`);
  await asUser(db, ids.users.carla, async () => {
    const snap = (await db.query(`select care_plan_snapshot s from public.booking_pets`)).rows[0].s;
    assert.equal(snap.name, 'Thor');                            // snapshot só após confirmação
    assert.equal(snap.emergency_contact, 'Ana (demo) — contato fictício');
  });
});

test('cliente não escreve campos protegidos (colunas e funções privilegiadas negadas)', async () => {
  const { db, ids } = await freshDb();
  await asUser(db, ids.users.carla, async () => {
    for (const sql of [
      `update public.provider_profiles set status = 'published' where id = '${ids.providers.carla}'`,
      `update public.provider_profiles set is_demo = false where id = '${ids.providers.carla}'`,
      `update public.users set status = 'active' where id = '${ids.users.carla}'`,
      `insert into public.user_roles(user_id, role) values ('${ids.users.carla}', 'admin')`,
      `insert into public.verifications(provider_id, kind, status, scope, valid_until) values ('${ids.providers.carla}', 'safety_basic', 'approved', 'x', now() + interval '1 day')`,
      `update public.provider_metrics set rating_avg = 5, rating_count = 999 where provider_id = '${ids.providers.carla}'`,
      `insert into public.subscriptions(organization_id, plan_code, status) values ('${ids.orgs.carla}', 'pro_regional', 'active')`,
      `insert into public.ledger_transactions(origin_key, description) values ('x','y')`,
      `insert into public.outbox(event_type, aggregate_type, aggregate_id) values ('X','y', gen_random_uuid())`,
      `select app.confirm_payment('sandbox','x')`,
      `select app.register_payment(gen_random_uuid(),'sandbox','x','pix')`,
      `select app.refresh_provider_metrics('${ids.providers.carla}')`,
      `select app.audit('x','y',null,'z')`,
      `select app.expire_holds()`,
      `select app.reserve_capacity(gen_random_uuid(), '${ids.resources.carla}', '[2030-01-01,2030-01-02)', 1, interval '1 minute')`,
      `select app.review_profile('${ids.providers.carla}', 'published', 'x')`,
    ]) assert.match((await failure(() => db.query(sql))) ?? '', /permission denied|row-level security|insufficient_privilege|forbidden/i, sql);
  });
});

test('usuário não cria prestador em organização alheia nem se passa por outro responsável', async () => {
  const { db, ids } = await freshDb();
  const ins = (org: string, resp: string) => `insert into public.provider_profiles(organization_id, responsible_user_id, slug, public_name, city_region_id) values ('${org}','${resp}','novo-perfil','Novo Perfil','${ids.regions.passoFundo}')`;
  await asUser(db, ids.users.bruno, async () => {
    assert.match((await failure(() => db.query(ins(ids.orgs.carla, ids.users.bruno)))) ?? '', /row-level security/);
  });
  await asUser(db, ids.users.carla, async () => {
    assert.match((await failure(() => db.query(ins(ids.orgs.carla, ids.users.diego)))) ?? '', /row-level security/);
    assert.equal(await failure(() => db.query(ins(ids.orgs.carla, ids.users.carla))), null);   // o próprio, ok (nasce em draft)
    assert.equal((await db.query(`select status from public.provider_profiles where slug = 'novo-perfil'`)).rows[0].status, 'draft');
  });
});

test('perfil: publicação exige moderação e identidade verificada; transições inválidas são barradas', async () => {
  const { db, ids } = await freshDb();
  // Preparação: volta o perfil de demo para rascunho ignorando a guarda (o próprio teste valida a guarda depois).
  await db.exec(`alter table public.provider_profiles disable trigger provider_profiles_guard; update public.provider_profiles set status = 'draft' where id = '${ids.providers.diego}'; alter table public.provider_profiles enable trigger provider_profiles_guard`);
  await db.exec(`delete from public.verifications where provider_id = '${ids.providers.diego}'`);
  await asUser(db, ids.users.diego, () => db.query(`select app.submit_profile($1)`, [ids.providers.diego]));
  assert.match((await failure(() => asUser(db, ids.users.diego, () => db.query(`select app.review_profile($1,'published','x')`, [ids.providers.diego])))) ?? '', /forbidden/);
  assert.match((await failure(() => asUser(db, ids.users.moderadora, () => db.query(`select app.review_profile($1,'published','x')`, [ids.providers.diego])))) ?? '', /invalid_transition|identity_not_verified/);
  await asUser(db, ids.users.moderadora, () => db.query(`select app.review_profile($1,'reviewing','em análise')`, [ids.providers.diego]));
  assert.match((await failure(() => asUser(db, ids.users.moderadora, () => db.query(`select app.review_profile($1,'published','ok')`, [ids.providers.diego])))) ?? '', /identity_not_verified/);
  await db.query(`insert into public.verifications(provider_id, kind, status, scope, valid_until) values ($1,'identity','approved','Documento conferido', now() + interval '1 year')`, [ids.providers.diego]);
  await asUser(db, ids.users.moderadora, () => db.query(`select app.review_profile($1,'published','ok')`, [ids.providers.diego]));
  assert.equal((await db.query(`select count(*)::int c from public.audit_logs where object_id = $1`, [ids.providers.diego])).rows[0].c, 2);
  assert.match((await failure(() => db.query(`update public.provider_profiles set status = 'draft' where id = $1`, [ids.providers.diego]))) ?? '', /invalid_transition/);
});

test('chat: só participantes leem/escrevem; remetente não é forjável; bloqueio impede novas mensagens', async () => {
  const { db, ids } = await freshDb();
  const b = await bookingFor(db, ids);
  const conv = (await db.query(`select id from public.conversations where request_id = $1`, [b.rid])).rows[0].id;
  await asUser(db, ids.users.ana, () => db.query(`insert into public.messages(conversation_id, body) values ($1,'Oi, Carla')`, [conv]));
  assert.match((await failure(() => asUser(db, ids.users.bruno, () => db.query(`insert into public.messages(conversation_id, body) values ($1,'intruso')`, [conv])))) ?? '', /row-level security/);
  assert.match((await failure(() => asUser(db, ids.users.ana, () => db.query(`insert into public.messages(conversation_id, sender_id, body) values ($1,$2,'forjado')`, [conv, ids.users.carla])))) ?? '', /permission denied/);
  assert.equal((await asUser(db, ids.users.bruno, () => db.query(`select count(*)::int c from public.messages`))).rows[0].c, 0);
  assert.equal((await asUser(db, ids.users.carla, () => db.query(`select count(*)::int c from public.messages`))).rows[0].c, 1);
  // Carla vê o nome de exibição da Ana (interlocutora); Bruno não vê ninguém além de si
  assert.ok((await asUser(db, ids.users.carla, () => db.query(`select id from public.users`))).rows.some((r: any) => r.id === ids.users.ana));
  assert.equal((await asUser(db, ids.users.bruno, () => db.query(`select id from public.users`))).rows.length, 1);
  // Bloqueio: Ana bloqueia Carla → Carla não consegue mais enviar; Carla não enxerga o bloqueio
  await asUser(db, ids.users.ana, () => db.query(`insert into public.user_blocks(blocked_id) values ($1)`, [ids.users.carla]));
  assert.match((await failure(() => asUser(db, ids.users.carla, () => db.query(`insert into public.messages(conversation_id, body) values ($1,'oi?')`, [conv])))) ?? '', /row-level security/);
  assert.equal((await asUser(db, ids.users.carla, () => db.query(`select count(*)::int c from public.user_blocks`))).rows[0].c, 0);
  // e a tutora bloqueadora não consegue iniciar nova solicitação a esse prestador
  assert.match((await failure(() => asUser(db, ids.users.ana, () => db.query(`select app.create_request($1,$2::tstzrange,'x',$3::uuid[])`, [ids.listings.carlaHospedagem, range('2031-01-01T10:00:00Z', '2031-01-03T10:00:00Z'), [ids.pets.thor]])))) ?? '', /blocked/);
});

test('consentimento: usuário só enxerga/revoga o próprio; proposta comercial exige alvo e validade', async () => {
  const { db, ids } = await freshDb();
  const ins = (user: string) => asUser(db, user, () => db.query(`insert into public.consent_records(purpose, channel, target_provider_id, target_listing_id, text_version, text_snapshot, expires_at)
     values ('commercial_proposal','chat',$1,$2,'consent-v1','Quero receber uma proposta deste profissional para este serviço. Posso cancelar esta autorização a qualquer momento.', now() + interval '7 days') returning id`,
     [ids.providers.carla, ids.listings.carlaHospedagem]));
  const id = (await ins(ids.users.ana)).rows[0].id;
  assert.equal((await asUser(db, ids.users.bruno, () => db.query(`select count(*)::int c from public.consent_records`))).rows[0].c, 0);
  assert.equal((await asUser(db, ids.users.bruno, () => db.query(`update public.consent_records set status='revoked', revoked_at=now() where id=$1`, [id]))).affectedRows, 0);
  assert.match((await failure(() => asUser(db, ids.users.ana, () => db.query(`insert into public.consent_records(purpose, channel, text_version, text_snapshot) values ('commercial_proposal','chat','v','t')`)))) ?? '', /check constraint/);
  await asUser(db, ids.users.ana, () => db.query(`update public.consent_records set status='revoked', revoked_at=now() where id=$1`, [id]));
  assert.equal((await db.query(`select status from public.consent_records where id=$1`, [id])).rows[0].status, 'revoked');
  // não dá para "reativar" o consentimento pelo cliente
  assert.match((await failure(() => asUser(db, ids.users.ana, () => db.query(`update public.consent_records set status='active', revoked_at=null where id=$1`, [id])))) ?? '', /row-level security|check constraint/);
});

test('denúncia e ticket: protocolo imediato; denunciado nunca vê quem denunciou', async () => {
  const { db, ids } = await freshDb();
  const rep = (await asUser(db, ids.users.ana, () => db.query(`insert into public.reports(subject_type, subject_id, reason) values ('profile',$1,'Conteúdo impróprio no perfil') returning protocol`, [ids.providers.carla]))).rows[0];
  assert.match(rep.protocol, /^DN-\d{6}-\d{6}$/);
  assert.equal((await asUser(db, ids.users.carla, () => db.query(`select count(*)::int c from public.reports`))).rows[0].c, 0);
  assert.equal((await asUser(db, ids.users.moderadora, () => db.query(`select count(*)::int c from public.reports`))).rows[0].c, 1);
  const t = (await asUser(db, ids.users.bruno, () => db.query(`insert into public.tickets(category, subject) values ('cadastro','Não consigo editar meu perfil') returning protocol, status`))).rows[0];
  assert.match(t.protocol, /^CP-/); assert.equal(t.status, 'open');
  assert.equal((await asUser(db, ids.users.ana, () => db.query(`select count(*)::int c from public.tickets`))).rows[0].c, 0);
  assert.equal((await asUser(db, ids.users.moderadora, () => db.query(`select count(*)::int c from public.tickets`))).rows[0].c, 1);
});

test('limite do plano Essencial (2 ofertas) é imposto no banco; plano Profissional libera 10', async () => {
  const { db, ids } = await freshDb();
  const add = (n: number) =>
    asUser(db, ids.users.diego, () => db.query(`insert into public.service_listings(organization_id, provider_id, resource_id, category_code, title, price_cents, price_unit, execution_place) values ($1,$2,$3,'visita_domicilio',$4,2500,'visit','tutor_home')`, [ids.orgs.diego, ids.providers.diego, ids.resources.diego, `Visita ${n}`]));
  await add(1);                                    // Diego já tem 1 publicada → 2
  assert.match((await failure(() => add(2))) ?? '', /listing_limit_reached/);
  await db.query(`insert into public.subscriptions(organization_id, plan_code, status, current_period_end) values ($1,'profissional','active', now() + interval '30 days')`, [ids.orgs.diego]);
  assert.equal(await failure(() => add(3)), null);
  // oferta não pode usar recurso de outra organização (FK composta)
  assert.match((await failure(() => asUser(db, ids.users.diego, () => db.query(`insert into public.service_listings(organization_id, provider_id, resource_id, category_code, title, price_cents, price_unit, execution_place) values ($1,$2,$3,'visita_domicilio','Roubando recurso',100,'visit','tutor_home')`, [ids.orgs.diego, ids.providers.diego, ids.resources.carla])))) ?? '', /foreign key|row-level security/);
  // "a partir de" sem explicação é recusado
  assert.match((await failure(() => db.query(`update public.service_listings set price_is_from = true where id = $1`, [ids.listings.diegoPasseio]))) ?? '', /check constraint/);
});
