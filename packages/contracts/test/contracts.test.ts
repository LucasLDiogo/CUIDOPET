import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SearchQuerySchema, SandboxWebhookSchema, ProviderCardSchema, FORBIDDEN_PUBLIC_KEYS } from '../src/index.ts';
import { buildOpenApi } from '../src/openapi.ts';

test('busca: normaliza UF, aplica defaults e rejeita entradas inválidas', () => {
  const q = SearchQuerySchema.parse({ uf: 'rs', city_ibge_id: '4314100', service: 'passeio' });
  assert.deepEqual([q.uf, q.city_ibge_id, q.species, q.pets, q.limit], ['RS', 4314100, 'all', 1, 20]);
  for (const bad of [{ uf: 'RSS' }, { city_ibge_id: -1 }, { service: 'compra_de_animais' }, { species: 'bird' }, { from: '2031-01-01T10:00:00Z' }, { limit: 51 }, { pets: 0 }, { neighborhood_id: 'x' }]) {
    assert.throws(() => SearchQuerySchema.parse({ uf: 'RS', city_ibge_id: 1, service: 'passeio', ...bad }), undefined, JSON.stringify(bad));
  }
});
test('catálogo inicial não inclui venda de animais, clínica ou medicamentos (escopo da spec §3)', () => {
  const svc = SearchQuerySchema.shape.service.options as readonly string[];
  for (const forbidden of ['venda', 'compra', 'veterinario', 'clinica', 'medicamento', 'sedacao']) assert.ok(!svc.some((s) => s.includes(forbidden)));
});
test('webhook: exige campos mínimos', () => {
  assert.ok(SandboxWebhookSchema.safeParse({ event_id: 'evt_1', type: 'PAYMENT_CONFIRMED', payment_id: 'pay_1' }).success);
  assert.ok(!SandboxWebhookSchema.safeParse({ event_id: 1 }).success);
});
test('cartão público: nota nula é válida (sem avaliações) e nota fora de 1..5 não é', () => {
  const base = { provider_id: crypto.randomUUID(), slug: 'a', public_name: 'A', bio_short: null, photo_ref: null, city: 'X', neighborhood: null, uf: 'RS', services: [],
    rating_count: 0, badges: { identity_verified: false, identity_scope: null, professional: false }, channels: { whatsapp: false, external_site: false }, availability: 'unknown', sponsored: false, is_demo: true,
    ranking: { version: 'v', score: 0.5, why: 'x', impression_id: crypto.randomUUID() } };
  assert.ok(ProviderCardSchema.safeParse({ ...base, rating_avg: null }).success);
  assert.ok(!ProviderCardSchema.safeParse({ ...base, rating_avg: 5.5 }).success);
  assert.ok(!ProviderCardSchema.safeParse({ ...base, rating_avg: 0 }).success);
});
test('OpenAPI: rotas documentadas são exatamente as implementadas e nenhuma expõe campo proibido', () => {
  const o = buildOpenApi();
  assert.deepEqual(Object.keys(o.paths).sort(), ['/health', '/listings/{id}/availability', '/providers/{slug}', '/regions', '/search/providers', '/webhooks/{provider}']);
  const text = JSON.stringify(o);
  for (const k of FORBIDDEN_PUBLIC_KEYS) assert.ok(!text.includes(`"${k}"`), `OpenAPI menciona campo proibido ${k}`);
});
