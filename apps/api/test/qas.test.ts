import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../../../database/testdb.ts';
import { seedDemo } from '../../../database/seed/demo.ts';
import { buildApp } from '../src/app.ts';

const SECRET = 'segredo-de-teste-1234567890';
const FROM = '2031-03-10T15:00:00.000Z';
const TO = '2031-03-12T11:00:00.000Z';

async function setup(qas = true) {
  const pg = await createDb();
  const ids = await seedDemo(pg);
  const app = await buildApp({ runner: pg, webhookSecret: SECRET, qas });
  return { pg, ids, app };
}
type App = Awaited<ReturnType<typeof setup>>['app'];
const body = (r: any) => JSON.parse(r.body);
const call = (app: App, persona: string | null, method: 'GET' | 'POST', url: string, payload?: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method, url, headers: { 'content-type': 'application/json', ...(persona ? { 'x-qas-persona': persona } : {}), ...headers }, ...(method === 'POST' ? { payload: JSON.stringify(payload ?? {}) } : {}) });
const ok = async (r: any, status = 200) => { assert.equal(r.statusCode, status, r.body); return body(r); };
const fails = (r: any, status: number, code: string) => { assert.equal(r.statusCode, status, r.body); assert.equal(body(r).code, code); };

async function listingOf(app: App, slug: string, category: string): Promise<string> {
  const p = body(await app.inject({ method: 'GET', url: `/v1/providers/${slug}` }));
  return p.provider.services.find((s: any) => s.category === category).listing_id;
}
async function petIds(app: App, persona: string): Promise<Record<string, string>> {
  return Object.fromEntries((await ok(await call(app, persona, 'GET', '/v1/me/pets'))).items.map((p: any) => [p.name, p.id]));
}
const ITEMS = [{ description: 'Hospedagem', quantity: 2, unit_price_cents: 12000 }];
async function requestAndQuote(app: App, o: { tutor: string; provider: string; slug: string; category: string; pets: string[]; from?: string; to?: string; items?: typeof ITEMS }) {
  const listing = await listingOf(app, o.slug, o.category);
  const rid = (await ok(await call(app, o.tutor, 'POST', '/v1/me/requests', { listing_id: listing, from: o.from ?? FROM, to: o.to ?? TO, pet_ids: o.pets, message: 'Olá!' }), 201)).request_id;
  const qid = (await ok(await call(app, o.provider, 'POST', `/v1/me/requests/${rid}/quotes`, { items: o.items ?? ITEMS, valid_hours: 48, location: 'Casa' }), 201)).quote_id;
  return { rid, qid, listing };
}
const accept = (app: App, persona: string, qid: string, key = 'qas-key-0001') => call(app, persona, 'POST', `/v1/me/quotes/${qid}/accept`, {}, { 'idempotency-key': key });

