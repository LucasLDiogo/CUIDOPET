import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Cat, Check, CheckCheck, Clock, Dog, Loader2, Star, X } from 'lucide-react';
import type { BookingStatus, ConversationStatus, Species } from '../domain/types';
import { STATUS_LABEL, STATUS_LABEL_PROVIDER } from '../domain/rules';
import { cx } from '../lib/format';

/* ---------- marca ---------- */
export function Logo({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-2 font-display font-extrabold text-[1.32rem] tracking-tight text-ink', className)}>
      <svg viewBox="0 0 64 64" className="h-8 w-8 shrink-0" aria-hidden="true">
        <rect width="64" height="64" rx="18" fill="var(--brand)" />
        <g fill="var(--ball)"><ellipse cx="32" cy="40" rx="11" ry="9" /><circle cx="18" cy="28" r="5" /><circle cx="26" cy="19" r="5" /><circle cx="38" cy="19" r="5" /><circle cx="46" cy="28" r="5" /></g>
      </svg>
      {!compact && <span>cuidopê</span>}
    </span>
  );
}

/* ---------- avatares gerados (sem fotos de terceiros) ---------- */
const HUES = [152, 78, 18, 200, 42, 330, 260, 110, 0, 175];
const hue = (seed: number) => HUES[Math.abs(seed) % HUES.length];
export function initials(name: string) { return name.replace(/[—–-].*$/, '').split(/\s+/).filter((w) => w.length > 2 || /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase(); }

export function Avatar({ name, seed, size = 44, className = '' }: { name: string; seed: number; size?: number; className?: string }) {
  const h = hue(seed);
  return (
    <span aria-hidden="true" className={cx('inline-grid shrink-0 place-items-center rounded-full font-display font-bold', className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `oklch(0.86 0.09 ${h})`, color: `oklch(0.3 0.08 ${h})` }}>
      {initials(name) || '•'}
    </span>
  );
}

export function PetAvatar({ species, seed, size = 40, className = '' }: { species: Species; seed: number; size?: number; className?: string }) {
  const h = hue(seed + 3); const Icon = species === 'gato' ? Cat : Dog;
  return (
    <span aria-hidden="true" className={cx('inline-grid shrink-0 place-items-center rounded-[38%]', className)} style={{ width: size, height: size, background: `oklch(0.9 0.07 ${h})`, color: `oklch(0.35 0.09 ${h})` }}>
      <Icon size={size * 0.55} strokeWidth={2.1} />
    </span>
  );
}

/** Capa ilustrada gerada a partir de uma semente: colinas + patinhas. */
export function Cover({ seed, className = '', children }: { seed: number; className?: string; children?: ReactNode }) {
  const h = hue(seed); const h2 = hue(seed + 4);
  const paws = Array.from({ length: 7 }, (_, i) => ({ x: ((seed * 37 + i * 61) % 100), y: ((seed * 13 + i * 29) % 60) + 6, r: ((seed + i) % 3) * 2 + 5, rot: (seed * 11 + i * 47) % 360 }));
  return (
    <div className={cx('relative overflow-hidden', className)} style={{ background: `linear-gradient(160deg, oklch(0.8 0.1 ${h}), oklch(0.66 0.11 ${h2}))` }}>
      <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <path d={`M0 ${42 + (seed % 7)} C 25 ${30 + (seed % 9)}, 55 ${52 - (seed % 6)}, 100 ${36 + (seed % 8)} L100 60 L0 60Z`} fill={`oklch(0.55 0.1 ${h2} / .55)`} />
        <path d={`M0 ${52 - (seed % 5)} C 30 ${44 + (seed % 6)}, 70 ${58 - (seed % 4)}, 100 ${48} L100 60 L0 60Z`} fill={`oklch(0.42 0.08 ${h2} / .6)`} />
        {paws.map((p, i) => (
          <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.rot}) scale(${p.r / 10})`} fill="#fff" opacity=".22">
            <ellipse cx="0" cy="2.2" rx="2.2" ry="1.8" /><circle cx="-2.4" cy="-.6" r=".9" /><circle cx="-.9" cy="-2" r=".9" /><circle cx=".9" cy="-2" r=".9" /><circle cx="2.4" cy="-.6" r=".9" />
          </g>
        ))}
      </svg>
      {children}
    </div>
  );
}

/* ---------- avaliações ---------- */
export function Stars({ value, size = 14, className = '' }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-0.5', className)} role="img" aria-label={`${value.toFixed(1)} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i + 1));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star size={size} className="absolute inset-0 text-line" fill="currentColor" strokeWidth={0} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}><Star size={size} className="text-[#f2b01e]" fill="currentColor" strokeWidth={0} /></span>
          </span>
        );
      })}
    </span>
  );
}
export function RatingBadge({ rating, count, className = '' }: { rating: number | null; count: number; className?: string }) {
  if (rating == null) return <span className={cx('chip bg-ball/40 text-ink', className)}>Novo</span>;
  return (
    <span className={cx('inline-flex items-center gap-1 text-sm font-semibold', className)}>
      <Star size={15} className="text-[#f2b01e]" fill="currentColor" strokeWidth={0} />
      <span className="tabular">{rating.toFixed(1).replace('.', ',')}</span>
      <span className="font-normal text-muted">({count.toLocaleString('pt-BR')})</span>
    </span>
  );
}

