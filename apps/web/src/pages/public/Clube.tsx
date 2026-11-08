import { useMemo, useRef } from 'react';
import { Link } from 'react-router';
import { Award, Bath, CalendarCheck, Crown, Gift, Heart, Lock, MessageSquareHeart, Package, Sparkles, Star, Ticket } from 'lucide-react';
import { useQuery, useSession, useRepo } from '../../lib/repo';
import { Spinner, useToast } from '../../components/ui';
import { cx, fmtDateTime } from '../../lib/format';
import { gsap, reducedMotion, Reveal, useGSAP, CountUp } from '../../lib/motion';
import { BrandIcon } from '../../components/brand';

/**
 * Clube Patinhas — programa de fidelidade (inspirado nos clubes de vantagens dos grandes pet shops).
 * Na demonstração o saldo é calculado a partir do histórico do tutor; resgates ficam registrados só na tela.
 */
export const LEVELS = [
  { name: 'Filhote', min: 0, perks: ['Lembrete de vacinas e banho', 'Histórico do pet sempre à mão'] },
  { name: 'Companheiro', min: 200, perks: ['5% de desconto em pacotes de prestadores participantes', 'Selo Companheiro no perfil'] },
  { name: 'Melhor Amigo', min: 600, perks: ['Prioridade em datas de pico (Natal, Ano Novo, feriadões)', 'Banho de cortesia por semestre em parceiros', '10% em pacotes participantes'] },
] as const;
const EARN = [
  { icon: CalendarCheck, pts: 10, t: 'Atendimento concluído', d: 'Passeio, banho, diária ou visita finalizados pelo app.' },
  { icon: MessageSquareHeart, pts: 50, t: 'Avaliação publicada', d: 'Contar como foi ajuda outros tutores e vale mais patinhas.' },
  { icon: Package, pts: 30, t: 'Pacote comprado', d: 'Cada pacote de passeio, creche ou banho.' },
];
const REWARDS = [
  { id: 'r1', icon: Ticket, cost: 150, t: 'R$ 10 de desconto', d: 'no próximo agendamento' },
  { id: 'r2', icon: Bath, cost: 400, t: 'Banho de cortesia', d: 'porte pequeno, em parceiros' },
  { id: 'r3', icon: Gift, cost: 700, t: 'Kit mimo do pet', d: 'petisco natural + brinquedo' },
];

export function levelOf(points: number) {
  const idx = LEVELS.reduce((a, l, i) => (points >= l.min ? i : a), 0);
  const cur = LEVELS[idx]; const next = LEVELS[idx + 1];
  const pct = next ? (points - cur.min) / (next.min - cur.min) : 1;
  return { cur, next, pct, idx };
}

/** Saldo do tutor calculado do histórico (demo). */
export function usePaws() {
  const { session } = useSession();
  const q = useQuery(async (r) => {
    if (session?.role !== 'tutor') return null;
    const [bks, pkgs] = await Promise.all([r.listMyBookings(), r.listMyPackages()]);
    const events: { at: string; label: string; pts: number }[] = [];
    bks.filter((b) => b.status === 'concluido').forEach((b) => {
      events.push({ at: b.end, label: `${b.service.name} com ${b.provider.name}`, pts: 10 });
      if (b.reviewed) events.push({ at: b.end, label: `Avaliação de ${b.provider.name}`, pts: 50 });
    });
    pkgs.forEach((p) => events.push({ at: p.purchasedAt ?? p.expiresAt, label: `Pacote ${p.pkg.name}`, pts: 30 }));
    events.sort((a, b) => b.at.localeCompare(a.at));
    return { total: events.reduce((s, e) => s + e.pts, 0), events };
  }, [session?.role]);
  return q;
}

function Ring({ pct, children }: { pct: number; children: React.ReactNode }) {
  const ref = useRef<SVGCircleElement>(null);
  const C = 2 * Math.PI * 54;
  useGSAP(() => {
    if (!ref.current) return;
    const to = C * (1 - Math.max(0.02, Math.min(1, pct)));
    if (reducedMotion()) gsap.set(ref.current, { strokeDashoffset: to });
    else gsap.fromTo(ref.current, { strokeDashoffset: C }, { strokeDashoffset: to, duration: 1.6, ease: 'power3.out', delay: 0.2 });
  }, { dependencies: [pct] });
  return (
    <div className="relative grid h-40 w-40 shrink-0 place-items-center">
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r="54" fill="none" stroke="var(--surface-3)" strokeWidth="10" />
        <circle ref={ref} cx="60" cy="60" r="54" fill="none" stroke="url(#paw-grad)" strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C} />
        <defs><linearGradient id="paw-grad" x1="0" x2="1"><stop offset="0" stopColor="#1838cc" /><stop offset="1" stopColor="#ffd23f" /></linearGradient></defs>
      </svg>
      <div className="text-center">{children}</div>
    </div>
  );
}

