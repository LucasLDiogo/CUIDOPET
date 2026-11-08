/**
 * Movimento do Cuidopê (GSAP 3). Regras: só transform/opacity (60 fps), nada de deslocamento horizontal
 * que gere rolagem lateral, e tudo desliga com prefers-reduced-motion (WCAG 2.3.3).
 */
import { useRef, type ReactNode, type ElementType } from 'react';
import { useLocation } from 'react-router';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);
gsap.defaults({ ease: 'power3.out', duration: 0.7 });

export { gsap, ScrollTrigger, SplitText, useGSAP };
export const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Entrada dos filhos diretos quando o bloco aparece na tela (stagger). */
export function Reveal({ children, className = '', as: Tag = 'div', y = 26, stagger = 0.07, delay = 0, start = 'top 92%', ...rest }:
  { children: ReactNode; className?: string; as?: ElementType; y?: number; stagger?: number; delay?: number; start?: string } & Record<string, unknown>) {
  const ref = useRef<HTMLElement>(null);
  const count = Array.isArray(children) ? children.length : 1;
  useGSAP(() => {
    if (reducedMotion() || !ref.current) return;
    const kids = Array.from(ref.current.children);
    if (!kids.length) return;
    gsap.from(kids, { opacity: 0, y, duration: 0.8, stagger, delay, clearProps: 'opacity,transform', scrollTrigger: { trigger: ref.current, start, once: true } });
  }, { scope: ref, dependencies: [count] });
  return <Tag ref={ref} className={className} {...rest}>{children}</Tag>;
}

/** Título com palavras subindo por máscara (SplitText). */
export function SplitHeading({ children, className = '', as: Tag = 'h1', delay = 0.1 }: { children: ReactNode; className?: string; as?: ElementType; delay?: number }) {
  const ref = useRef<HTMLElement>(null);
  useGSAP(() => {
    if (reducedMotion() || !ref.current) return;
    const split = SplitText.create(ref.current, { type: 'words', mask: 'words' });
    gsap.from(split.words, { yPercent: 110, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.06, delay, onComplete: () => split.revert() });
    return () => split.revert();
  }, { scope: ref });
  return <Tag ref={ref} className={className}>{children}</Tag>;
}

/** Número que conta até o valor quando aparece. */
export function CountUp({ value, decimals = 0, prefix = '', suffix = '', className = '' }: { value: number; decimals?: number; prefix?: string; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const fmt = (n: number) => prefix + n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
  useGSAP(() => {
    if (!ref.current) return;
    if (reducedMotion()) { ref.current.textContent = fmt(value); return; }
    const o = { n: 0 };
    gsap.to(o, { n: value, duration: 1.6, ease: 'power2.out', scrollTrigger: { trigger: ref.current, start: 'top 95%', once: true }, onUpdate: () => { if (ref.current) ref.current.textContent = fmt(o.n); } });
  }, { dependencies: [value] });
  return <span ref={ref} className={className}>{fmt(value)}</span>;
}

/** Transição entre páginas: o conteúdo novo sobe e aparece; barra amarela de progresso no topo. */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (reducedMotion() || !ref.current) return;
    gsap.fromTo(ref.current, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, clearProps: 'opacity,transform' });
    if (bar.current) gsap.fromTo(bar.current, { scaleX: 0, opacity: 1 }, { scaleX: 1, duration: 0.55, ease: 'power2.inOut', onComplete: () => { gsap.to(bar.current, { opacity: 0, duration: 0.25 }); } });
    requestAnimationFrame(() => ScrollTrigger.refresh());
  }, { dependencies: [pathname] });
  return (
    <>
      <div ref={bar} aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px] origin-left bg-ball opacity-0" />
      <div ref={ref}>{children}</div>
    </>
  );
}

/** Efeito "pop" com coraçõezinhos ao favoritar. */
export function burst(el: HTMLElement | null) {
  if (!el || reducedMotion()) return;
  gsap.fromTo(el, { scale: 0.7 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
  const rect = el.getBoundingClientRect();
  for (let i = 0; i < 7; i++) {
    const d = document.createElement('span');
    d.textContent = '❤';
    d.setAttribute('aria-hidden', 'true');
    Object.assign(d.style, { position: 'fixed', left: `${rect.left + rect.width / 2 - 5}px`, top: `${rect.top + rect.height / 2 - 8}px`, fontSize: '11px', pointerEvents: 'none', zIndex: '80', color: 'var(--coral)' });
    document.body.appendChild(d);
    const a = (Math.PI * 2 * i) / 7;
    gsap.to(d, { x: Math.cos(a) * 30, y: Math.sin(a) * 30 - 6, opacity: 0, scale: 1.4, duration: 0.7, ease: 'power2.out', onComplete: () => d.remove() });
  }
}

/** Confete de patinhas (sucesso de agendamento). Fica dentro da largura da tela. */
export function pawConfetti(origin?: HTMLElement | null) {
  if (reducedMotion()) return;
  const r = origin?.getBoundingClientRect();
  const cx = r ? r.left + r.width / 2 : window.innerWidth / 2; const cy = r ? r.top + 20 : window.innerHeight / 3;
  const colors = ['#1838CC', '#FFD23F', '#FF6B5B', '#18A06A'];
  const maxX = Math.min(window.innerWidth / 2 - 24, 220);
  for (let i = 0; i < 26; i++) {
    const d = document.createElement('span');
    d.setAttribute('aria-hidden', 'true');
    d.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="${colors[i % 4]}"><ellipse cx="12" cy="15.5" rx="5" ry="4.2"/><circle cx="5.5" cy="10" r="2.2"/><circle cx="9.5" cy="5.8" r="2.2"/><circle cx="14.5" cy="5.8" r="2.2"/><circle cx="18.5" cy="10" r="2.2"/></svg>`;
    Object.assign(d.style, { position: 'fixed', left: `${cx - 8}px`, top: `${cy}px`, pointerEvents: 'none', zIndex: '80' });
    document.body.appendChild(d);
    const x = (Math.random() - 0.5) * 2 * maxX; const up = 90 + Math.random() * 150;
    gsap.timeline({ onComplete: () => d.remove() })
      .to(d, { x, y: -up, rotation: (Math.random() - 0.5) * 360, duration: 0.7, ease: 'power2.out' })
      .to(d, { y: `+=${220 + Math.random() * 120}`, opacity: 0, duration: 0.9, ease: 'power1.in' }, '>-0.1');
  }
}
