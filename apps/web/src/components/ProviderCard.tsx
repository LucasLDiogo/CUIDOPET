import { useRef } from 'react';
import { Link } from 'react-router';
import { BadgeCheck, Clock3, Heart, MapPin, Package } from 'lucide-react';
import type { ProviderCard as PC } from '../domain/types';
import { catLabel, UNIT_LABEL } from '../data/demo/catalog';
import { Avatar, Cover, RatingBadge } from './ui';
import { cx, formatBRL } from '../lib/format';
import { providerAvatar, providerCover } from '../lib/media';
import { burst } from '../lib/motion';

export function ProviderCard({ p, fav, onFav, compact = false, highlight = false, onHover }: { p: PC; fav?: boolean; onFav?: () => void; compact?: boolean; highlight?: boolean; onHover?: (id: string | null) => void }) {
  const heart = useRef<HTMLButtonElement>(null);
  return (
    <article onMouseEnter={() => onHover?.(p.id)} onMouseLeave={() => onHover?.(null)}
      className={cx('card lift group relative flex flex-col overflow-hidden', highlight && 'ring-2 ring-brand')}>
      <Link to={`/p/${p.slug}`} className="absolute inset-0 z-[1]" aria-label={`Ver perfil de ${p.name}`} />
      <Cover seed={p.coverSeed} img={providerCover(p)} className={compact ? 'h-28' : 'h-40'}>
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {p.featured && <span className="chip bg-ball text-ball-ink shadow">Destaque</span>}
          {p.hasPackages && <span className="chip bg-surface/90 text-ink"><Package size={12} />Pacotes</span>}
        </div>
      </Cover>
      {onFav && (
        <button ref={heart} onClick={(e) => { e.preventDefault(); if (!fav) burst(heart.current); onFav(); }} aria-pressed={fav} aria-label={fav ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
          className="absolute right-3 top-3 z-[2] grid h-9 w-9 place-items-center rounded-full bg-surface/90 text-coral shadow-card">
          <Heart size={17} fill={fav ? 'currentColor' : 'none'} />
        </button>
      )}
      <div className="flex flex-1 flex-col gap-2 px-4 pb-4">
        <div className="-mt-6 flex items-end justify-between gap-2">
          <Avatar name={p.name} seed={p.avatarSeed} src={providerAvatar(p.slug)} size={56} className="ring-4 ring-surface" />
          <RatingBadge rating={p.rating} count={p.reviewCount} />
        </div>
        <div className="min-w-0">
          <h3 className="flex items-center gap-1 truncate text-[1.05rem] font-bold leading-tight">{p.name}{p.verification.identity && <BadgeCheck size={17} className="shrink-0 text-brand" aria-label="Identidade verificada" />}</h3>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted">{p.tagline}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">{p.categories.slice(0, 3).map((c) => <span key={c} className="chip">{catLabel(c)}</span>)}</div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-1 text-sm">
          <div className="min-w-0 space-y-0.5 text-muted">
            <div className="flex items-center gap-1 truncate"><MapPin size={14} />{p.neighborhood}, {p.cityName}</div>
            <div className="flex items-center gap-1"><Clock3 size={14} />Responde em ~{p.responseTimeMin < 60 ? `${p.responseTimeMin} min` : `${Math.round(p.responseTimeMin / 60)} h`}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs text-muted">a partir de</div>
            <div className="font-display text-xl font-semibold tabular text-brand">{formatBRL(p.priceFromCents)}</div>
          </div>
        </div>
        {!compact && p.rankReason && <p className="border-t border-line pt-2 text-xs text-muted"><span className="font-semibold text-ink">Por que aparece:</span> {p.rankReason}</p>}
      </div>
    </article>
  );
}
export const unitLabel = (u: keyof typeof UNIT_LABEL) => UNIT_LABEL[u];