test('QAS: tutor busca → pede → prestador propõe → tutor aceita e paga (sandbox) → prestador atende → tutor avalia → prestador responde', async () => {
  const { app } = await setup();
  const me = await ok(await call(app, 'ana', 'GET', '/v1/me'));
  assert.deepEqual(me.roles, ['tutor']); assert.equal(me.provider, null); assert.equal(me.sandbox_payments, true);

  const pets = await petIds(app, 'ana');
  const { rid, qid } = await requestAndQuote(app, { tutor: 'ana', provider: 'carla', slug: 'carla-demo', category: 'hospedagem_domiciliar', pets: [pets.Thor!] });

  // Prestadora vê o pedido sem o nome do pet (privacidade até a reserva); outra prestadora não vê nada.
  const inbox = (await ok(await call(app, 'carla', 'GET', '/v1/me/requests?as=provider'))).items;
  assert.equal(inbox.length, 1); assert.equal(inbox[0].tutor_name, 'Ana (demo)'); assert.equal(inbox[0].pets[0].name, null); assert.equal(inbox[0].pets[0].species, 'dog');
  assert.equal((await ok(await call(app, 'diego', 'GET', '/v1/me/requests?as=provider'))).items.length, 0);

  // Tutor vê a proposta com itens e total derivado pelo servidor.
  const detail = await ok(await call(app, 'ana', 'GET', `/v1/me/requests/${rid}`));
  assert.equal(detail.status, 'quoted'); assert.equal(detail.quotes[0].total_cents, 24_000); assert.equal(detail.quotes[0].items.length, 1);

  // Aceite exige Idempotency-Key e é idempotente.
  fails(await call(app, 'ana', 'POST', `/v1/me/quotes/${qid}/accept`, {}), 400, 'idempotency_key_required');
  const a1 = await ok(await accept(app, 'ana', qid)); const a2 = await ok(await accept(app, 'ana', qid));
  assert.equal(a1.total_cents, 24_000); assert.equal(a1.booking_id, a2.booking_id);

  // Pix sandbox: gerado uma vez, reaproveitado depois; nunca "pagável".
  const pix = await ok(await call(app, 'ana', 'POST', `/v1/me/orders/${a1.order_id}/pix`));
  assert.match(pix.payment_id, /^sbx_/); assert.match(pix.copy_paste, /NAO-PAGAVEL/); assert.equal(pix.amount_cents, 24_000); assert.equal(pix.reused, false);
  assert.equal((await ok(await call(app, 'ana', 'POST', `/v1/me/orders/${a1.order_id}/pix`))).reused, true);
  let bk = (await ok(await call(app, 'ana', 'GET', '/v1/me/bookings?as=tutor'))).items[0];
  assert.equal(bk.status, 'awaiting_payment'); assert.equal(bk.pending_payment_id, pix.payment_id);
  assert.equal((await ok(await call(app, 'carla', 'GET', '/v1/me/bookings?as=provider'))).items[0].status, 'awaiting_payment');

  // Só o comprador simula o pagamento; o aviso passa pelo webhook assinado e é deduplicado.
  fails(await call(app, 'bruno', 'POST', `/v1/me/payments/${pix.payment_id}/simulate`, {}), 404, 'payment_not_found');
  const s1 = await ok(await call(app, 'ana', 'POST', `/v1/me/payments/${pix.payment_id}/simulate`, {}));
  assert.equal(s1.http_status, 200); assert.equal(s1.webhook.processed, 'confirmed'); assert.equal(s1.webhook.duplicate, false);
  const s2 = await ok(await call(app, 'ana', 'POST', `/v1/me/payments/${pix.payment_id}/simulate`, { event_id: s1.event_id }));
  assert.equal(s2.webhook.duplicate, true); assert.equal(s2.webhook.processed, 'already_processed');
  bk = (await ok(await call(app, 'ana', 'GET', '/v1/me/bookings?as=tutor'))).items[0];
  assert.equal(bk.status, 'confirmed'); assert.equal(bk.pending_payment_id, null);
  assert.deepEqual(bk.pets, ['Thor']);   // após a reserva, o prestador passa a receber o nome (snapshot do plano de cuidados)

  // Ciclo de atendimento: tutor não conclui; prestadora conclui; estado final é terminal.
  fails(await call(app, 'ana', 'POST', `/v1/me/bookings/${bk.id}/status`, { to: 'completed' }), 403, 'forbidden');
  for (const to of ['ready', 'in_progress', 'completed']) await ok(await call(app, 'carla', 'POST', `/v1/me/bookings/${bk.id}/status`, { to }));
  fails(await call(app, 'carla', 'POST', `/v1/me/bookings/${bk.id}/status`, { to: 'cancelled' }), 409, 'invalid_transition');

  // Avaliação: só o tutor da reserva, uma vez; prestadora responde; resposta fica pública.
  fails(await call(app, 'carla', 'POST', `/v1/me/bookings/${bk.id}/review`, { communication: 5, punctuality: 5, care: 5, match: 5 }), 404, 'booking_not_found');
  await ok(await call(app, 'ana', 'POST', `/v1/me/bookings/${bk.id}/review`, { communication: 5, punctuality: 4, care: 5, match: 5, comment: 'Cuidou muito bem do Thor' }), 201);
  fails(await call(app, 'ana', 'POST', `/v1/me/bookings/${bk.id}/review`, { communication: 5, punctuality: 4, care: 5, match: 5 }), 409, 'duplicate');
  assert.equal((await ok(await call(app, 'ana', 'GET', '/v1/me/bookings?as=tutor'))).items[0].has_review, true);
  const reviews = (await ok(await call(app, 'carla', 'GET', '/v1/me/provider/reviews'))).items;
  assert.equal(reviews.length, 1);
  fails(await call(app, 'ana', 'POST', `/v1/me/reviews/${reviews[0].id}/reply`, { text: 'Obrigada' }), 404, 'review_not_found');
  await ok(await call(app, 'carla', 'POST', `/v1/me/reviews/${reviews[0].id}/reply`, { text: 'Obrigada pela confiança!' }));
  const pub = body(await app.inject({ method: 'GET', url: '/v1/providers/carla-demo' }));
  assert.equal(pub.reviews.items[0].provider_reply, 'Obrigada pela confiança!'); assert.ok(pub.provider.rating_count >= 1);

  // Painel: R$240 pagos e concluídos → comissão de 12% (R$28,80) e líquido de R$211,20.
  const dash = await ok(await call(app, 'carla', 'GET', '/v1/me/provider'));
  assert.deepEqual(dash.earnings_estimate.completed, { gross: 24_000, commission: 2_880, net: 21_120 });
  assert.equal(dash.listings.length, 2);
});

