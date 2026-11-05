#!/usr/bin/env node
/**
 * Gera supabase/seed.sql a partir do gerador determinístico da demo (src/data/demo/seed.ts).
 *
 * Uso (Node >= 22.18, sem dependências extras):
 *   node scripts/gerar-seed-sql.mjs              # datas relativas: o seed "anda" para o dia do `db reset`
 *   node scripts/gerar-seed-sql.mjs --absoluto   # datas fixas (ISO da geração)
 *
 * Como funciona:
 *   - Node 22.18+ remove tipos de arquivos .ts nativamente (type stripping). Os imports do projeto não têm
 *     extensão ('./catalog'), então registramos um hook de resolução que tenta '<spec>.ts'.
 *   - IDs textuais da demo ('prv-carla', 'svc-000a', ...) viram UUID v5 determinísticos
 *     (namespace = uuidv5(DNS, 'cuidope.app')). Mesma entrada → mesmo UUID em todo `db reset`.
 *   - Datas: por padrão cada timestamp é emitido como pg_temp.ts('<ISO>'), que soma a diferença em DIAS
 *     entre "hoje" (America/Sao_Paulo) e a data da geração — preserva o horário do dia.
 *   - Tudo com is_demo = true. Dois logins de demonstração (senha SOMENTE-DEMO, ver docs/backend-supabase-firebase.md).
 */
import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// horários da demo são locais do Brasil (atDay usa o fuso do processo)
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '..');
const outFile = resolve(webRoot, '../../supabase/seed.sql');
const ABSOLUTE = process.argv.includes('--absoluto');

const { generateDemo, MAIN_CUSTOMER_ID, MAIN_PROVIDER_ID } = await import(pathToFileURL(resolve(webRoot, 'src/data/demo/seed.ts')).href);
const { CATEGORIES, CITIES } = await import(pathToFileURL(resolve(webRoot, 'src/data/demo/catalog.ts')).href);
const { CAPACITY, commissionCents } = await import(pathToFileURL(resolve(webRoot, 'src/domain/rules.ts')).href);

/* ---------- UUID v5 (RFC 4122) ---------- */
const DNS_NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
function uuidv5(name, ns) {
  const nsBytes = Buffer.from(ns.replace(/-/g, ''), 'hex');
  const h = createHash('sha1').update(Buffer.concat([nsBytes, Buffer.from(name, 'utf8')])).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
const CUIDOPE_NS = uuidv5('cuidope.app', DNS_NS);
const U = (textId) => uuidv5(textId, CUIDOPE_NS);

/* ---------- logins de demonstração ---------- */
const DEMO_PASSWORD = process.env.CUIDOPE_DEMO_PASSWORD || 'Cuidope!Demo2026';
const DEMO_USERS = [
  { key: 'auth:ana.demo@cuidope.app', email: 'ana.demo@cuidope.app', name: 'Ana Paula Ribeiro', role: 'tutor' },
  { key: 'auth:carla.demo@cuidope.app', email: 'carla.demo@cuidope.app', name: 'Carla (Casa da Carla Pet House)', role: 'prestador' },
];
const ANA_UID = U(DEMO_USERS[0].key);
const CARLA_UID = U(DEMO_USERS[1].key);

/* ---------- serialização SQL ---------- */
const now = new Date();
const db = generateDemo(now);
const genDateBR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v === null || v === undefined || Number.isNaN(v) ? 'null' : String(v));
const bool = (v) => (v ? 'true' : 'false');
const arr = (a) => (!a || a.length === 0 ? `'{}'::text[]` : `array[${a.map(q).join(', ')}]::text[]`);
const intArr = (a) => `array[${a.map(num).join(', ')}]::integer[]`;
const json = (v) => `${q(JSON.stringify(v))}::jsonb`;
const uuid = (textId) => (textId ? q(U(textId)) : 'null');
const ts = (iso) => (!iso ? 'null' : ABSOLUTE ? `${q(iso)}::timestamptz` : `pg_temp.ts(${q(iso)})`);

