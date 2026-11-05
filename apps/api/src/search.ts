import { randomUUID } from 'node:crypto';
import type { ProviderCard, SearchQuery, SearchResponse } from '../../../packages/contracts/src/index.ts';
import { RANKING_VERSION, score, whyAppeared } from '../../../packages/domain/src/index.ts';
import type { Db } from './db.ts';
import { AppError } from './errors.ts';

const RADIUS_KM = 15;

interface Row {
  provider_id: string; slug: string; public_name: string; bio: string | null; photo_ref: string | null; city_name: string; neighborhood_name: string | null; uf: string;
  area_lat: string | null; area_lng: string | null;
  rating_avg: number | null; rating_count: number; response_rate: number; completeness: number;
  identity_verified: boolean; identity_scope: string | null; is_professional: boolean; whatsapp_available: boolean; external_site_available: boolean; is_demo: boolean;
  listing_id: string; category_code: string; title: string; price_cents: number; price_unit: string; price_is_from: boolean; price_variation_note: string | null;
  species: string[]; accepted_sizes: string[]; available: boolean | null;
}

const haversineKm = (a: [number, number], b: [number, number]) => {
  const rad = (d: number) => (d * Math.PI) / 180, R = 6371;
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const shorten = (s: string | null, n = 160) => (s && s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

export async function searchProviders(db: Db, q: SearchQuery): Promise<SearchResponse> {
  const { rows, target } = await db.anon(async (sql) => {
    const city = (await sql<{ uf: string }>(`select uf from public.regions where city_ibge_id = $1 and kind = 'city'`, [q.city_ibge_id]))[0];
    if (!city) throw new AppError(400, 'city_not_found', 'Cidade não encontrada ou não habilitada', 'city_ibge_id');
    if (city.uf.trim() !== q.uf) throw new AppError(400, 'city_uf_mismatch', 'A cidade informada não pertence à UF', 'city_ibge_id');   // trocar UF limpa cidade incompatível
    let target: [number, number] | null = null;
    if (q.neighborhood_id) {
      const n = (await sql<{ approx_lat: string; approx_lng: string }>(`select approx_lat, approx_lng from public.regions where id = $1 and kind = 'neighborhood' and city_ibge_id = $2`, [q.neighborhood_id, q.city_ibge_id]))[0];
      if (!n) throw new AppError(400, 'neighborhood_not_found', 'Bairro não pertence à cidade', 'neighborhood_id');
      target = [Number(n.approx_lat), Number(n.approx_lng)];
    }
    const hasDates = q.from != null && q.to != null;
    const rows = await sql<Row>(
      `select p.id as provider_id, p.slug, p.public_name, p.bio, p.photo_ref, p.city_name, p.neighborhood_name, p.uf, p.area_lat, p.area_lng,
              p.rating_avg::float8 as rating_avg, p.rating_count, p.response_rate::float8 as response_rate, p.completeness::float8 as completeness,
              p.identity_verified, p.identity_scope, p.is_professional, p.whatsapp_available, p.external_site_available, p.is_demo,
              l.id as listing_id, l.category_code, l.title, l.price_cents, l.price_unit, l.price_is_from, l.price_variation_note, l.species, l.accepted_sizes,
              case when $3::boolean then public.listing_has_capacity(l.id, tstzrange($4::timestamptz, $5::timestamptz, '[)'), $6::int) else null end as available
         from public.v_public_providers p
         join public.regions c on c.id = p.city_region_id and c.city_ibge_id = $1
         join public.v_public_listings l on l.provider_id = p.id and l.category_code = $2
        where cardinality(l.species) > 0`,
      [q.city_ibge_id, q.service, hasDates, q.from ?? null, q.to ?? null, q.pets]);
    return { rows, target };
  });

  const bySpecies = (r: Row) => q.species === 'all' || r.species.includes(q.species);
  const bySize = (r: Row) => !q.size || r.accepted_sizes.includes(q.size);
  const byDates = (r: Row) => r.available !== false;     // null (sem datas) = desconhecido, não exclui

  const strict = rows.filter((r) => bySpecies(r) && bySize(r) && byDates(r));
  const toCards = (list: Row[]): ProviderCard[] => {
    const groups = new Map<string, Row[]>();
    for (const r of list) groups.set(r.provider_id, [...(groups.get(r.provider_id) ?? []), r]);
    const cards: ProviderCard[] = [];
    for (const g of groups.values()) {
      const f = g[0];
      const species = [...new Set(g.flatMap((r) => r.species))].sort() as ('dog' | 'cat')[];
      const fit = Math.min(1, (q.species === 'all' ? species.length / 2 : 1) * (q.size ? 1 : 0.95) + 0.0);
      const distanceKm = target && f.area_lat != null && f.area_lng != null ? haversineKm(target, [Number(f.area_lat), Number(f.area_lng)]) : null;
      const availability = f.available == null ? 'unknown' : 'available';
      const s = score({ fit, availability: availability === 'available' ? 1 : 0.5, ratingAvg: f.rating_avg, ratingCount: f.rating_count, responseRate: f.response_rate, distanceKm, radiusKm: RADIUS_KM, completeness: f.completeness });
      cards.push({
        provider_id: f.provider_id, slug: f.slug, public_name: f.public_name, bio_short: shorten(f.bio), photo_ref: f.photo_ref,
        city: f.city_name, neighborhood: f.neighborhood_name, uf: f.uf.trim(),
        services: g.map((r) => ({ listing_id: r.listing_id, category: r.category_code as any, title: r.title, price_cents: r.price_cents, price_unit: r.price_unit as any,
          price_is_from: r.price_is_from, price_variation_note: r.price_variation_note, species: r.species as any })),
        rating_avg: f.rating_avg, rating_count: f.rating_count,
        badges: { identity_verified: f.identity_verified, identity_scope: f.identity_scope, professional: f.is_professional },
        channels: { whatsapp: f.whatsapp_available, external_site: f.external_site_available },
        availability, sponsored: false, is_demo: f.is_demo,
        ranking: { version: RANKING_VERSION, score: s.total, why: whyAppeared(s.parts), impression_id: randomUUID() },
      });
    }
    return cards.sort((a, b) => b.ranking.score - a.ranking.score || a.provider_id.localeCompare(b.provider_id));
  };

  const all = toCards(strict);
  let start = 0;
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    start = all.findIndex((x) => x.ranking.score < c.s || (x.ranking.score === c.s && x.provider_id > c.id));
    if (start === -1) start = all.length;
  }
  const page = all.slice(start, start + q.limit);
  const last = page[page.length - 1];
  const next_cursor = start + q.limit < all.length && last ? encodeCursor(last.ranking.score, last.provider_id) : null;

  let empty: SearchResponse['empty'] = null;
  if (all.length === 0) {
    const count = (f: (r: Row) => boolean) => new Set(rows.filter(f).map((r) => r.provider_id)).size;
    const suggestions: NonNullable<SearchResponse['empty']>['suggestions'] = [];
    if (q.from) { const n = count((r) => bySpecies(r) && bySize(r)); if (n) suggestions.push({ relax: 'dates', would_return: n }); }
    if (q.species !== 'all') { const n = count((r) => bySize(r) && byDates(r)); if (n) suggestions.push({ relax: 'species', would_return: n }); }
    if (q.size) { const n = count((r) => bySpecies(r) && byDates(r)); if (n) suggestions.push({ relax: 'size', would_return: n }); }
    empty = { message: 'Não encontramos opções para estes filtros', suggestions };   // nunca relaxa em silêncio: o tutor escolhe
  }
  return { sponsored: [], results: page, next_cursor, empty };
}

const encodeCursor = (s: number, id: string) => Buffer.from(JSON.stringify({ s, id })).toString('base64url');
function decodeCursor(c: string): { s: number; id: string } {
  try {
    const v = JSON.parse(Buffer.from(c, 'base64url').toString('utf8'));
    if (typeof v.s !== 'number' || typeof v.id !== 'string') throw new Error();
    return v;
  } catch { throw new AppError(400, 'invalid_cursor', 'Cursor inválido', 'cursor'); }
}
