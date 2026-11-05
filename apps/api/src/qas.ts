import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { SPECIES, SIZES } from '../../../packages/contracts/src/index.ts';
import { holdExpiry, splitCommission } from '../../../packages/domain/src/index.ts';
import type { SandboxProvider } from '../../../packages/providers/src/index.ts';
import type { Db, Query } from './db.ts';
import { AppError } from './errors.ts';

/**
 * MODO QAS — somente para homologação com dados de DEMONSTRAÇÃO.
 *
 * NÃO é autenticação. A "persona" é escolhida pelo cabeçalho X-QAS-Persona entre usuários fictícios
 * (`auth_subject = 'demo|<nome>'`). As rotas só existem quando o servidor sobe com CUIDOPE_ENV=qas e
 * `buildApp` recusa `qas: true` em produção. A autenticação real (ADR 0002) substituirá este módulo.
 * Todas as regras continuam no banco: cada chamada roda com o papel `cuidope_app` e `app.user_id` da persona,
 * então RLS e funções SECURITY DEFINER valem exatamente como valerão com login real.
 */
export const PERSONAS = ['ana', 'bruno', 'carla', 'diego', 'elisa'] as const;

const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web-qas');
const ASSETS: Record<string, { file: string; type: string }> = {
  '/qas': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/qas/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/qas/app.css': { file: 'app.css', type: 'text/css; charset=utf-8' },
};
const QAS_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** Mensagens em pt-BR para os códigos levantados pelas funções SQL (nunca devolvemos texto bruto do banco). */
const MESSAGES: Record<string, [number, string]> = {
  unauthenticated: [401, 'Escolha uma persona de teste'],
  listing_unavailable: [409, 'Este serviço não está disponível'],
  no_pets: [422, 'Selecione ao menos um pet'],
  self_request: [422, 'Você não pode contratar o seu próprio serviço'],
  blocked: [403, 'Contato bloqueado entre as partes'],
  pet_not_owned: [403, 'Esse pet não pertence a você'],
  request_not_found: [404, 'Pedido não encontrado'],
  forbidden: [403, 'Você não tem permissão para esta ação'],
  request_closed: [409, 'Este pedido foi encerrado (recusado, cancelado, aceito ou expirado)'],
  quote_validity_in_past: [422, 'A validade da proposta precisa estar no futuro'],
  quote_empty: [422, 'A proposta precisa ter valor maior que zero'],
  quote_not_found: [404, 'Proposta não encontrada'],
  quote_not_open: [409, 'Esta proposta não está mais aberta (foi substituída, aceita ou encerrada)'],
  quote_expired: [409, 'A proposta expirou'],
  species_not_accepted: [422, 'O prestador não atende essa espécie'],
  size_not_accepted: [422, 'O prestador não atende esse porte'],
  not_enabled_in_region: [422, 'Serviço ainda não habilitado nesta região para essa espécie'],
  capacity_unavailable: [409, 'Sem vaga neste período: outro tutor reservou antes'],
  idempotency_key_required: [400, 'Chave de idempotência ausente'],
  booking_not_found: [404, 'Reserva não encontrada'],
  status_not_settable: [422, 'Este status não pode ser definido manualmente'],
  invalid_transition: [409, 'Transição de status não permitida a partir do estado atual'],
  review_booking_not_completed: [409, 'Só é possível avaliar depois que o serviço for concluído'],
  review_not_tutor: [403, 'Somente o tutor da reserva pode avaliar'],
  review_window_closed: [409, 'O prazo de 14 dias para avaliar acabou'],
  order_not_payable: [409, 'Este pedido não está aguardando pagamento'],
  payment_not_found: [404, 'Pagamento não encontrado'],
};
const SQLSTATE: Record<string, [number, string, string]> = {
  '42501': [403, 'forbidden', 'Você não tem permissão para esta ação'],
  '23505': [409, 'duplicate', 'Registro já existente (ex.: uma avaliação por reserva)'],
  '23514': [422, 'rule_violation', 'A regra de negócio não permitiu esta operação'],
  'P0002': [404, 'not_found', 'Registro não encontrado'],
};

