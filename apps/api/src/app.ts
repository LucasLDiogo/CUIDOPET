import { createHash, randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import * as c from '../../../packages/contracts/src/index.ts';
import { SandboxProvider } from '../../../packages/providers/src/index.ts';
import type { SqlRunner } from '../../../database/migrate.ts';
import { Db } from './db.ts';
import { AppError } from './errors.ts';
import { searchProviders } from './search.ts';
import { registerQas } from './qas.ts';

/** `qas: true` habilita a persona de teste (/v1/me/*) e a interface /qas. Recusado em produção. */
export interface AppOptions { runner: SqlRunner; webhookSecret: string; logger?: boolean; qas?: boolean }

const CORRELATION = /^[A-Za-z0-9._-]{8,64}$/;

export async function buildApp(opts: AppOptions): Promise<FastifyInstance & { db: Db }> {
  if (opts.qas && process.env.CUIDOPE_ENV === 'production') throw new Error('Modo QAS (persona de teste) é proibido em produção');
  const db = new Db(opts.runner);
  const sandbox = new SandboxProvider(opts.webhookSecret);
  const app = Fastify({
    logger: opts.logger ? { redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-signature"]'] } : false,
    genReqId: (req) => { const h = req.headers['x-correlation-id']; return typeof h === 'string' && CORRELATION.test(h) ? h : randomUUID(); },
    bodyLimit: 64 * 1024,
  });

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('x-correlation-id', req.id);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('x-frame-options', 'DENY');
    if (!reply.hasHeader('content-security-policy')) reply.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
    return payload;
  });

  app.setErrorHandler((err: any, req, reply) => {
    let status = 500, code = 'internal_error', title = 'Erro interno', field: string | undefined, detail: string | undefined;
    if (err instanceof AppError) { status = err.status; code = err.code; title = err.message; field = err.field; }
    else if (err instanceof ZodError) { status = 400; code = 'validation_error'; title = 'Parâmetros inválidos'; field = err.issues[0]?.path.join('.') || undefined; detail = err.issues[0]?.message; }
    else if (err.statusCode && err.statusCode < 500) { status = err.statusCode; code = err.code?.toLowerCase?.() ?? 'bad_request'; title = 'Requisição inválida'; }
    else req.log.error({ err }, 'erro não tratado');       // detalhes ficam no log; nunca na resposta
    const body: c.Problem = { type: `https://cuidope.app/problems/${code}`, title, status, code, correlation_id: req.id, ...(detail ? { detail } : {}), ...(field ? { field } : {}) };
    reply.status(status).type('application/problem+json').send(body);
  });
  app.setNotFoundHandler((req, reply) => {
    reply.status(404).type('application/problem+json').send({ type: 'https://cuidope.app/problems/not_found', title: 'Rota não encontrada', status: 404, code: 'not_found', correlation_id: req.id });
  });

  await app.register(async (v1) => {
    v1.get('/health', async () => ({ status: 'ok', version: '0.1.0', time: new Date().toISOString() }));

    v1.get('/regions', async (req, reply) => {
      const { uf } = c.RegionsQuerySchema.parse(req.query);
      const out = await db.anon(async (sql) => {
        const cities = await sql<{ city_ibge_id: number; name: string }>(
          `select distinct r.city_ibge_id, r.name from public.regions r
            where r.kind = 'city' and r.uf = $1 and exists (select 1 from public.region_enablement e where e.region_id = r.id and e.enabled) order by r.name`, [uf]);
        const hoods = await sql<{ id: string; name: string; city_ibge_id: number }>(`select id, name, city_ibge_id from public.regions where kind = 'neighborhood' and uf = $1 order by name`, [uf]);
        return { uf, cities: cities.map((ct) => ({ ...ct, neighborhoods: hoods.filter((h) => h.city_ibge_id === ct.city_ibge_id).map((h) => ({ id: h.id, name: h.name })) })) };
      });
      reply.header('cache-control', 'public, max-age=300');
      return out;
    });

    v1.get('/search/providers', async (req, reply) => {
      const q = c.SearchQuerySchema.parse(req.query);
      const res = await searchProviders(db, q);
      reply.header('cache-control', 'public, max-age=30');
      return c.SearchResponseSchema.parse(res);          // saída também é validada contra o contrato
    });

    v1.get('/providers/:slug', async (req, reply) => {
      const { slug } = req.params as { slug: string };
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new AppError(404, 'provider_not_found', 'Prestador não encontrado');
      const out = await db.anon(async (sql) => {
        const p = (await sql<any>(`select id, slug, public_name, bio, photo_ref, city_name, neighborhood_name, uf, rating_avg::float8 as rating_avg, rating_count,
            identity_verified, identity_scope, is_professional, whatsapp_available, external_site_available, is_demo from public.v_public_providers where slug = $1`, [slug]))[0];
        if (!p) return null;
        const listings = await sql<any>(`select id, category_code, title, price_cents, price_unit, price_is_from, price_variation_note, species from public.v_public_listings where provider_id = $1 order by category_code, title`, [p.id]);
        const reviews = await sql<any>(`select id, score_communication, score_punctuality, score_care, score_match, comment, label, provider_reply, created_at from public.v_public_reviews where provider_id = $1 order by created_at desc limit 20`, [p.id]);
        const dist = await sql<{ b: number; n: number }>(`select round((score_communication + score_punctuality + score_care + score_match) / 4.0)::int as b, count(*)::int as n from public.v_public_reviews where provider_id = $1 group by 1`, [p.id]);
        return { p, listings, reviews, dist };
      });
      if (!out) throw new AppError(404, 'provider_not_found', 'Prestador não encontrado');
      const { p, listings, reviews, dist } = out;
      const body = {
        provider: {
          provider_id: p.id, slug: p.slug, public_name: p.public_name, bio: p.bio, bio_short: p.bio, photo_ref: p.photo_ref, city: p.city_name, neighborhood: p.neighborhood_name, uf: String(p.uf).trim(),
          services: listings.map((l: any) => ({ listing_id: l.id, category: l.category_code, title: l.title, price_cents: l.price_cents, price_unit: l.price_unit, price_is_from: l.price_is_from, price_variation_note: l.price_variation_note, species: l.species })),
          rating_avg: p.rating_avg, rating_count: p.rating_count,
          badges: { identity_verified: p.identity_verified, identity_scope: p.identity_scope, professional: p.is_professional },
          channels: { whatsapp: p.whatsapp_available, external_site: p.external_site_available }, is_demo: p.is_demo,
        },
        reviews: {
          items: reviews.map((r: any) => ({ id: r.id, scores: { communication: r.score_communication, punctuality: r.score_punctuality, care: r.score_care, match: r.score_match }, comment: r.comment, label: r.label, provider_reply: r.provider_reply, created_at: new Date(r.created_at).toISOString() })),
          distribution: Object.fromEntries([1, 2, 3, 4, 5].map((s) => [String(s), dist.find((d) => d.b === s)?.n ?? 0])),
        },
      };
      reply.header('cache-control', 'public, max-age=60');
      return c.ProviderProfileResponseSchema.parse(body);
    });

    v1.get('/listings/:id/availability', async (req) => {
      const { id } = req.params as { id: string };
      const q = c.AvailabilityQuerySchema.parse(req.query);
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError(404, 'listing_not_found', 'Oferta não encontrada');
      const ok = await db.anon(async (sql) => {
        const l = (await sql(`select 1 from public.v_public_listings where id = $1`, [id]))[0];
        if (!l) return null;
        return (await sql<{ ok: boolean }>(`select public.listing_has_capacity($1, tstzrange($2::timestamptz, $3::timestamptz, '[)'), $4::int) as ok`, [id, q.from, q.to, q.pets]))[0]!.ok;
      });
      if (ok === null) throw new AppError(404, 'listing_not_found', 'Oferta não encontrada');
      return { available: ok };
    });
  }, { prefix: '/v1' });

  // Webhooks: corpo BRUTO (assinatura é sobre os bytes recebidos), encapsulado só nesta rota.
  await app.register(async (hooks) => {
    hooks.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
    hooks.post('/webhooks/:provider', async (req) => {
      const { provider } = req.params as { provider: string };
      if (provider !== 'sandbox') throw new AppError(404, 'unknown_provider', 'Provedor desconhecido');
      const raw = req.body as Buffer;
      if (!sandbox.verifyWebhook(raw, req.headers['x-signature'] as string | undefined)) throw new AppError(401, 'invalid_signature', 'Assinatura inválida');
      let evt: c.SandboxWebhook;
      try { evt = c.SandboxWebhookSchema.parse(JSON.parse(raw.toString('utf8'))); }
      catch { throw new AppError(400, 'invalid_payload', 'Payload inválido'); }

      const hash = createHash('sha256').update(raw).digest('hex');
      // Persistir primeiro (durável e deduplicado), processar depois.
      const inserted = await db.service(async (sql) => (await sql<{ n: boolean }>(`select app.record_webhook('sandbox', $1, $2, $3, $4::jsonb) as n`, [evt.event_id, evt.type, hash, JSON.stringify({ payment_id: evt.payment_id, status: evt.status ?? null })]))[0]!.n);
      const result = await processWebhook(db, sandbox, evt.event_id);
      return { received: true, duplicate: !inserted, processed: result };
    });
  }, { prefix: '/v1' });

  if (opts.qas) await registerQas(app, { db, sandbox });

  const decorated = app as unknown as FastifyInstance & { db: Db };
  decorated.db = db;
  return decorated;
}

