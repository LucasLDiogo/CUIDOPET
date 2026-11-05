import type { ProviderCard } from '../domain/types';
import { cx } from '../lib/format';

/** Mapa esquemático (sem serviço externo): posiciona pins pela coordenada APROXIMADA do bairro. */
export function MiniMap({ items, active, onPick, className = '' }: { items: ProviderCard[]; active?: string | null; onPick?: (slug: string) => void; className?: string }) {
  if (!items.length) return <div className={cx('grid place-items-center rounded-3xl bg-surface-2 text-sm text-muted', className)}>Sem resultados no mapa</div>;
  const lats = items.map((p) => p.geo.lat); const lngs = items.map((p) => p.geo.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const pad = 0.12;
  const x = (lng: number) => (maxLng === minLng ? 50 : pad * 100 + ((lng - minLng) / (maxLng - minLng)) * (100 - 2 * pad * 100));
  const y = (lat: number) => (maxLat === minLat ? 50 : pad * 100 + ((maxLat - lat) / (maxLat - minLat)) * (100 - 2 * pad * 100));
  const cities = [...new Set(items.map((p) => p.cityName))];
  return (
    <div className={cx('relative overflow-hidden rounded-3xl border border-line bg-[color-mix(in_oklab,var(--brand)_7%,var(--surface))]', className)}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs><pattern id="mm-grid" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M8 0H0V8" fill="none" stroke="var(--line)" strokeWidth=".25" /></pattern></defs>
        <rect width="100" height="100" fill="url(#mm-grid)" />
        <path d="M-5 70 C 20 60, 35 80, 60 66 S 95 58, 105 64" stroke="color-mix(in oklab, var(--info) 35%, transparent)" strokeWidth="3" fill="none" />
        <path d="M10 -5 C 22 30, 18 60, 34 105" stroke="var(--surface-3)" strokeWidth="1.6" fill="none" />
        <path d="M-5 30 C 30 36, 70 22, 105 30" stroke="var(--surface-3)" strokeWidth="1.6" fill="none" />
        <ellipse cx="72" cy="38" rx="9" ry="6" fill="color-mix(in oklab, var(--ok) 18%, transparent)" />
      </svg>
      {items.map((p) => (
        <button key={p.id} onClick={() => onPick?.(p.slug)} style={{ left: `${x(p.geo.lng)}%`, top: `${y(p.geo.lat)}%` }}
          className={cx('absolute -translate-x-1/2 -translate-y-full rounded-full px-2 py-1 text-[0.72rem] font-bold shadow-card transition', active === p.id ? 'z-10 scale-110 bg-ink text-bg' : 'bg-surface text-ink hover:z-10 hover:bg-ball')}
          aria-label={`${p.name}, ${p.neighborhood}`}>
          {p.rating ? `★ ${p.rating.toFixed(1)}` : 'Novo'}
        </button>
      ))}
      <div className="absolute bottom-3 left-3 rounded-lg bg-surface/90 px-2 py-1 text-[0.7rem] text-muted">Localização aproximada do bairro · {cities.join(', ')}</div>
    </div>
  );
}