test('QAS: persona obrigatória, isolamento entre usuários e regras do banco valem pela API', async () => {
  const { app } = await setup();
  fails(await call(app, null, 'GET', '/v1/me'), 401, 'persona_required');
  fails(await call(app, 'moderadora', 'GET', '/v1/me'), 401, 'persona_required');
  assert.deepEqual((await ok(await call(app, 'carla', 'GET', '/v1/me'))).roles, ['provider', 'tutor']);

  const ana = await petIds(app, 'ana'); const bruno = await petIds(app, 'bruno');
  assert.deepEqual(Object.keys(bruno), ['Luna']);                                         // Bruno não vê pets da Ana
  const carlaListing = await listingOf(app, 'carla-demo', 'hospedagem_domiciliar');
  fails(await call(app, 'carla', 'POST', '/v1/me/requests', { listing_id: carlaListing, from: FROM, to: TO, pet_ids: [ana.Thor!], message: '' }), 422, 'self_request');
  fails(await call(app, 'bruno', 'POST', '/v1/me/requests', { listing_id: carlaListing, from: FROM, to: TO, pet_ids: [ana.Thor!], message: '' }), 403, 'pet_not_owned');
  assert.equal((await call(app, 'bruno', 'POST', '/v1/me/requests', { listing_id: carlaListing, from: TO, to: FROM, pet_ids: [bruno.Luna!], message: '' })).statusCode, 400);   // fim antes do início

  const { rid, qid } = await requestAndQuote(app, { tutor: 'ana', provider: 'carla', slug: 'carla-demo', category: 'hospedagem_domiciliar', pets: [ana.Thor!] });
  fails(await accept(app, 'bruno', qid, 'steal-key-0001'), 403, 'forbidden');                                    // aceitar proposta alheia
  fails(await call(app, 'diego', 'POST', `/v1/me/requests/${rid}/quotes`, { items: ITEMS, valid_hours: 24, location: '' }), 403, 'forbidden');   // outro prestador
  fails(await call(app, 'ana', 'POST', `/v1/me/requests/${rid}/quotes`, { items: ITEMS, valid_hours: 24, location: '' }), 403, 'forbidden');     // tutor não propõe
  assert.equal((await call(app, 'carla', 'POST', `/v1/me/requests/${rid}/quotes`, { items: [{ description: 'x', quantity: 1, unit_price_cents: 10.5 }], valid_hours: 24 })).statusCode, 400);   // dinheiro só em centavos inteiros
});

test('QAS: revisão de proposta, recusa e cancelamento', async () => {
  const { app } = await setup();
  const ana = await petIds(app, 'ana');
  const first = await requestAndQuote(app, { tutor: 'ana', provider: 'carla', slug: 'carla-demo', category: 'hospedagem_domiciliar', pets: [ana.Thor!] });
  const q2 = (await ok(await call(app, 'carla', 'POST', `/v1/me/requests/${first.rid}/quotes`, { items: [{ description: 'Hospedagem', quantity: 3, unit_price_cents: 12000 }], valid_hours: 48, location: 'Casa' }), 201)).quote_id;
  fails(await accept(app, 'ana', first.qid, 'old-key-00001'), 409, 'quote_not_open');                         // versão antiga foi substituída
  assert.equal((await ok(await accept(app, 'ana', q2, 'new-key-00001'))).total_cents, 36_000);

  const second = await requestAndQuote(app, { tutor: 'ana', provider: 'diego', slug: 'diego-demo', category: 'passeio', pets: [ana.Thor!], from: '2031-04-01T10:00:00.000Z', to: '2031-04-01T11:00:00.000Z', items: [{ description: 'Passeio', quantity: 1, unit_price_cents: 4000 }] });
  await ok(await call(app, 'diego', 'POST', `/v1/me/requests/${second.rid}/decline`, { reason: 'Agenda cheia' }));
  const d = await ok(await call(app, 'ana', 'GET', `/v1/me/requests/${second.rid}`));
  assert.equal(d.status, 'declined'); assert.equal(d.decline_reason, 'Agenda cheia');
  fails(await accept(app, 'ana', second.qid, 'dec-key-00001'), 409, 'request_closed');                        // pedido recusado não vira reserva
  assert.equal((await ok(await call(app, 'ana', 'GET', '/v1/me/bookings?as=tutor'))).items.length, 1);      // só a reserva do primeiro pedido

  const listing = await listingOf(app, 'diego-demo', 'passeio');
  const rid = (await ok(await call(app, 'ana', 'POST', '/v1/me/requests', { listing_id: listing, from: '2031-05-01T10:00:00.000Z', to: '2031-05-01T11:00:00.000Z', pet_ids: [ana.Thor!], message: '' }), 201)).request_id;
  fails(await call(app, 'diego', 'POST', `/v1/me/requests/${rid}/cancel`, {}), 403, 'forbidden');           // só o tutor cancela o pedido
  await ok(await call(app, 'ana', 'POST', `/v1/me/requests/${rid}/cancel`, {}));
  assert.equal((await ok(await call(app, 'ana', 'GET', `/v1/me/requests/${rid}`))).status, 'cancelled');
});