const out = [];
const emit = (s) => out.push(s);
function insert(table, cols, rows, suffix = '') {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    emit(`insert into ${table} (${cols.join(', ')}) values\n  ${chunk.map((r) => `(${r.join(', ')})`).join(',\n  ')}${suffix ? `\n${suffix}` : ''};`);
  }
}

/* ---------- cabeçalho ---------- */
emit(`-- =====================================================================================
-- supabase/seed.sql — GERADO por apps/web/scripts/gerar-seed-sql.mjs em ${now.toISOString()}
-- NÃO edite à mão: rode \`node scripts/gerar-seed-sql.mjs\` dentro de apps/web.
-- Dados 100% fictícios (is_demo = true). IDs = UUID v5 determinístico dos IDs textuais da demo
-- (namespace ${CUIDOPE_NS} = uuidv5(DNS, 'cuidope.app')).
-- Logins SOMENTE-DEMO: ${DEMO_USERS.map((u) => u.email).join(' / ')} — senha documentada em docs/backend-supabase-firebase.md.
-- NUNCA rode este seed em produção.
-- Datas: ${ABSOLUTE ? 'absolutas (fixas na geração)' : `relativas — deslocadas em dias inteiros a partir de ${genDateBR} (America/Sao_Paulo)`}.
-- =====================================================================================
begin;
set local cuidope.seeding = 'on';
set local search_path = public, extensions;

create or replace function pg_temp.ts(p text) returns timestamptz language sql stable as $$
  select p::timestamptz + (((now() at time zone 'America/Sao_Paulo')::date - date '${genDateBR}') * interval '1 day')
$$;
`);

/* ---------- catálogo ---------- */
insert('public.categories', ['id', 'label', 'short', 'description', 'sort_order'],
  CATEGORIES.map((c, i) => [q(c.id), q(c.label), q(c.short), q(c.description), num(i)]),
  'on conflict (id) do update set label = excluded.label, short = excluded.short, description = excluded.description, sort_order = excluded.sort_order');
insert('public.cities', ['id', 'name', 'uf', 'ibge', 'neighborhoods', 'center_lat', 'center_lng'],
  CITIES.map((c) => [q(c.id), q(c.name), q(c.uf), num(c.ibge), arr(c.neighborhoods), num(c.center.lat), num(c.center.lng)]),
  'on conflict (id) do update set name = excluded.name, neighborhoods = excluded.neighborhoods');