export function mapDbError(e: unknown): unknown {
  if (e instanceof AppError) return e;
  const err = e as { message?: string; code?: string };
  const msg = String(err?.message ?? '');
  const first = msg.split(/[:\s]/)[0] ?? '';
  const hit = MESSAGES[first];
  if (hit) return new AppError(hit[0], first, hit[1]);
  if (/row-level security|permission denied/i.test(msg)) return new AppError(403, 'forbidden', 'Você não tem permissão para esta ação');
  const st = err?.code ? SQLSTATE[err.code] : undefined;
  return st ? new AppError(st[0], st[1], st[2]) : e;
}

const Uuid = z.uuid();
const Iso = z.iso.datetime({ offset: true });
const PetBody = z.object({
  name: z.string().trim().min(1).max(40),
  species_code: z.enum(SPECIES),
  size: z.enum(SIZES),
  breed: z.string().trim().max(60).optional(),
  age_band: z.enum(['puppy', 'adult', 'senior']).optional(),
});
const RequestBody = z.object({
  listing_id: Uuid, from: Iso, to: Iso, pet_ids: z.array(Uuid).min(1).max(10), message: z.string().trim().max(1000).default(''),
}).refine((b) => new Date(b.to) > new Date(b.from), { message: 'o fim deve ser posterior ao início', path: ['to'] });
const QuoteBody = z.object({
  items: z.array(z.object({ description: z.string().trim().min(1).max(120), quantity: z.number().int().min(1).max(365), unit_price_cents: z.number().int().min(1).max(10_000_000) })).min(1).max(10),
  valid_hours: z.number().int().min(1).max(168).default(48),
  location: z.string().trim().max(200).default(''),
});
const StatusBody = z.object({ to: z.enum(['ready', 'in_progress', 'completed', 'interrupted', 'no_show', 'cancelled']) });
const ReviewBody = z.object({
  communication: z.number().int().min(1).max(5), punctuality: z.number().int().min(1).max(5), care: z.number().int().min(1).max(5), match: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});
const ReplyBody = z.object({ text: z.string().trim().min(1).max(1000) });
const DeclineBody = z.object({ reason: z.string().trim().max(300).optional() });
const SimulateBody = z.object({ event_id: z.string().regex(/^[A-Za-z0-9_-]{3,60}$/).optional() }).default({});
const RoleQuery = z.object({ as: z.enum(['tutor', 'provider']).default('tutor') });

export interface QasDeps { db: Db; sandbox: SandboxProvider }