/** Cartão de saldo + extrato + resgates (aba "Clube" da conta do tutor). */
export function ClubeSaldo() {
  const q = usePaws(); const toast = useToast();
  const lv = useMemo(() => levelOf(q.data?.total ?? 0), [q.data?.total]);
  if (q.loading) return <Spinner />;
  if (!q.data) return <div className="card p-6 text-center"><p className="text-muted">Entre como tutor para ver suas patinhas.</p><Link to="/entrar?papel=tutor" className="btn btn-primary mt-4">Entrar</Link></div>;
  const { total, events } = q.data;
  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
      <div className="card relative overflow-hidden p-6">
        <div className="dots pointer-events-none absolute inset-0 opacity-50" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center gap-6">
          <Ring pct={lv.pct}>
            <div className="font-display text-4xl font-semibold tabular text-brand"><CountUp value={total} /></div>
            <div className="text-xs font-bold text-muted">patinhas</div>
          </Ring>
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Seu nível</div>
            <div className="mt-1 flex items-center gap-2 font-display text-3xl font-semibold">{lv.idx === 2 ? <Crown className="text-ball" /> : <Award className="text-brand" />}{lv.cur.name}</div>
            {lv.next ? <p className="mt-1 text-sm text-muted">Faltam <b className="text-ink">{lv.next.min - total} patinhas</b> para {lv.next.name}.</p> : <p className="mt-1 text-sm text-muted">Você está no nível máximo. 💛</p>}
            <ul className="mt-3 space-y-1 text-sm">{lv.cur.perks.map((p) => <li key={p} className="flex gap-2"><Sparkles size={15} className="mt-0.5 shrink-0 text-brand" />{p}</li>)}</ul>
          </div>
        </div>
        <h3 className="relative mt-6 font-semibold">Trocar patinhas</h3>
        <Reveal className="relative mt-3 grid gap-3 sm:grid-cols-3">
          {REWARDS.map((r) => {
            const ok = total >= r.cost;
            return (
              <div key={r.id} className={cx('rounded-2xl border p-4', ok ? 'border-brand/40 bg-brand-soft' : 'border-line bg-surface-2')}>
                <r.icon className={ok ? 'text-brand' : 'text-muted'} />
                <b className="mt-2 block">{r.t}</b><span className="text-xs text-muted">{r.d}</span>
                <button disabled={!ok} onClick={() => toast(`Resgate de "${r.t}" registrado (demonstração)`)} className={cx('btn btn-sm mt-3 w-full', ok ? 'btn-primary' : 'btn-outline')}>
                  {ok ? `Trocar ${r.cost}` : <><Lock size={13} />{r.cost} patinhas</>}
                </button>
              </div>
            );
          })}
        </Reveal>
      </div>
      <div className="card p-6">
        <h3 className="font-semibold">Extrato</h3>
        {events.length === 0 ? <p className="mt-3 text-sm text-muted">Conclua seu primeiro atendimento para ganhar patinhas.</p> : (
          <ul className="mt-3 max-h-[420px] divide-y divide-line overflow-y-auto">
            {events.slice(0, 30).map((e, i) => (
              <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-ball/40"><Star size={14} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{e.label}</span><span className="text-xs text-muted">{fmtDateTime(e.at)}</span></span>
                <b className="tabular text-ok">+{e.pts}</b>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 rounded-xl bg-surface-2 p-3 text-xs text-muted">Demonstração: o saldo é calculado do seu histórico. Os resgates passam a valer junto com o pagamento real.</p>
      </div>
    </div>
  );
}

/** Página pública do clube. */
export function ClubePage() {
  const { session } = useSession(); const repo = useRepo();
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    if (reducedMotion()) return;
    const q = gsap.utils.selector(root);
    gsap.from(q('.cl-badge'), { scale: 0, rotate: -30, duration: 0.9, ease: 'elastic.out(1, 0.5)', delay: 0.2 });
    gsap.from(q('.cl-pop'), { y: 30, opacity: 0, stagger: 0.1, duration: 0.7, delay: 0.3 });
    gsap.to(q('.cl-float'), { y: -10, duration: 2, yoyo: true, repeat: -1, stagger: 0.3, ease: 'sine.inOut' });
  }, { scope: root });
  return (
    <div>
      <section ref={root} className="gutter relative overflow-hidden bg-ball text-[#0b1640]">
        <div className="mx-auto grid max-w-7xl items-center gap-10 py-14 lg:grid-cols-[1.2fr_.8fr]">
          <div>
            <div className="cl-pop text-xs font-extrabold uppercase tracking-[.12em]">Programa de fidelidade</div>
            <h1 className="cl-pop mt-2 font-display text-5xl font-semibold leading-[1.02] sm:text-6xl">Clube Patinhas</h1>
            <p className="cl-pop mt-4 max-w-xl text-lg text-[#0b1640]/80">Cada cuidado que seu pet recebe pelo Cuidopê vira patinha. Junte, suba de nível e troque por desconto, banho de cortesia e prioridade nas datas mais disputadas.</p>
            <div className="cl-pop mt-7 flex flex-wrap gap-3">
              {session?.role === 'tutor' ? <Link to="/conta/clube" className="btn btn-primary"><Award size={17} />Ver minhas patinhas</Link>
                : <button className="btn btn-primary" onClick={async () => { await repo.signInDemo('tutor'); }}><Award size={17} />Ver como tutora (demo)</button>}
              <Link to="/buscar" className="btn border border-[#0b1640]/25 hover:bg-[#0b1640]/5">Agendar um serviço</Link>
            </div>
          </div>
          <div className="relative mx-auto" aria-hidden="true">
            <div className="cl-badge"><BrandIcon size={200} badge /></div>
            <span className="cl-float absolute -left-6 top-4 rounded-2xl bg-white px-3 py-2 text-sm font-bold shadow-lift">+10 🐾</span>
            <span className="cl-float absolute -right-4 top-24 rounded-2xl bg-[#1838cc] px-3 py-2 text-sm font-bold text-white shadow-lift">+50 avaliação</span>
            <span className="cl-float absolute -bottom-2 left-8 rounded-2xl bg-white px-3 py-2 text-sm font-bold shadow-lift">+30 pacote</span>
          </div>
        </div>
      </section>

      {session?.role === 'tutor' && <section className="gutter mx-auto mt-10 max-w-7xl"><ClubeSaldo /></section>}

      <section className="gutter mx-auto mt-14 max-w-7xl">
        <div className="eyebrow">Como ganhar</div>
        <h2 className="mt-1 text-3xl sm:text-4xl">Patinhas por tudo o que você já faz</h2>
        <Reveal className="mt-6 grid gap-4 md:grid-cols-3">
          {EARN.map((e) => (
            <div key={e.t} className="card lift p-6">
              <div className="flex items-center justify-between"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand"><e.icon /></span><span className="font-display text-3xl font-semibold text-brand">+{e.pts}</span></div>
              <h3 className="mt-4 text-lg font-semibold">{e.t}</h3><p className="mt-1 text-sm text-muted">{e.d}</p>
            </div>
          ))}
        </Reveal>
      </section>

      <section className="gutter mx-auto mt-14 max-w-7xl">
        <div className="eyebrow">Níveis</div>
        <h2 className="mt-1 text-3xl sm:text-4xl">Quanto mais cuidado, mais vantagem</h2>
        <Reveal className="mt-6 grid gap-4 md:grid-cols-3">
          {LEVELS.map((l, i) => (
            <div key={l.name} className={cx('lift rounded-3xl p-6', i === 2 ? 'bg-[#1838cc] text-white' : 'card')}>
              <div className="flex items-center gap-2">{i === 2 ? <Crown className="text-ball" /> : <Heart className="text-coral" />}<span className="text-xs font-extrabold uppercase tracking-widest opacity-70">a partir de {l.min} patinhas</span></div>
              <h3 className="mt-3 font-display text-3xl font-semibold">{l.name}</h3>
              <ul className="mt-4 space-y-2 text-sm">{l.perks.map((p) => <li key={p} className="flex gap-2"><Sparkles size={15} className={cx('mt-0.5 shrink-0', i === 2 ? 'text-ball' : 'text-brand')} />{p}</li>)}</ul>
            </div>
          ))}
        </Reveal>
        <p className="mt-6 text-xs text-muted">Programa em demonstração. Regras finais, prazos de validade das patinhas e parceiros participantes serão publicados junto com o pagamento real.</p>
      </section>
    </div>
  );
}