/** Processa um evento do inbox. Falha fica registrada para nova tentativa pelo worker (nunca perde dinheiro). */
export async function processWebhook(db: Db, sandbox: SandboxProvider, eventId: string): Promise<'confirmed' | 'already_processed' | 'ignored' | 'failed'> {
  return db.service(async (sql) => {
    const evt = (await sql<{ id: string; event_type: string; payload: { payment_id: string; status: string | null }; processed_at: string | null }>(
      `select id, event_type, payload, processed_at from public.webhook_inbox where provider = 'sandbox' and event_id = $1 for update`, [eventId]))[0];
    if (!evt) return 'failed';
    if (evt.processed_at) return 'already_processed';
    const mapped = sandbox.mapStatus(evt.payload.status ?? undefined) ?? (evt.event_type === 'PAYMENT_CONFIRMED' ? 'confirmed' : undefined);
    if (mapped !== 'confirmed') {   // eventos não-confirmação serão tratados nos incrementos de reembolso/chargeback
      await sql(`update public.webhook_inbox set processed_at = now(), last_error = $2 where id = $1`, [evt.id, `ignorado: ${evt.event_type}/${evt.payload.status ?? '-'}`]);
      return 'ignored';
    }
    try {
      await sql('savepoint wh');
      await sql(`select app.confirm_payment('sandbox', $1)`, [evt.payload.payment_id]);
      await sql(`update public.webhook_inbox set processed_at = now(), attempts = attempts + 1, last_error = null where id = $1`, [evt.id]);
      return 'confirmed';
    } catch (e) {
      await sql('rollback to savepoint wh');
      await sql(`update public.webhook_inbox set attempts = attempts + 1, last_error = $2 where id = $1`, [evt.id, String((e as Error).message).slice(0, 300)]);
      return 'failed';
    }
  });
}

/** Reprocessa eventos pendentes (worker). Limite de tentativas evita laço infinito; excedentes ficam para operador. */
export async function retryPendingWebhooks(db: Db, sandbox: SandboxProvider, maxAttempts = 5): Promise<number> {
  const ids = await db.service((sql) => sql<{ event_id: string }>(`select event_id from public.webhook_inbox where provider = 'sandbox' and processed_at is null and attempts < $1 order by received_at`, [maxAttempts]));
  let ok = 0;
  for (const { event_id } of ids) if ((await processWebhook(db, sandbox, event_id)) === 'confirmed') ok++;
  return ok;
}
