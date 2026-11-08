import { useEffect, useRef, useState } from 'react';
import { gsap, reducedMotion, useGSAP } from '../lib/motion';
import { BrandIcon, Wordmark } from './brand';

/**
 * Tela de abertura: o selo da marca entra, o cão e o gato aparecem, o coração "bate",
 * o nome é revelado e a cortina azul sobe revelando o app. Na 2ª abertura da sessão roda acelerada.
 * Só sai quando o app está pronto (repositório carregado) e a animação terminou.
 */
export function Splash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [introDone, setIntroDone] = useState(false);
  const leaving = useRef(false);
  const quick = (() => { try { return sessionStorage.getItem('cuidope.splash') === '1'; } catch { return false; } })();

  useGSAP(() => {
    if (reducedMotion()) { setIntroDone(true); return; }
    const q = gsap.utils.selector(root);
    const t = gsap.timeline({ onComplete: () => setIntroDone(true) });
    t.from(q('.sp-glow'), { scale: 0.3, opacity: 0, duration: 1.2, ease: 'expo.out' }, 0)
      .from(q('.sp-badge'), { scale: 0.35, rotate: -14, opacity: 0, duration: 0.75, ease: 'back.out(1.9)' }, 0.05)
      .from(q('[data-part=blue]'), { opacity: 0, scale: 0.8, transformOrigin: '50% 60%', duration: 0.5 }, 0.35)
      .from(q('[data-part=heart]'), { scale: 0, transformOrigin: '50% 50%', duration: 0.7, ease: 'elastic.out(1, 0.45)' }, 0.6)
      .from(q('.sp-word'), { clipPath: 'inset(0 100% 0 0)', duration: 0.65, ease: 'power2.inOut' }, 0.55)
      .from(q('.sp-tag'), { opacity: 0, y: 10, duration: 0.45 }, 0.95)
      .from(q('.sp-paw'), { opacity: 0, scale: 0, stagger: 0.09, duration: 0.25, ease: 'back.out(3)' }, 0.7)
      .fromTo(q('.sp-bar'), { scaleX: 0 }, { scaleX: 1, duration: 1.45, ease: 'power1.inOut' }, 0);
    if (quick) t.timeScale(2.4);
    gsap.to(q('[data-part=heart]'), { scale: 1.18, transformOrigin: '50% 50%', duration: 0.38, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 1.3 / (quick ? 2.4 : 1) });
  }, { scope: root });

  useEffect(() => {
    if (!ready || !introDone || leaving.current) return;
    leaving.current = true;
    try { sessionStorage.setItem('cuidope.splash', '1'); } catch { /* sem storage */ }
    if (reducedMotion()) { gsap.to(root.current, { opacity: 0, duration: 0.2, onComplete: onDone }); return; }
    const q = gsap.utils.selector(root);
    gsap.timeline({ onComplete: onDone })
      .to(q('.sp-inner'), { scale: 0.9, opacity: 0, duration: 0.35, ease: 'power2.in' })
      .to(root.current, { yPercent: -100, duration: 0.75, ease: 'expo.inOut' }, '-=0.1');
  }, [ready, introDone, onDone]);

  return (
    <div ref={root} role="status" aria-label="Carregando o Cuidopê" className="fixed inset-0 z-[100] grid place-items-center overflow-hidden"
      style={{ background: 'radial-gradient(120% 90% at 50% 35%, #2A4FE8 0%, #1838CC 45%, #0F2595 100%)' }}>
      <div className="sp-glow pointer-events-none absolute left-1/2 top-[42%] h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FFD23F]/25 blur-3xl" />
      <div className="sp-inner relative flex flex-col items-center px-6 text-center text-white">
        <div className="sp-badge"><BrandIcon size={132} badge /></div>
        <div className="sp-word mt-6"><Wordmark height={52} /></div>
        <p className="sp-tag mt-3 text-[0.95rem] font-semibold text-white/80">Cuidado pet perto de você</p>
        <div className="mt-6 flex items-end gap-2" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <svg key={i} className="sp-paw" width="18" height="18" viewBox="0 0 24 24" fill="#FFD23F" style={{ transform: `translateY(${i % 2 ? -6 : 0}px) rotate(${i % 2 ? 12 : -12}deg)` }}>
              <ellipse cx="12" cy="15.5" rx="5" ry="4.2" /><circle cx="5.5" cy="10" r="2.2" /><circle cx="9.5" cy="5.8" r="2.2" /><circle cx="14.5" cy="5.8" r="2.2" /><circle cx="18.5" cy="10" r="2.2" />
            </svg>
          ))}
        </div>
        <div className="mt-7 h-1.5 w-48 overflow-hidden rounded-full bg-white/20"><div className="sp-bar h-full origin-left rounded-full bg-[#FFD23F]" /></div>
      </div>
    </div>
  );
}
