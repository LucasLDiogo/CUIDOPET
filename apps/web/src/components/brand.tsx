import { ICON_BLUE, ICON_VIEWBOX, ICON_YELLOW, WORD_PATH, WORD_VIEWBOX } from './brandPaths';
import { cx } from '../lib/format';

/** Ícone da marca (cão + gato abraçados). `badge` coloca sobre o selo branco arredondado, como ícone de app. */
export function BrandIcon({ size = 36, badge = false, className = '', title }: { size?: number; badge?: boolean; className?: string; title?: string }) {
  const inner = badge ? Math.round(size * 0.8) : size;
  const svg = (
    <svg viewBox={ICON_VIEWBOX} width={inner} height={inner} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} className={badge ? '' : className}>
      <path data-part="blue" fill="#1838CC" fillRule="evenodd" d={ICON_BLUE} />
      <path data-part="heart" fill="#FFD23F" fillRule="evenodd" d={ICON_YELLOW} />
    </svg>
  );
  if (!badge) return svg;
  return (
    <span className={cx('inline-grid shrink-0 place-items-center bg-white shadow-[0_1px_0_rgb(11_22_64/.06),0_6px_16px_-8px_rgb(11_22_64/.35)]', className)}
      style={{ width: size, height: size, borderRadius: size * 0.3 }}>{svg}</span>
  );
}

/** Logotipo "Cuidopê" em vetor; herda a cor do texto (azul no claro, branco no escuro). */
export function Wordmark({ height = 22, className = '' }: { height?: number; className?: string }) {
  const [, , w, h] = WORD_VIEWBOX.split(' ').map(Number);
  return (
    <svg viewBox={WORD_VIEWBOX} height={height} width={Math.round((height * w) / h)} aria-hidden="true" className={className}>
      <path fill="currentColor" fillRule="evenodd" d={WORD_PATH} />
    </svg>
  );
}

export function Logo({ className = '', compact = false, size = 38 }: { className?: string; compact?: boolean; size?: number }) {
  return (
    <span className={cx('inline-flex items-center gap-2', /\btext-/.test(className) ? '' : 'text-brand-strong', className)}>
      <BrandIcon size={size} badge />
      {!compact && <Wordmark height={Math.round(size * 0.56)} />}
      <span className="sr-only">Cuidopê</span>
    </span>
  );
}