export async function registerQas(app: FastifyInstance, { db, sandbox }: QasDeps): Promise<void> {
  // Página estática sem script inline: CSP própria que só permite recursos do mesmo domínio.
  for (const [url, a] of Object.entries(ASSETS)) {
    const body = readFileSync(join(WEB_DIR, a.file));
    app.get(url, async (_req, reply) => reply.header('content-type', a.type).header('content-security-policy', QAS_CSP).header('cache-control', 'no-store').send(body));
  }
  app.get('/', async (_req, reply) => reply.redirect('/qas'));

  const personas = new Map<string, { id: string; name: string }>();
  async function persona(req: FastifyRequest): Promise<{ id: string; name: string; key: string }> {
    const key = String(req.headers['x-qas-persona'] ?? '').toLowerCase();
    if (!(PERSONAS as readonly string[]).includes(key)) throw new AppError(401, 'persona_required', 'Escolha uma persona de teste (Ana, Bruno, Carla, Diego ou Elisa)');
    let p = personas.get(key);
    if (!p) {
      const row = (await db.service((sql) => sql<{ id: string; display_name: string }>(`select id, display_name from public.users where auth_subject = $1`, [`demo|${key}`])))[0];
      if (!row) throw new AppError(401, 'persona_unknown', 'Persona não existe neste banco de teste');
      p = { id: row.id, name: row.display_name };
      personas.set(key, p);
    }
    return { ...p, key };
  }
  const asApp = async <T>(userId: string, fn: (q: Query) => Promise<T>): Promise<T> => {
    try { return await db.run('cuidope_app', userId, fn); } catch (e) { throw mapDbError(e); }
  };
  const asService = async <T>(fn: (q: Query) => Promise<T>): Promise<T> => {
    try { return await db.service(fn); } catch (e) { throw mapDbError(e); }
  };
  const idParam = (req: FastifyRequest) => {
    const id = (req.params as { id: string }).id;
    if (!Uuid.safeParse(id).success) throw new AppError(404, 'not_found', 'Registro não encontrado');
    return id;
  };

  await app.register(async (v1) => {
    v1.addHook('onSend', async (_req, reply, payload) => { reply.header('cache-control', 'no-store'); return payload; });

    // ── Perfil da persona ────────────────────────────────────────────────────────
    v1.get('/me', async (req) => {
      const me = await persona(req);
      return asApp(me.id, async (sql) => {
        const roles = (await sql<{ role: string }>(`select role from public.user_roles where user_id = app.uid() order by role`)).map((r) => r.role);
        const prov = (await sql<any>(`select p.id as provider_id, p.slug, p.public_name, p.status from public.provider_profiles p where app.is_org_member(p.organization_id) limit 1`))[0] ?? null;
        return { persona: me.key, display_name: me.name, roles, provider: prov, environment: 'qas', sandbox_payments: true };
      });
    });

    // ── Pets (tutor) ─────────────────────────────────────────────────────────────
    v1.get('/me/pets', async (req) => {
      const me = await persona(req);
      return { items: await asApp(me.id, (sql) => sql(`select id, name, species_code, size, breed, age_band from public.pets where archived_at is null order by name`)) };
    });
    v1.post('/me/pets', async (req, reply) => {
      const me = await persona(req);
      const b = PetBody.parse(req.body);
      const row = await asApp(me.id, async (sql) => (await sql(`insert into public.pets(name, species_code, size, breed, age_band) values ($1,$2,$3,$4,$5) returning id, name, species_code, size, breed, age_band`,
        [b.name, b.species_code, b.size, b.breed ?? null, b.age_band ?? null]))[0]);
      return reply.status(201).send(row);
    });

    // ── Pedidos ──────────────────────────────────────────────────────────────────
    v1.post('/me/requests', async (req, reply) => {
      const me = await persona(req);
      const b = RequestBody.parse(req.body);
      const id = await asApp(me.id, async (sql) => (await sql<{ id: string }>(`select app.create_request($1, tstzrange($2::timestamptz, $3::timestamptz, '[)'), $4, $5::uuid[]) as id`, [b.listing_id, b.from, b.to, b.message, b.pet_ids]))[0]!.id);
      return reply.status(201).send({ request_id: id });
    });

    const requestSelect = `
      select r.id, r.status, lower(r.period) as period_from, upper(r.period) as period_to, r.message, r.created_at, r.decline_reason,
             v.title as listing_title, v.category_code, v.id as listing_id, pv.public_name as provider_name, pv.slug as provider_slug,
             (select u.display_name from public.users u where u.id = r.tutor_id) as tutor_name,
             (select coalesce(json_agg(json_build_object('name', p.name, 'species', rp.need_snapshot->>'species', 'size', rp.need_snapshot->>'size')), '[]'::json)
                from public.request_pets rp left join public.pets p on p.id = rp.pet_id where rp.request_id = r.id) as pets,
             (select json_build_object('id', q.id, 'version', q.version, 'status', q.status, 'total_cents', q.total_cents, 'valid_until', q.valid_until)
                from public.quotes q where q.request_id = r.id order by q.version desc limit 1) as latest_quote
        from public.service_requests r
        left join public.v_public_listings v on v.id = r.listing_id
        left join public.v_public_providers pv on pv.id = r.provider_id`;

    v1.get('/me/requests', async (req) => {
      const me = await persona(req);
      const { as } = RoleQuery.parse(req.query);
      const where = as === 'tutor' ? `r.tutor_id = app.uid()` : `app.is_provider_member(r.provider_id)`;
      return { items: await asApp(me.id, (sql) => sql(`${requestSelect} where ${where} order by r.created_at desc limit 50`)) };
    });
    v1.get('/me/requests/:id', async (req) => {
      const me = await persona(req); const id = idParam(req);
      return asApp(me.id, async (sql) => {
        const r = (await sql<any>(`${requestSelect} where r.id = $1`, [id]))[0];
        if (!r) throw new AppError(404, 'request_not_found', 'Pedido não encontrado');
        const quotes = await sql<any>(`select q.id, q.version, q.status, q.total_cents, q.valid_until, q.policy_snapshot, q.created_at from public.quotes q where q.request_id = $1 order by q.version desc`, [id]);
        const items = quotes.length ? await sql<any>(`select quote_id, description, quantity, unit_price_cents, total_cents from public.quote_items where quote_id = any($1::uuid[])`, [quotes.map((q: any) => q.id)]) : [];
        const booking = (await sql<any>(`select b.id, b.status from public.bookings b join public.quotes q on q.id = b.accepted_quote_id where q.request_id = $1 order by b.created_at desc limit 1`, [id]))[0] ?? null;
        return { ...r, quotes: quotes.map((q: any) => ({ ...q, items: items.filter((i: any) => i.quote_id === q.id) })), booking };
      });
    });
    v1.post('/me/requests/:id/cancel', async (req) => {
      const me = await persona(req); const id = idParam(req);
      await asApp(me.id, (sql) => sql(`select app.set_request_status($1, 'cancelled')`, [id]));
      return { ok: true };
    });
    v1.post('/me/requests/:id/decline', async (req) => {
      const me = await persona(req); const id = idParam(req); const b = DeclineBody.parse(req.body ?? {});
      await asApp(me.id, (sql) => sql(`select app.set_request_status($1, 'declined', $2)`, [id, b.reason ?? null]));
      return { ok: true };
    });

    // ── Propostas ────────────────────────────────────────────────────────────────
    v1.post('/me/requests/:id/quotes', async (req, reply) => {
      const me = await persona(req); const id = idParam(req); const b = QuoteBody.parse(req.body);
      const validUntil = new Date(Date.now() + b.valid_hours * 3_600_000).toISOString();
      const qid = await asApp(me.id, async (sql) => (await sql<{ id: string }>(`select app.send_quote($1, $2::jsonb, $3, $4::jsonb) as id`,
        [id, JSON.stringify(b.items), validUntil, JSON.stringify({ cancellation: 'cancel-v1', location: b.location })]))[0]!.id);
      return reply.status(201).send({ quote_id: qid });
    });
    v1.post('/me/quotes/:id/accept', async (req) => {
      const me = await persona(req); const id = idParam(req);
      const key = String(req.headers['idempotency-key'] ?? '');
      if (key.length < 8 || key.length > 80) throw new AppError(400, 'idempotency_key_required', 'Envie o cabeçalho Idempotency-Key (8 a 80 caracteres)');
      return asApp(me.id, async (sql) => (await sql<{ r: any }>(`select app.accept_quote($1, $2) as r`, [id, key]))[0]!.r);
    });

    // ── Pagamento (PSP SANDBOX — nenhum dinheiro real) ───────────────────────────
    v1.post('/me/orders/:id/pix', async (req) => {
      const me = await persona(req); const id = idParam(req);
      const order = await asApp(me.id, async (sql) => (await sql<any>(`select id, status, total_cents, booking_id from public.orders where id = $1`, [id]))[0]);
      if (!order) throw new AppError(404, 'order_not_found', 'Pedido de pagamento não encontrado');
      if (order.status !== 'awaiting_payment') throw new AppError(409, 'order_not_payable', MESSAGES.order_not_payable![1]);
      return asService(async (sql) => {
        const existing = (await sql<any>(`select external_id, pix_expires_at, amount_cents from public.payments where order_id = $1 and status = 'pending' order by created_at desc limit 1`, [id]))[0];
        if (existing) return { payment_id: existing.external_id, copy_paste: `SANDBOX-PIX-NAO-PAGAVEL-${existing.external_id}`, amount_cents: existing.amount_cents, expires_at: new Date(existing.pix_expires_at).toISOString(), sandbox: true, reused: true };
        const hold = (await sql<{ expires_at: string }>(`select expires_at from public.capacity_allocations where booking_id = $1 and status = 'held' limit 1`, [order.booking_id]))[0];
        const expiresAt = holdExpiry(new Date(), hold ? new Date(hold.expires_at) : undefined);
        const charge = await sandbox.createBookingPixCharge({ orderId: order.id, amountCents: order.total_cents, expiresAt });
        await sql(`select app.register_payment($1, 'sandbox', $2, 'pix', $3)`, [order.id, charge.externalId, charge.expiresAt.toISOString()]);
        return { payment_id: charge.externalId, copy_paste: charge.copyPaste, amount_cents: charge.amountCents, expires_at: charge.expiresAt.toISOString(), sandbox: true, reused: false };
      });
    });
    /** Simula o PSP sandbox avisando o pagamento: passa pelo MESMO caminho do webhook real (assinatura + inbox + confirmação). */
    v1.post('/me/payments/:id/simulate', async (req) => {
      const me = await persona(req);
      const external = (req.params as { id: string }).id;
      if (!/^[A-Za-z0-9_-]{3,100}$/.test(external)) throw new AppError(404, 'payment_not_found', MESSAGES.payment_not_found![1]);
      const b = SimulateBody.parse(req.body ?? {});
      const own = await asApp(me.id, async (sql) => (await sql(`select 1 as ok from public.payments where external_id = $1 and provider = 'sandbox'`, [external]))[0]);
      if (!own) throw new AppError(404, 'payment_not_found', MESSAGES.payment_not_found![1]);
      const eventId = b.event_id ?? `evt_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
      const raw = JSON.stringify({ event_id: eventId, type: 'PAYMENT_CONFIRMED', payment_id: external, status: 'CONFIRMED' });
      const res = await app.inject({ method: 'POST', url: '/v1/webhooks/sandbox', headers: { 'content-type': 'application/json', 'x-signature': sandbox.sign(raw) }, payload: raw });
      return { event_id: eventId, http_status: res.statusCode, webhook: JSON.parse(res.body) };
    });
    /** QAS: força o vencimento do hold para testar "reserva expirou antes de pagar". */
    v1.post('/me/bookings/:id/qas-expire-hold', async (req) => {
      const me = await persona(req); const id = idParam(req);
      const own = await asApp(me.id, async (sql) => (await sql(`select 1 as ok from public.bookings where id = $1 and tutor_id = app.uid()`, [id]))[0]);
      if (!own) throw new AppError(404, 'booking_not_found', MESSAGES.booking_not_found![1]);
      return asService(async (sql) => {
        await sql(`update public.capacity_allocations set expires_at = now() - interval '1 second' where booking_id = $1 and status = 'held'`, [id]);
        const n = (await sql<{ n: number }>(`select app.expire_holds() as n`))[0]!.n;
        return { expired: n };
      });
    });

    // ── Reservas ─────────────────────────────────────────────────────────────────
    v1.get('/me/bookings', async (req) => {
      const me = await persona(req);
      const { as } = RoleQuery.parse(req.query);
      const where = as === 'tutor' ? `b.tutor_id = app.uid()` : `app.is_org_member(b.organization_id)`;
      const items = await asApp(me.id, (sql) => sql(`
        select b.id, b.status, lower(b.period) as period_from, upper(b.period) as period_to, b.total_cents, b.commission_bps, b.completed_at, b.created_at,
               v.title as listing_title, v.category_code, pv.public_name as provider_name, pv.slug as provider_slug,
               (select u.display_name from public.users u where u.id = b.tutor_id) as tutor_name,
               (select coalesce(json_agg(bp.care_plan_snapshot->>'name'), '[]'::json) from public.booking_pets bp where bp.booking_id = b.id) as pets,
               (select json_build_object('id', o.id, 'status', o.status) from public.orders o where o.booking_id = b.id order by o.created_at desc limit 1) as "order",
               (select p.external_id from public.payments p join public.orders o on o.id = p.order_id where o.booking_id = b.id and p.status = 'pending' order by p.created_at desc limit 1) as pending_payment_id,
               (select p.pix_expires_at from public.payments p join public.orders o on o.id = p.order_id where o.booking_id = b.id and p.status = 'pending' order by p.created_at desc limit 1) as pending_payment_expires_at,
               exists (select 1 from public.reviews r where r.booking_id = b.id) as has_review
          from public.bookings b
          left join public.v_public_listings v on v.id = b.listing_id
          left join public.v_public_providers pv on pv.id = b.provider_id
         where ${where} order by b.created_at desc limit 50`));
      return { items };
    });
    v1.post('/me/bookings/:id/status', async (req) => {
      const me = await persona(req); const id = idParam(req); const b = StatusBody.parse(req.body);
      await asApp(me.id, (sql) => sql(`select app.set_booking_status($1, $2)`, [id, b.to]));
      return { ok: true, status: b.to };
    });
    v1.post('/me/bookings/:id/review', async (req, reply) => {
      const me = await persona(req); const id = idParam(req); const b = ReviewBody.parse(req.body);
      await asApp(me.id, async (sql) => {
        const bk = (await sql<{ provider_id: string }>(`select provider_id from public.bookings where id = $1 and tutor_id = app.uid()`, [id]))[0];
        if (!bk) throw new AppError(404, 'booking_not_found', MESSAGES.booking_not_found![1]);
        await sql(`insert into public.reviews(booking_id, provider_id, score_communication, score_punctuality, score_care, score_match, comment) values ($1,$2,$3,$4,$5,$6,$7)`,
          [id, bk.provider_id, b.communication, b.punctuality, b.care, b.match, b.comment ?? null]);
      });
      return reply.status(201).send({ ok: true });
    });

    // ── Painel do prestador ──────────────────────────────────────────────────────
    v1.get('/me/provider', async (req) => {
      const me = await persona(req);
      return asApp(me.id, async (sql) => {
        const p = (await sql<any>(`select p.id, p.slug, p.public_name, p.bio, p.status from public.provider_profiles p where app.is_org_member(p.organization_id) limit 1`))[0];
        if (!p) throw new AppError(404, 'not_a_provider', 'Esta persona não é prestadora');
        const listings = await sql(`select id, title, category_code, price_cents, price_unit, price_is_from, status from public.service_listings order by title`);
        const pub = (await sql<any>(`select rating_avg::float8 as rating_avg, rating_count, is_professional from public.v_public_providers where id = $1`, [p.id]))[0];
        const plan = (await sql<any>(`select plan_code, status from public.subscriptions order by created_at desc limit 1`))[0] ?? { plan_code: 'essencial', status: 'active' };
        const bks = await sql<{ status: string; total_cents: number; commission_bps: number }>(
          `select status, total_cents, commission_bps from public.bookings where app.is_org_member(organization_id) and status in ('confirmed','ready','in_progress','completed')`);
        const sum = (rows: typeof bks) => rows.reduce((a, r) => { const s = splitCommission(r.total_cents, r.commission_bps); return { gross: a.gross + s.totalCents, commission: a.commission + s.commissionCents, net: a.net + s.providerShareCents }; }, { gross: 0, commission: 0, net: 0 });
        return {
          provider: p, listings, rating: { avg: pub?.rating_avg ?? null, count: pub?.rating_count ?? 0 }, plan,
          earnings_estimate: {
            completed: sum(bks.filter((r) => r.status === 'completed')), in_progress: sum(bks.filter((r) => r.status !== 'completed')),
            note: 'Estimativa a partir das reservas pagas no PSP sandbox. Repasse real ao prestador ainda não existe nesta versão.',
          },
        };
      });
    });
    v1.get('/me/provider/reviews', async (req) => {
      const me = await persona(req);
      return { items: await asApp(me.id, (sql) => sql(`select r.id, r.score_communication, r.score_punctuality, r.score_care, r.score_match, r.comment, r.provider_reply, r.moderation_status, r.created_at
          from public.reviews r where app.is_provider_member(r.provider_id) order by r.created_at desc limit 50`)) };
    });
    v1.post('/me/reviews/:id/reply', async (req) => {
      const me = await persona(req); const id = idParam(req); const b = ReplyBody.parse(req.body);
      const n = await asApp(me.id, async (sql) => (await sql(`update public.reviews set provider_reply = $2 where id = $1 returning id`, [id, b.text])).length);
      if (!n) throw new AppError(404, 'review_not_found', 'Avaliação não encontrada');
      return { ok: true };
    });
  }, { prefix: '/v1' });
}