test('QAS: o último lugar é vendido uma vez; reserva expirada libera a vaga', async () => {
  const { app } = await setup();
  const ana = await petIds(app, 'ana'); const bruno = await petIds(app, 'bruno');
  await ok(await call(app, 'ana', 'POST', '/v1/me/pets', { name: 'Rex', species_code: 'dog', size: 'small' }), 201);
  const rex = (await petIds(app, 'ana')).Rex!;

  // Carla tem 2 vagas: Ana fecha as duas; Bruno recebe erro claro e não fica com reserva órfã.
  const a = await requestAndQuote(app, { tutor: 'ana', provider: 'carla', slug: 'carla-demo', category: 'hospedagem_domiciliar', pets: [ana.Thor!, rex] });
  const acc = await ok(await accept(app, 'ana', a.qid, 'cap-key-0001'));
  const b = await requestAndQuote(app, { tutor: 'bruno', provider: 'carla', slug: 'carla-demo', category: 'hospedagem_domiciliar', pets: [bruno.Luna!] });
  fails(await accept(app, 'bruno', b.qid, 'cap-key-0002'), 409, 'capacity_unavailable');
  assert.equal((await ok(await call(app, 'bruno', 'GET', '/v1/me/bookings?as=tutor'))).items.length, 0);

  // Ana deixa o hold vencer (QAS força o relógio): reserva cancelada e Bruno consegue.
  const booking = (await ok(await call(app, 'ana', 'GET', '/v1/me/bookings?as=tutor'))).items[0];
  await ok(await call(app, 'ana', 'POST', `/v1/me/orders/${acc.order_id}/pix`));
  fails(await call(app, 'bruno', 'POST', `/v1/me/bookings/${booking.id}/qas-expire-hold`, {}), 404, 'booking_not_found');
  assert.equal((await ok(await call(app, 'ana', 'POST', `/v1/me/bookings/${booking.id}/qas-expire-hold`, {}))).expired, 1);
  assert.equal((await ok(await call(app, 'ana', 'GET', '/v1/me/bookings?as=tutor'))).items[0].status, 'cancelled');
  assert.equal((await ok(await accept(app, 'bruno', b.qid, 'cap-key-0003'))).total_cents, 24_000);
});

test('QAS: interface estática com CSP restrita; rotas ausentes fora do modo QAS; recusado em produção', async () => {
  const { app } = await setup();
  const page = await app.inject({ method: 'GET', url: '/qas' });
  assert.equal(page.statusCode, 200); assert.match(page.headers['content-type'] as string, /text\/html/);
  const csp = page.headers['content-security-policy'] as string;
  assert.match(csp, /script-src 'self'/); assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.doesNotMatch(page.body, /<script(?![^>]*\bsrc=)[^>]*>/i);                                  // nada de script inline
  assert.match(page.body, /AMBIENTE DE TESTE \(QAS\)/);
  assert.equal((await app.inject({ method: 'GET', url: '/qas/app.js' })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/qas/app.css' })).statusCode, 200);
  assert.match((await app.inject({ method: 'GET', url: '/v1/health' })).headers['content-security-policy'] as string, /default-src 'none'/);   // API segue com CSP fechada

  const off = await setup(false);
  assert.equal((await call(off.app, 'ana', 'GET', '/v1/me')).statusCode, 404);
  assert.equal((await off.app.inject({ method: 'GET', url: '/qas' })).statusCode, 404);

  const prev = process.env.CUIDOPE_ENV;
  process.env.CUIDOPE_ENV = 'production';
  try { await assert.rejects(() => setup(true), /proibido em produção/); } finally { if (prev === undefined) delete process.env.CUIDOPE_ENV; else process.env.CUIDOPE_ENV = prev; }
});
