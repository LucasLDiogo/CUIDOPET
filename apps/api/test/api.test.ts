import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createDb } from '../../../database/testdb.ts';
import { seedDemo, type DemoIds } from '../../../database/seed/demo.ts';
import { buildApp, retryPendingWebhooks } from '../src/app.ts';
import { SandboxProvider } from '../../../packages/providers/src/index.ts';
import { FORBIDDEN_PUBLIC_KEYS } from '../../../packages/contracts/src/index.ts';

const SECRET = 'segredo-de-teste-1234567890';
async function setup() {
  const pg = await createDb();
  const ids = await seedDemo(pg);
  const app = await buildApp({ runner: pg, webhookSecret: SECRET });
  return { pg, ids, app };
}
const get = (app: any, url: string) => app.inject({ method: 'GET', url });
const body = (r: any) => JSON.parse(r.body);
const sign = (raw: string) => createHmac('sha256', SECRET).update(raw).digest('hex');
const PF = 4314100;
const base = `/v1/search/providers?uf=RS&city_ibge_id=${PF}`;

function* keysDeep(o: any): Generator<string> {
  if (Array.isArray(o)) for (const v of o) yield* keysDeep(v);
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { yield k; yield* keysDeep(v); }
}

test('health e cabeçalhos de segurança; correlation-id é propagado ou gerado', async () => {
  const { app } = await setup();
  const r = await app.inject({ method: 'GET', url: '/v1/health', headers: { 'x-correlation-id': 'corr-12345678' } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['x-correlation-id'], 'corr-12345678');
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  const r2 = await app.inject({ method: 'GET', url: '/v1/health', headers: { 'x-correlation-id': '<script>' } });
  assert.notEqual(r2.headers['x-correlation-id'], '<script>');         // valor malicioso é descartado
});

test('busca: cidade+serviço+espécie retorna só compatíveis, com contrato válido e sem sponsored inventado', async () => {
  const { app } = await setup();
  const all = body(await get(app, `${base}&service=passeio&species=all`));
  assert.deepEqual(all.results.map((r: any) => r.slug).sort(), ['carla-demo', 'diego-demo']);
  assert.deepEqual(all.sponsored, []);
  const cat = body(await get(app, `${base}&service=hospedagem_domiciliar&species=cat`));
  assert.deepEqual(cat.results.map((r: any) => r.slug), ['carla-demo']);
  const catWalk = body(await get(app, `${base}&service=passeio&species=cat`));       // ninguém passeia com gato
  assert.equal(catWalk.results.length, 0);
  assert.equal(catWalk.empty.message, 'Não encontramos opções para estes filtros');
  assert.deepEqual(catWalk.empty.suggestions, [{ relax: 'species', would_return: 2 }]);   // oferece ampliar; não amplia sozinho
});

test('busca: Porto Alegre não mistura prestadores de Passo Fundo; troca de UF incompatível é erro explícito', async () => {
  const { app } = await setup();
  const poa = body(await get(app, `/v1/search/providers?uf=RS&city_ibge_id=4314902&service=banho_tosa`));
  assert.deepEqual(poa.results.map((r: any) => r.slug), ['elisa-demo']);
  const bad = await get(app, `/v1/search/providers?uf=SC&city_ibge_id=${PF}&service=passeio`);
  assert.equal(bad.statusCode, 400);
  assert.equal(body(bad).code, 'city_uf_mismatch');
  assert.equal(body(bad).field, 'city_ibge_id');
  assert.ok(body(bad).correlation_id);
});

test('busca: sem avaliações ⇒ rating nulo (nunca 5★); com avaliação mostra nota e volume', async () => {
  const { app } = await setup();
  const r = body(await get(app, `/v1/search/providers?uf=RS&city_ibge_id=4314902&service=banho_tosa`)).results[0];
  assert.equal(r.rating_avg, null); assert.equal(r.rating_count, 0);
  const c = body(await get(app, `${base}&service=hospedagem_domiciliar`)).results[0];
  assert.equal(c.rating_avg, 4.9); assert.equal(c.rating_count, 12);
  assert.equal(c.badges.identity_verified, true); assert.equal(c.badges.professional, true);
  assert.equal(c.is_demo, true);
});

test('busca: nenhuma resposta pública contém campos privados (varredura profunda)', async () => {
  const { app, ids } = await setup();
  const urls = [`${base}&service=passeio`, `${base}&service=hospedagem_domiciliar&species=all`, '/v1/providers/carla-demo', '/v1/regions?uf=RS', `/v1/listings/${ids.listings.carlaHospedagem}/availability?from=2031-01-01T10:00:00Z&to=2031-01-03T10:00:00Z`];
  for (const u of urls) {
    const raw = (await get(app, u)).body;
    for (const k of keysDeep(JSON.parse(raw))) assert.ok(!FORBIDDEN_PUBLIC_KEYS.includes(k as any), `${u} expõe ${k}`);
    assert.ok(!/@|\+55|\d{3}\.\d{3}\.\d{3}-\d{2}/.test(raw), `${u} contém e-mail/telefone/CPF`);
  }
});

test('busca por datas: prestador sem capacidade sai do resultado e o motivo é explicado', async () => {
  const { app, pg, ids } = await setup();
  const dates = 'from=2031-02-01T10:00:00Z&to=2031-02-01T11:00:00Z';
  assert.equal(body(await get(app, `${base}&service=passeio&species=dog&${dates}`)).results.length, 2);
  // Diego tem 1 unidade: uma reserva paga/segurada tira ele da busca
  const rid = (await pg.query(`select set_config('app.user_id', $1, false)`, [ids.users.ana]), null);
  void rid;
  await pg.exec(`set role cuidope_app`);
  await pg.query(`select set_config('app.user_id', $1, false)`, [ids.users.ana]);
  const req = (await pg.query(`select app.create_request($1,'[2031-02-01T10:00:00Z,2031-02-01T11:00:00Z)'::tstzrange,'oi',$2::uuid[]) as id`, [ids.listings.diegoPasseio, [ids.pets.thor]])).rows[0] as any;
  await pg.exec(`reset role`);
  await pg.exec(`set role cuidope_app`);
  await pg.query(`select set_config('app.user_id', $1, false)`, [ids.users.diego]);
  const qid = ((await pg.query(`select app.send_quote($1,'[{"description":"Passeio","quantity":1,"unit_price_cents":5000}]'::jsonb, now() + interval '2 days','{}'::jsonb) as id`, [req.id])).rows[0] as any).id;
  await pg.exec(`reset role; set role cuidope_app`);
  await pg.query(`select set_config('app.user_id', $1, false)`, [ids.users.ana]);
  await pg.query(`select app.accept_quote($1,'api-key-00001')`, [qid]);
  await pg.exec(`reset role`);
  const after = body(await get(app, `${base}&service=passeio&species=dog&${dates}`));
  assert.deepEqual(after.results.map((r: any) => r.slug), ['carla-demo']);
  const only = body(await get(app, `${base}&service=passeio&species=dog&size=small&${dates}`));
  assert.equal(only.results.length, 1);
  // Diego é o único que atende cães grandes? não — ele só aceita small/medium: filtro de porte
  const large = body(await get(app, `${base}&service=passeio&species=dog&size=large`));
  assert.deepEqual(large.results.map((r: any) => r.slug), ['carla-demo']);
});

test('busca: validação de parâmetros (datas parciais, limites, cursor inválido)', async () => {
  const { app } = await setup();
  for (const [qs, field] of [['&from=2031-02-01T10:00:00Z', 'to'], ['&from=2031-02-01T10:00:00Z&to=2031-01-01T10:00:00Z', 'to'], ['&limit=500', 'limit'], ['&species=bird', 'species'], ['&pets=0', 'pets']] as const) {
    const r = await get(app, `${base}&service=passeio${qs}`);
    assert.equal(r.statusCode, 400, qs); assert.equal(body(r).code, 'validation_error'); assert.equal(body(r).field, field, qs);
  }
  const c = await get(app, `${base}&service=passeio&cursor=lixo`);
  assert.equal(body(c).code, 'invalid_cursor');
  assert.equal((await get(app, `/v1/search/providers?uf=RS&service=passeio`)).statusCode, 400);   // cidade obrigatória
});

test('busca: paginação por cursor é estável e sem repetição', async () => {
  const { app } = await setup();
  const p1 = body(await get(app, `${base}&service=passeio&limit=1`));
  assert.equal(p1.results.length, 1); assert.ok(p1.next_cursor);
  const p2 = body(await get(app, `${base}&service=passeio&limit=1&cursor=${p1.next_cursor}`));
  assert.equal(p2.results.length, 1); assert.equal(p2.next_cursor, null);
  assert.notEqual(p1.results[0].slug, p2.results[0].slug);
  assert.ok(p1.results[0].ranking.score >= p2.results[0].ranking.score);
  assert.match(p1.results[0].ranking.impression_id, /^[0-9a-f-]{36}$/);
  assert.match(p1.results[0].ranking.why, /^Aparece porque /);
});

test('busca: perfil suspenso nunca aparece; patrocínio não existe sem campanha', async () => {
  const { app, pg } = await setup();
  await pg.exec(`update public.provider_profiles set status = 'suspended' where slug = 'carla-demo'`);
  const r = body(await get(app, `${base}&service=passeio`));
  assert.deepEqual(r.results.map((x: any) => x.slug), ['diego-demo']);
  assert.deepEqual(r.sponsored, []);
});

test('perfil público: projeção segura, 404 para inexistente/não publicado, slug malicioso recusado', async () => {
  const { app, pg } = await setup();
  const ok = await get(app, '/v1/providers/carla-demo');
  assert.equal(ok.statusCode, 200);
  assert.equal(body(ok).provider.services.length, 2);
  assert.equal(body(ok).reviews.items.length, 0);
  assert.deepEqual(Object.keys(body(ok).reviews.distribution), ['1', '2', '3', '4', '5']);
  assert.equal((await get(app, '/v1/providers/nao-existe')).statusCode, 404);
  assert.equal((await get(app, `/v1/providers/${encodeURIComponent("x'; drop table users;--")}`)).statusCode, 404);
  await pg.exec(`update public.provider_profiles set status = 'draft' where slug = 'diego-demo'`.replace("'draft'", "'suspended'"));
  assert.equal((await get(app, '/v1/providers/diego-demo')).statusCode, 404);
});

test('regiões: cidades habilitadas por UF com bairros (selects dependentes)', async () => {
  const { app } = await setup();
  const r = body(await get(app, '/v1/regions?uf=rs'));
  assert.deepEqual(r.cities.map((c: any) => c.name), ['Passo Fundo', 'Porto Alegre']);
  assert.deepEqual(r.cities[0].neighborhoods.map((n: any) => n.name), ['Centro', 'São Cristóvão']);
  assert.deepEqual(body(await get(app, '/v1/regions?uf=SC')).cities, []);
});

test('distância: bairro informado favorece quem está mais perto (centroide aproximado)', async () => {
  const { app, ids } = await setup();
  const near = body(await get(app, `${base}&service=passeio&neighborhood_id=${ids.regions.centro}`)).results;
  const far = body(await get(app, `${base}&service=passeio&neighborhood_id=${ids.regions.saoCristovao}`)).results;
  const score = (res: any[], slug: string) => res.find((x) => x.slug === slug).ranking.score;
  assert.ok(score(near, 'carla-demo') > score(far, 'carla-demo'));
  assert.ok(score(far, 'diego-demo') > score(near, 'diego-demo'));
  assert.equal(body(await get(app, `${base}&service=passeio&neighborhood_id=${ids.regions.moinhos}`)).code, 'neighborhood_not_found');
});

// ── Webhook ────────────────────────────────────────────────────────────────
async function pendingPayment(pg: any, ids: DemoIds) {
  await pg.exec(`set role cuidope_app`);
  await pg.query(`select set_config('app.user_id', $1, false)`, [ids.users.ana]);
  const rid = (await pg.query(`select app.create_request($1,'[2031-05-01T10:00:00Z,2031-05-03T10:00:00Z)'::tstzrange,'oi',$2::uuid[]) as id`, [ids.listings.carlaHospedagem, [ids.pets.thor]])).rows[0].id;
  await pg.exec(`reset role; set role cuidope_app`);
  await pg.query(`select set_config('app.user_id', $1, false)`, [ids.users.carla]);
  const qid = (await pg.query(`select app.send_quote($1,'[{"description":"Hospedagem","quantity":2,"unit_price_cents":12000}]'::jsonb, now() + interval '2 days','{}'::jsonb) as id`, [rid])).rows[0].id;
  await pg.exec(`reset role; set role cuidope_app`);
  await pg.query(`select set_config('app.user_id', $1, false)`, [ids.users.ana]);
  const res = (await pg.query(`select app.accept_quote($1,'wh-key-000001') as r`, [qid])).rows[0].r;
  await pg.exec(`reset role`);
  await pg.query(`select app.register_payment($1,'sandbox','pay_wh_1','pix')`, [res.order_id]);
  return res;
}
const hook = (app: any, payload: object, sig?: string) => {
  const raw = JSON.stringify(payload);
  return app.inject({ method: 'POST', url: '/v1/webhooks/sandbox', payload: raw, headers: { 'content-type': 'application/json', 'x-signature': sig ?? sign(raw) } });
};

test('webhook: assinatura inválida/ausente é 401 e nada é persistido', async () => {
  const { app, pg } = await setup();
  const evt = { event_id: 'evt_bad', type: 'PAYMENT_CONFIRMED', payment_id: 'pay_wh_1' };
  assert.equal((await hook(app, evt, 'a'.repeat(64))).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/webhooks/sandbox', payload: JSON.stringify(evt), headers: { 'content-type': 'application/json' } })).statusCode, 401);
  assert.equal((await hook(app, evt)).statusCode, 200);
  assert.equal((await pg.query(`select count(*)::int c from public.webhook_inbox`)).rows[0].c, 1);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/webhooks/outro', payload: '{}', headers: { 'content-type': 'application/json', 'x-signature': sign('{}') } })).statusCode, 404);
});

test('webhook: confirma a reserva uma única vez; repetição é deduplicada; payload adulterado é recusado', async () => {
  const { app, pg, ids } = await setup();
  const res = await pendingPayment(pg, ids);
  const evt = { event_id: 'evt_1', type: 'PAYMENT_CONFIRMED', payment_id: 'pay_wh_1' };
  const raw = JSON.stringify(evt);
  const sig = sign(raw);
  const tampered = await app.inject({ method: 'POST', url: '/v1/webhooks/sandbox', payload: raw.replace('pay_wh_1', 'pay_wh_2'), headers: { 'content-type': 'application/json', 'x-signature': sig } });
  assert.equal(tampered.statusCode, 401);
  const r1 = body(await hook(app, evt));
  assert.deepEqual([r1.duplicate, r1.processed], [false, 'confirmed']);
  const r2 = body(await hook(app, evt));
  assert.deepEqual([r2.duplicate, r2.processed], [true, 'already_processed']);
  assert.equal((await pg.query(`select status from public.bookings where id=$1`, [res.booking_id])).rows[0].status, 'confirmed');
  assert.equal((await pg.query(`select count(*)::int c from public.ledger_transactions`)).rows[0].c, 1);
});

test('webhook: evento antes do registro do pagamento fica pendente e é recuperado pelo worker (sem perder dinheiro)', async () => {
  const { app, pg, ids } = await setup();
  const res = await pendingPayment(pg, ids);
  const early = await hook(app, { event_id: 'evt_early', type: 'PAYMENT_CONFIRMED', payment_id: 'pay_ainda_nao_existe' });
  assert.equal(body(early).processed, 'failed');
  assert.equal(early.statusCode, 200);                       // persistido ⇒ PSP não precisa reenviar
  const row = (await pg.query(`select attempts, last_error, processed_at from public.webhook_inbox`)).rows[0] as any;
  assert.equal(row.attempts, 1); assert.match(row.last_error, /payment_not_found/); assert.equal(row.processed_at, null);
  await pg.exec(`update public.payments set external_id = 'pay_ainda_nao_existe' where external_id = 'pay_wh_1'`);   // pagamento "aparece"
  assert.equal(await retryPendingWebhooks(app.db, new SandboxProvider(SECRET)), 1);
  assert.equal((await pg.query(`select status from public.bookings where id=$1`, [res.booking_id])).rows[0].status, 'confirmed');
  assert.equal(await retryPendingWebhooks(app.db, new SandboxProvider(SECRET)), 0);
});

test('webhook: tipos desconhecidos são guardados e ignorados; payload malformado é 400', async () => {
  const { app, pg } = await setup();
  const r = body(await hook(app, { event_id: 'evt_x', type: 'ALGO_NOVO', payment_id: 'pay_1' }));
  assert.equal(r.processed, 'ignored');
  assert.match((await pg.query(`select last_error from public.webhook_inbox`)).rows[0].last_error, /ignorado/);
  const raw = '{"event_id": 1}';
  assert.equal((await app.inject({ method: 'POST', url: '/v1/webhooks/sandbox', payload: raw, headers: { 'content-type': 'application/json', 'x-signature': sign(raw) } })).statusCode, 400);
});

test('rota inexistente devolve problema padronizado com correlation_id', async () => {
  const { app } = await setup();
  const r = await get(app, '/v1/nada');
  assert.equal(r.statusCode, 404);
  assert.equal(body(r).code, 'not_found'); assert.ok(body(r).correlation_id);
  assert.match(String(r.headers['content-type']), /application\/problem\+json/);
});