/* ---------- status ---------- */
const STATUS_TONE: Record<BookingStatus, string> = {
  pendente: 'bg-[color-mix(in_oklab,var(--warn)_18%,transparent)] text-warn',
  aguardando_cliente: 'bg-[color-mix(in_oklab,var(--info)_16%,transparent)] text-info',
  confirmado: 'bg-[color-mix(in_oklab,var(--ok)_16%,transparent)] text-ok',
  em_atendimento: 'bg-brand text-brand-ink',
  concluido: 'bg-surface-2 text-muted',
  cancelado: 'bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] text-danger',
  recusado: 'bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] text-danger',
  nao_compareceu: 'bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] text-danger',
};
export function StatusPill({ status, perspective = 'tutor', className = '' }: { status: BookingStatus; perspective?: 'tutor' | 'prestador'; className?: string }) {
  const label = perspective === 'prestador' ? STATUS_LABEL_PROVIDER[status] : STATUS_LABEL[status];
  return (
    <span className={cx('chip', STATUS_TONE[status], className)}>
      {(status === 'pendente' || status === 'aguardando_cliente') && <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-current" />}
      {label}
    </span>
  );
}
export const CONV_LABEL: Record<ConversationStatus, string> = { novo: 'Novo contato', aguardando_atendimento: 'Aguardando atendimento', aguardando_cliente: 'Aguardando cliente', agendado: 'Agendado', resolvido: 'Resolvido' };
const CONV_TONE: Record<ConversationStatus, string> = {
  novo: 'bg-ball text-ball-ink', aguardando_atendimento: 'bg-[color-mix(in_oklab,var(--coral)_18%,transparent)] text-coral',
  aguardando_cliente: 'bg-[color-mix(in_oklab,var(--info)_16%,transparent)] text-info', agendado: 'bg-[color-mix(in_oklab,var(--ok)_16%,transparent)] text-ok', resolvido: 'bg-surface-2 text-muted',
};
export function ConvPill({ status, className = '' }: { status: ConversationStatus; className?: string }) {
  return <span className={cx('chip', CONV_TONE[status], className)}>{CONV_LABEL[status]}</span>;
}
export function Delivery({ d }: { d: 'enviando' | 'enviado' | 'entregue' | 'lido' | 'falhou' }) {
  if (d === 'enviando') return <Clock size={13} className="opacity-60" aria-label="enviando" />;
  if (d === 'enviado') return <Check size={14} className="opacity-60" aria-label="enviado" />;
  if (d === 'falhou') return <X size={14} className="text-danger" aria-label="falhou" />;
  return <CheckCheck size={15} className={d === 'lido' ? 'text-[#34b7f1]' : 'opacity-60'} aria-label={d} />;
}

/* ---------- estados ---------- */
export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-muted" role="status"><Loader2 className="animate-spin" size={18} />{label}</div>;
}
export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      {icon && <div className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-brand">{icon}</div>}
      <div className="font-display text-lg font-bold">{title}</div>
      {children && <p className="max-w-md text-sm text-muted">{children}</p>}
      {action}
    </div>
  );
}
export function ErrorBox({ error }: { error: unknown }) {
  return <div role="alert" className="rounded-xl border border-danger/30 bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] px-4 py-3 text-sm text-danger">{error instanceof Error ? error.message : String(error)}</div>;
}

/* ---------- modal / gaveta ---------- */
export function Modal({ open, onClose, title, children, wide = false, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey); const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgb(8_20_16/.55)] p-0 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx('rise flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface shadow-card sm:rounded-3xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))' }}>{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- toasts ---------- */
type Toast = { id: number; text: string; tone: 'ok' | 'erro' | 'info' };
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4" style={{ bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))' }} aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx('rise pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-sm font-medium shadow-card', t.tone === 'erro' ? 'bg-danger text-white' : t.tone === 'info' ? 'bg-ink text-bg' : 'bg-brand text-brand-ink')}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- formulário ---------- */
export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
export function Toggle({ checked, onChange, label, description, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; id: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span><span className="block font-semibold">{label}</span>{description && <span className="block text-sm text-muted">{description}</span>}</span>
      <span className="relative mt-1 shrink-0">
        <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="block h-6 w-11 rounded-full bg-surface-3 transition peer-checked:bg-brand peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
export function Segmented<T extends string>({ value, onChange, options, className = '' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cx('inline-flex rounded-xl bg-surface-2 p-1', className)} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cx('rounded-lg px-3 py-1.5 text-sm font-semibold transition', value === o.value ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink')}>{o.label}</button>
      ))}
    </div>
  );
}