/* ---------- usuários demo (auth) ---------- */
emit('-- logins de demonstração (o trigger on_auth_user_created cria os profiles)');
for (const u of DEMO_USERS) {
  const uid = U(u.key);
  emit(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', ${q(uid)}, 'authenticated', 'authenticated', ${q(u.email)},
  extensions.crypt(${q(DEMO_PASSWORD)}, extensions.gen_salt('bf')), now(),
  ${json({ provider: 'email', providers: ['email'], cuidope_seed: 'true', cuidope_role: u.role, cuidope_demo: true })},
  ${json({ full_name: u.name })}, now(), now(), '', '', '', '')
on conflict (id) do nothing;`);
  emit(`insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (${q(uid)}, ${q(uid)}, ${q(uid)}, ${json({ sub: uid, email: u.email, email_verified: true })}, 'email', now(), now(), now())
on conflict do nothing;`);
}
emit(`update public.profiles set role = 'prestador' where id = ${q(CARLA_UID)};`);

/* ---------- prestadores ---------- */
// hoursFor() da demo repete o domingo (dia 0) para hospedagem/pet sitter; mantemos a 1ª ocorrência,
// que é a mesma que daySlots() usa (Array.find).
const dedupeHours = (hours) => hours.filter((h, i) => hours.findIndex((x) => x.day === h.day) === i);

insert('public.providers', ['id', 'slug', 'owner_user_id', 'name', 'kind', 'tagline', 'bio', 'categories', 'city_id', 'neighborhood', 'geo_lat', 'geo_lng',
  'avatar_seed', 'cover_seed', 'rating', 'review_count', 'rating_breakdown', 'response_time_min', 'response_rate', 'verified_identity', 'verified_background',
  'verified_venue', 'years_experience', 'pets_served', 'species', 'sizes', 'price_from_cents', 'whatsapp_opt_in', 'whatsapp_public', 'opening_hours', 'amenities',
  'cancellation_policy', 'plan', 'featured', 'status', 'is_demo', 'created_at'],
  db.providers.map((p) => [uuid(p.id), q(p.slug), p.id === MAIN_PROVIDER_ID ? q(CARLA_UID) : 'null', q(p.name), q(p.kind), q(p.tagline), q(p.bio), arr(p.categories),
    q(p.cityId), q(p.neighborhood), num(p.geo.lat), num(p.geo.lng), num(p.avatarSeed), num(p.coverSeed), num(p.rating), num(p.reviewCount), intArr(p.ratingBreakdown),
    num(p.responseTimeMin), num(Math.round(p.responseRate * 1000) / 1000), bool(p.verification.identity), bool(p.verification.background), bool(p.verification.venue),
    num(p.yearsExperience), num(p.petsServed), arr(p.species), arr(p.sizes), num(p.priceFromCents), bool(p.whatsappOptIn), p.whatsappOptIn ? q(p.whatsappPublic) : 'null',
    json(dedupeHours(p.openingHours)), arr(p.amenities), q(p.cancellationPolicy), q(p.plan), bool(p.featured), q(p.status), 'true', ts(p.createdAt)]));

const settingsById = new Map(db.settings.map((s) => [s.providerId, s]));
insert('public.provider_settings', ['provider_id', 'wa_number', 'wa_provider', 'wa_connected', 'auto_confirmation_request', 'reminder_24h', 'reminder_2h',
  'post_service_review', 'reactivation_days', 'first_response_sla_min', 'auto_reply_outside_hours', 'instant_booking'],
  db.providers.map((p) => {
    const s = settingsById.get(p.id);
    return s
      ? [uuid(p.id), q(s.waNumber), q(s.waProvider), bool(s.waConnected), bool(s.autoConfirmationRequest), bool(s.reminder24h), bool(s.reminder2h),
          bool(s.postServiceReview), num(s.reactivationDays), num(s.firstResponseSlaMin), bool(s.autoReplyOutsideHours), bool(s.instantBooking)]
      : [uuid(p.id), q(p.whatsappPublic ?? null), q('desconectado'), 'false', 'true', 'true', 'false', 'true', '30', '15', 'false', 'false'];
  }));

insert('public.services', ['id', 'provider_id', 'category', 'name', 'description', 'price_cents', 'unit', 'duration_min', 'species', 'sizes', 'capacity_units', 'active'],
  db.services.map((s) => [uuid(s.id), uuid(s.providerId), q(s.category), q(s.name), q(s.description), num(s.priceCents), q(s.unit), num(s.durationMin),
    arr(s.species), arr(s.sizes), num(CAPACITY[s.category] ?? 1), bool(s.active)]));

insert('public.service_packages', ['id', 'provider_id', 'service_id', 'name', 'description', 'sessions', 'price_cents', 'full_price_cents', 'validity_days', 'active', 'popular', 'sold_count'],
  db.packages.map((k) => [uuid(k.id), uuid(k.providerId), uuid(k.serviceId), q(k.name), q(k.description), num(k.sessions), num(k.priceCents), num(k.fullPriceCents),
    num(k.validityDays), bool(k.active), bool(k.popular), num(k.soldCount)]));

/* ---------- clientes e pets ---------- */
insert('public.customers', ['id', 'user_id', 'name', 'phone', 'email', 'city_id', 'neighborhood', 'wa_opt_in', 'wa_opt_in_at', 'marketing_opt_in', 'marketing_opt_in_at', 'is_demo', 'created_at'],
  db.customers.map((c) => [uuid(c.id), c.id === MAIN_CUSTOMER_ID ? q(ANA_UID) : 'null', q(c.name), q(c.phone), q(c.email), q(c.cityId), q(c.neighborhood),
    bool(c.waOptIn), c.waOptIn ? ts(c.createdAt) : 'null', bool(c.marketingOptIn), c.marketingOptIn ? ts(c.createdAt) : 'null', 'true', ts(c.createdAt)]));

// a prestadora demo também tem um customer (para poder navegar como tutora sem erro)
emit(`insert into public.customers (id, user_id, name, email, city_id, is_demo) values (${uuid('cus-carla-login')}, ${q(CARLA_UID)}, 'Carla (demo)', 'carla.demo@cuidope.app', 'passo-fundo-rs', true) on conflict do nothing;`);

const pcPairs = new Map();
const addPair = (prov, cust, source) => { const k = `${prov}|${cust}`; if (!pcPairs.has(k)) pcPairs.set(k, [uuid(prov), uuid(cust), q(source)]); };
for (const b of db.bookings) addPair(b.providerId, b.customerId, b.channel);
for (const c of db.conversations) addPair(c.providerId, c.customerId, 'whatsapp');
for (const p of db.purchases) addPair(p.providerId, p.customerId, 'app');
insert('public.provider_customers', ['provider_id', 'customer_id', 'source'], [...pcPairs.values()]);

insert('public.pets', ['id', 'owner_id', 'name', 'species', 'breed', 'size', 'birth_year', 'weight_kg', 'temperament', 'care_notes', 'vaccines_up_to_date', 'avatar_seed'],
  db.pets.map((p) => [uuid(p.id), uuid(p.ownerId), q(p.name), q(p.species), q(p.breed), q(p.size), num(p.birthYear), num(p.weightKg), q(p.temperament), q(p.careNotes),
    bool(p.vaccinesUpToDate), num(p.avatarSeed)]));

insert('public.favorites', ['customer_id', 'provider_id'],
  Object.entries(db.favorites).flatMap(([cid, pids]) => pids.map((pid) => [uuid(cid), uuid(pid)])));

/* ---------- pacotes comprados, reservas, eventos ---------- */
insert('public.package_purchases', ['id', 'package_id', 'provider_id', 'customer_id', 'sessions_total', 'sessions_used', 'price_cents', 'purchased_at', 'expires_at', 'status'],
  db.purchases.map((p) => [uuid(p.id), uuid(p.packageId), uuid(p.providerId), uuid(p.customerId), num(p.sessionsTotal), num(Math.min(p.sessionsUsed, p.sessionsTotal)),
    num(p.priceCents), ts(p.purchasedAt), ts(p.expiresAt), q(p.status)]));

insert('public.bookings', ['id', 'code', 'provider_id', 'customer_id', 'service_id', 'package_purchase_id', 'start_at', 'end_at', 'price_cents', 'commission_cents',
  'status', 'channel', 'notes', 'location', 'wa_confirmation_sent_at', 'wa_confirmation_replied_at', 'wa_confirmation_reply', 'reviewed', 'created_at'],
  db.bookings.map((b) => [uuid(b.id), q(b.code), uuid(b.providerId), uuid(b.customerId), uuid(b.serviceId), uuid(b.packagePurchaseId), ts(b.start), ts(b.end),
    num(b.priceCents), num(commissionCents(b.priceCents)), q(b.status), q(b.channel), q(b.notes), q(b.location), ts(b.waConfirmation?.sentAt),
    ts(b.waConfirmation?.repliedAt), q(b.waConfirmation?.reply ?? null), bool(b.reviewed), ts(b.createdAt)]));

insert('public.booking_pets', ['booking_id', 'pet_id'],
  db.bookings.flatMap((b) => [...new Set(b.petIds)].map((pid) => [uuid(b.id), uuid(pid)])));

insert('public.booking_events', ['booking_id', 'at', 'type', 'label', 'by_actor'],
  db.bookings.flatMap((b) => b.timeline.map((e) => [uuid(b.id), ts(e.at), q(e.type), q(e.label), q(e.by)])));

/* ---------- avaliações ---------- */
insert('public.reviews', ['id', 'provider_id', 'booking_id', 'author_name', 'pet_name', 'pet_species', 'service_name', 'rating', 'aspect_pontualidade', 'aspect_cuidado',
  'aspect_comunicacao', 'text', 'verified_booking', 'reply_text', 'reply_at', 'created_at'],
  db.reviews.map((r) => [uuid(r.id), uuid(r.providerId), uuid(r.bookingId), q(r.authorName), q(r.petName), q(r.petSpecies), q(r.serviceName), num(r.rating),
    num(r.aspects.pontualidade), num(r.aspects.cuidado), num(r.aspects.comunicacao), q(r.text), bool(r.verifiedBooking), q(r.reply?.text ?? null), ts(r.reply?.createdAt), ts(r.createdAt)]));

/* ---------- WhatsApp: templates globais, conversas e mensagens ---------- */
insert('public.wa_templates', ['id', 'provider_id', 'name', 'title', 'category', 'body', 'buttons', 'approved'],
  db.templates.map((t) => [uuid(t.id), 'null', q(t.name), q(t.title), q(t.category), q(t.body), arr(t.buttons), bool(t.approved)]));

const lastInbound = new Map();
for (const m of db.messages) if (m.from === 'cliente') { const prev = lastInbound.get(m.conversationId); if (!prev || prev < m.at) lastInbound.set(m.conversationId, m.at); }
insert('public.conversations', ['id', 'provider_id', 'customer_id', 'phone', 'status', 'tags', 'unread', 'last_message_at', 'last_message_preview', 'last_inbound_at',
  'booking_id', 'sla_due_at', 'assigned_to'],
  db.conversations.map((c) => [uuid(c.id), uuid(c.providerId), uuid(c.customerId), q(c.phone), q(c.status), arr(c.tags), num(c.unread), ts(c.lastMessageAt),
    q(c.lastMessagePreview.slice(0, 120)), ts(lastInbound.get(c.id)), uuid(c.bookingId), ts(c.slaDueAt), q(c.assignedTo ?? null)]));

const providerOfConv = new Map(db.conversations.map((c) => [c.id, c.providerId]));
insert('public.messages', ['id', 'conversation_id', 'provider_id', 'from_actor', 'text', 'at', 'delivery', 'template', 'buttons'],
  db.messages.map((m) => [uuid(m.id), uuid(m.conversationId), uuid(providerOfConv.get(m.conversationId)), q(m.from), q(m.text), ts(m.at), q(m.delivery),
    q(m.template ?? null), m.buttons ? arr(m.buttons) : 'null']));

/* ---------- pós-processamento ---------- */
emit(`-- notas recalculadas pela mesma função do trigger (garante consistência com reviews)
select app.recalc_provider_rating(id) from public.providers where is_demo;
select setval('app.booking_code_seq', ${db.seq + 1000}, false);
commit;
`);

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, out.join('\n\n') + '\n', 'utf8');

const counts = {
  providers: db.providers.length, services: db.services.length, packages: db.packages.length, customers: db.customers.length + 1, pets: db.pets.length,
  bookings: db.bookings.length, booking_events: db.bookings.reduce((a, b) => a + b.timeline.length, 0), purchases: db.purchases.length, reviews: db.reviews.length,
  conversations: db.conversations.length, messages: db.messages.length, templates: db.templates.length, provider_customers: pcPairs.size,
};
console.log(`seed.sql gerado em ${outFile}`);
console.log(JSON.stringify(counts));
console.log(`UUIDs: cus-ana=${U(MAIN_CUSTOMER_ID)} prv-carla=${U(MAIN_PROVIDER_ID)} ana(auth)=${ANA_UID} carla(auth)=${CARLA_UID}`);
