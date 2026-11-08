import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { Award, CalendarDays, Cat, ChevronDown, CreditCard, Dog, Download, Camera, Heart, House, LayoutDashboard, Lock, LogOut, Moon, Package, PawPrint, QrCode, RefreshCw, Search, ShieldCheck, Sparkles, Sun, UserRound } from 'lucide-react';
import { BACKEND, useQuery, useRepo, useSession } from '../lib/repo';
import { Avatar, Logo, PetAvatar, Spinner, useToast } from './ui';
import { cx } from '../lib/format';
import type { Session } from '../domain/types';
import { personAvatar, categoryImage, petPhoto } from '../lib/media';
import { CATEGORIES } from '../data/demo/catalog';
import { CategoryIcon } from './CategoryIcon';
import { PageTransition, gsap, reducedMotion } from '../lib/motion';
import { BrandIcon, Wordmark } from './brand';
import { useActivePet } from '../lib/activePet';

export function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [pathname]);
  return null;
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && window.matchMedia?.('(prefers-color-scheme: dark)').matches));
  const ref = useRef<HTMLButtonElement>(null);
  const flip = () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next; setDark(!dark);
    try { localStorage.setItem('cuidope.theme', next); } catch { /* ignore */ }
    if (!reducedMotion() && ref.current) gsap.fromTo(ref.current.firstElementChild, { rotate: -90, scale: 0.4 }, { rotate: 0, scale: 1, duration: 0.5, ease: 'back.out(2)' });
  };
  return <button ref={ref} className={cx('btn btn-ghost btn-sm', className)} onClick={flip} aria-label={dark ? 'Usar tema claro' : 'Usar tema escuro'}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>;
}

/** Faixa de demonstração: troca de papel em 1 clique (só no modo demo). */
export function DemoBar() {
  const repo = useRepo(); const { session } = useSession(); const nav = useNavigate(); const toast = useToast();
  if (BACKEND !== 'demo') return null;
  const go = async (role: Session['role']) => { await repo.signInDemo(role); nav(role === 'tutor' ? '/conta' : '/painel'); toast(role === 'tutor' ? 'Você está vendo como a tutora Ana' : 'Você está vendo como a prestadora Carla', 'info'); };
  return (
    <div className="gutter bg-[#0b1640] text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-[0.8rem]">
        <span className="inline-flex items-center gap-1.5 font-bold"><span className="pulse-dot h-2 w-2 rounded-full bg-ball" />Demonstração</span>
        <span className="hidden opacity-70 sm:inline">dados e pessoas fictícios · nada é cobrado nem enviado de verdade</span>
        <span className="ml-auto flex flex-wrap items-center gap-1">
          <span className="opacity-70">Ver como:</span>
          <button onClick={() => go('tutor')} className={cx('rounded-lg px-2 py-0.5 font-bold transition', session?.role === 'tutor' ? 'bg-ball text-ball-ink' : 'hover:bg-white/10')}>Tutor</button>
          <button onClick={() => go('prestador')} className={cx('rounded-lg px-2 py-0.5 font-bold transition', session?.role === 'prestador' ? 'bg-ball text-ball-ink' : 'hover:bg-white/10')}>Prestador</button>
          <button onClick={async () => { await repo.resetDemo?.(); toast('Demonstração reiniciada', 'info'); }} className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 hover:bg-white/10" title="Reiniciar dados da demonstração"><RefreshCw size={12} />Reiniciar</button>
        </span>
      </div>
    </div>
  );
}

/** Animação de abertura de menus suspensos. */
function usePopIn(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (open && ref.current && !reducedMotion()) gsap.fromTo(ref.current, { opacity: 0, y: -8, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'power3.out' });
  }, [open]);
  return ref;
}

function UserMenu() {
  const { session } = useSession(); const repo = useRepo(); const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const pop = usePopIn(open);
  if (!session) return <Link to="/entrar" className="btn btn-outline btn-sm">Entrar</Link>;
  return (
    <div className="relative">
      <button className="flex items-center gap-2 rounded-full p-0.5 pr-2 transition hover:bg-surface-2" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        <Avatar name={session.name} seed={session.name.length * 7} src={personAvatar(session.name)} size={34} />
        <span className="hidden max-w-[10rem] truncate text-sm font-bold md:inline">{session.name.split(' ')[0]}</span>
        <ChevronDown size={14} className="hidden text-muted md:block" />
      </button>
      {open && (
        <div ref={pop} role="menu" className="absolute right-0 top-12 z-40 w-64 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-lift" onMouseLeave={() => setOpen(false)}>
          <div className="px-3 py-2 text-xs text-muted">Conectado como {session.role === 'tutor' ? 'tutor' : 'prestador'}</div>
          {session.role === 'tutor' ? (
            <>
              <MenuLink to="/conta" onClick={() => setOpen(false)}><CalendarDays size={15} />Meus agendamentos</MenuLink>
              <MenuLink to="/conta/pets" onClick={() => setOpen(false)}><PawPrint size={15} />Meus pets e vacinas</MenuLink>
              <MenuLink to="/conta/pacotes" onClick={() => setOpen(false)}><Package size={15} />Meus pacotes</MenuLink>
              <MenuLink to="/conta/clube" onClick={() => setOpen(false)}><Award size={15} />Clube Patinhas</MenuLink>
            </>
          ) : <MenuLink to="/painel" onClick={() => setOpen(false)}><LayoutDashboard size={15} />Painel do prestador</MenuLink>}
          <button role="menuitem" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-danger hover:bg-surface-2" onClick={async () => { await repo.signOut(); setOpen(false); nav('/'); }}><LogOut size={15} />Sair</button>
        </div>
      )}
    </div>
  );
}
const MenuLink = ({ to, children, onClick }: { to: string; children: ReactNode; onClick: () => void }) => (
  <Link role="menuitem" to={to} onClick={onClick} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-surface-2">{children}</Link>
);

/** "Meu pet" (inspirado no perfil do pet dos grandes pet shops): personaliza busca e recomendações. */
function PetPicker() {
  const { session } = useSession();
  const me = useQuery((r) => (session?.role === 'tutor' ? r.getMe() : Promise.resolve(null)), [session?.role]);
  const [active, setActive] = useActivePet();
  const [open, setOpen] = useState(false);
  const pop = usePopIn(open);
  const nav = useNavigate();
  const pets = me.data?.pets ?? [];
  if (session?.role !== 'tutor' || !pets.length) return null;
  const cur = pets.find((p) => p.id === active) ?? pets[0];
  return (
    <div className="relative hidden sm:block">
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" className="flex items-center gap-2 rounded-full border border-line bg-surface py-0.5 pl-0.5 pr-2.5 text-sm font-bold transition hover:border-brand">
        <PetAvatar species={cur.species} seed={cur.avatarSeed} src={petPhoto(cur.id)} size={28} />
        <span className="max-w-[6rem] truncate"><span className="font-semibold text-muted">Para </span>{cur.name}</span><ChevronDown size={14} className="text-muted" />
      </button>
      {open && (
        <div ref={pop} role="menu" className="absolute right-0 top-11 z-40 w-64 rounded-2xl border border-line bg-surface p-1.5 shadow-lift" onMouseLeave={() => setOpen(false)}>
          <div className="px-3 py-2 text-xs text-muted">Escolha o pet para personalizar a busca</div>
          {pets.map((p) => (
            <button key={p.id} role="menuitem" onClick={() => { setActive(p.id); setOpen(false); nav(`/buscar?especie=${p.species}&porte=${p.size}`); }}
              className={cx('flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2', p.id === cur.id && 'bg-brand-soft')}>
              <PetAvatar species={p.species} seed={p.avatarSeed} src={petPhoto(p.id)} size={36} />
              <span className="min-w-0"><b className="block text-sm">{p.name}</b><span className="block truncate text-xs text-muted">{p.breed}</span></span>
            </button>
          ))}
          <Link to="/conta/pets" onClick={() => setOpen(false)} className="mt-1 block rounded-xl px-3 py-2 text-sm font-semibold text-brand hover:bg-surface-2">Gerenciar pets e vacinas</Link>
        </div>
      )}
    </div>
  );
}

function HeaderSearch({ className = '' }: { className?: string }) {
  const nav = useNavigate(); const [q, setQ] = useState('');
  const submit = (e: FormEvent) => { e.preventDefault(); nav(q.trim() ? `/buscar?q=${encodeURIComponent(q.trim())}` : '/buscar'); };
  return (
    <form onSubmit={submit} role="search" className={cx('group relative', className)}>
      <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted transition group-focus-within:text-brand" />
      <input aria-label="Buscar serviços" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Passeio, banho e tosa, pet house…" className="input h-11 rounded-full border-transparent bg-surface-2 pl-10 pr-24 focus:bg-surface" />
      <button className="btn btn-primary btn-sm absolute right-1 top-1/2 h-9 -translate-y-1/2 rounded-full px-4" aria-label="Buscar no Cuidopê">Ir</button>
    </form>
  );
}

/** Menu de serviços com fotos (mega menu). */
function ServicesMenu() {
  const [open, setOpen] = useState(false);
  const pop = usePopIn(open);
  const timer = useRef<number>(0);
  const show = () => { window.clearTimeout(timer.current); setOpen(true); };
  const hide = () => { timer.current = window.setTimeout(() => setOpen(false), 120); };
  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={hide}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className={cx('flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold transition', open ? 'bg-brand-soft text-brand' : 'hover:bg-surface-2')}>
        <Sparkles size={15} />Todos os serviços<ChevronDown size={14} className={cx('transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div ref={pop} className="absolute left-0 top-11 z-40 grid w-[min(860px,calc(100vw-32px))] grid-cols-[1fr_240px] gap-4 rounded-3xl border border-line bg-surface p-4 shadow-lift">
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((c) => (
              <Link key={c.id} to={`/buscar?cat=${c.id}`} onClick={() => setOpen(false)} className="zoom-img group flex items-center gap-3 rounded-2xl p-2 transition hover:bg-surface-2">
                <span className="relative h-14 w-20 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                  {categoryImage(c.id) ? <img src={categoryImage(c.id)} alt="" className="img-cover" loading="lazy" /> : <span className="grid h-full place-items-center text-brand"><CategoryIcon id={c.id} size={22} /></span>}
                </span>
                <span className="min-w-0"><b className="block text-sm group-hover:text-brand">{c.label}</b><span className="line-clamp-2 text-xs text-muted">{c.description}</span></span>
              </Link>
            ))}
          </div>
          <Link to="/buscar?pacotes=1" onClick={() => setOpen(false)} className="relative flex flex-col justify-end overflow-hidden rounded-2xl bg-[#1838cc] p-4 text-white">
            <div className="dots absolute inset-0 opacity-30" />
            <Package className="relative mb-auto text-ball" size={28} />
            <b className="relative font-display text-xl leading-tight">Pacotes saem até 25% mais baratos</b>
            <span className="relative mt-1 text-sm text-white/80">Passeios, creche e banho com saldo no app.</span>
            <span className="btn btn-ball btn-sm relative mt-3 w-fit">Ver pacotes</span>
          </Link>
        </div>
      )}
    </div>
  );
}

const SHORTCUTS: { to: string; label: string; icon: typeof Dog }[] = [
  { to: '/buscar?especie=cao', label: 'Cachorro', icon: Dog },
  { to: '/buscar?especie=gato', label: 'Gato', icon: Cat },
  { to: '/buscar?cat=passeio', label: 'Passeio', icon: PawPrint },
  { to: '/buscar?cat=hospedagem', label: 'Pet house', icon: House },
  { to: '/buscar?cat=banho_tosa', label: 'Banho e tosa', icon: Sparkles },
  { to: '/buscar?pacotes=1', label: 'Pacotes', icon: Package },
  { to: '/clube', label: 'Clube Patinhas', icon: Award },
];

export function PublicLayout() {
  const { session } = useSession();
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-screen flex-col">
      <ScrollTop />
      <DemoBar />
      <header className="glass sticky z-30 border-b border-line" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="gutter mx-auto flex h-16 max-w-7xl items-center gap-3">
          <Link to="/" aria-label="Cuidopê — início" className="shrink-0"><Logo size={36} /></Link>
          <HeaderSearch className="ml-4 hidden max-w-xl flex-1 lg:block" />
          <div className="ml-auto flex items-center gap-1.5">
            <Link to="/buscar" className="btn btn-ghost btn-sm lg:hidden" aria-label="Abrir busca"><Search size={18} /></Link>
            <ThemeToggle />
            {session?.role === 'prestador'
              ? <Link to="/painel" className="btn btn-primary btn-sm"><LayoutDashboard size={15} />Meu painel</Link>
              : <Link to="/anunciar" className="btn btn-ball btn-sm hidden xl:inline-flex">Anunciar meus serviços</Link>}
            <PetPicker />
            <UserMenu />
          </div>
        </div>
        <nav className="gutter mx-auto flex max-w-7xl items-center gap-1 pb-2" aria-label="Atalhos">
          <div className="hidden md:block"><ServicesMenu /></div>
          <span className="mx-1 hidden h-5 w-px bg-line md:block" />
          <div className="scroll-x -mx-1 flex min-w-0 flex-1 gap-1 px-1">
            {SHORTCUTS.map(({ to, label, icon: I }) => (
              <Link key={to} to={to} className={cx('flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.82rem] font-bold text-muted transition hover:bg-surface-2 hover:text-ink', to === '/clube' && pathname === '/clube' && 'bg-brand-soft text-brand')}>
                <I size={15} />{label}
              </Link>
            ))}
          </div>
        </nav>
      </header>
      <main className="flex-1 pb-24 md:pb-0"><PageTransition><Outlet /></PageTransition></main>
      <Footer />
      <BottomNav />
    </div>
  );
}

function BottomNav() {
  const { session } = useSession();
  const { pathname } = useLocation();
  const wrap = useRef<HTMLDivElement>(null);
  const ind = useRef<HTMLSpanElement>(null);
  const items = session?.role === 'prestador'
    ? [{ to: '/', icon: House, label: 'Início' }, { to: '/buscar', icon: Search, label: 'Buscar' }, { to: '/painel', icon: LayoutDashboard, label: 'Painel' }]
    : [{ to: '/', icon: House, label: 'Início' }, { to: '/buscar', icon: Search, label: 'Buscar' }, { to: '/conta', icon: CalendarDays, label: 'Agenda' }, { to: '/conta/favoritos', icon: Heart, label: 'Favoritos' }, { to: session ? '/conta/pets' : '/entrar', icon: UserRound, label: session ? 'Pets' : 'Entrar' }];
  useLayoutEffect(() => {
    const a = wrap.current?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!ind.current) return;
    if (!a) { gsap.to(ind.current, { opacity: 0, duration: 0.2 }); return; }
    const x = a.offsetLeft + a.offsetWidth / 2 - 20;
    if (reducedMotion()) gsap.set(ind.current, { x, opacity: 1 });
    else gsap.to(ind.current, { x, opacity: 1, duration: 0.45, ease: 'back.out(1.6)' });
  }, [pathname, session?.role]);
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-30 border-t border-line md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} aria-label="Navegação do app">
      <div ref={wrap} className="gutter relative mx-auto flex max-w-lg justify-around">
        <span ref={ind} aria-hidden="true" className="absolute left-0 top-0 h-[3px] w-10 rounded-b-full bg-brand opacity-0" />
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink key={label} to={to} end={to === '/' || to === '/conta'} className={({ isActive }) => cx('flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.7rem] font-bold transition', isActive ? 'text-brand' : 'text-muted')}>
            <Icon size={21} strokeWidth={2.1} />{label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

const BENEFITS: [typeof ShieldCheck, string, string][] = [
  [ShieldCheck, 'Prestadores verificados', 'documento e endereço conferidos'],
  [Lock, 'Pagamento protegido', 'Pix e cartão; liberado após o atendimento'],
  [CalendarDays, 'Cancelamento claro', 'política visível antes de agendar'],
  [Heart, 'Avaliação só de cliente', 'ligada a um atendimento real'],
];

function Footer() {
  return (
    <footer className="mt-20 bg-[#0b1640] text-white">
      <div className="border-b border-white/10">
        <div className="gutter mx-auto grid max-w-7xl gap-4 py-6 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map(([Icon, t, d]) => (
            <div key={t} className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-ball"><Icon size={19} /></span><span><b className="block text-sm">{t}</b><span className="text-xs text-white/60">{d}</span></span></div>
          ))}
        </div>
      </div>
      <div className="gutter mx-auto grid max-w-7xl gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1.2fr]">
        <div className="space-y-4">
          <span className="inline-flex items-center gap-2"><BrandIcon size={40} badge /><Wordmark height={22} className="text-white" /></span>
          <p className="max-w-xs text-sm text-white/70">Cuidado pet perto de você, com avaliações de quem contratou e agendamento confirmado no WhatsApp.</p>
          <div className="flex gap-2">
            <a href="#/" aria-label="Rede social (demonstração)" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"><Camera size={17} /></a>
            <a href="#/" aria-label="WhatsApp (demonstração)" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.4-.1Z" /></svg></a>
          </div>
        </div>
        <FooterCol title="Para tutores" links={[['Buscar serviços', '/buscar'], ['Passeadores', '/buscar?cat=passeio'], ['Pet house', '/buscar?cat=hospedagem'], ['Veterinário em casa', '/buscar?cat=vet_domicilio'], ['Clube Patinhas', '/clube']]} />
        <FooterCol title="Para prestadores" links={[['Anunciar serviços', '/anunciar'], ['Planos', '/anunciar#planos'], ['Entrar no painel', '/entrar']]} />
        <FooterCol title="Cuidopê" links={[['Política de privacidade', '/privacidade'], ['Termos de uso', '/termos']]} />
        <div className="space-y-3">
          <div className="text-xs font-extrabold uppercase tracking-widest text-ball">Leve no celular</div>
          <InstallApp />
          <div className="pt-2 text-xs font-extrabold uppercase tracking-widest text-white/60">Formas de pagamento</div>
          <div className="flex flex-wrap gap-1.5">{['Pix', 'Visa', 'Master', 'Elo', 'Boleto'].map((x) => <span key={x} className="rounded-md bg-white px-2 py-0.5 text-[0.7rem] font-extrabold text-[#0b1640]">{x}</span>)}</div>
        </div>
      </div>
      <div className="gutter mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/10 py-5 text-xs text-white/55">
        <span>© {new Date().getFullYear()} Cuidopê · Versão de demonstração. Prestadores, tutores e avaliações exibidos são fictícios.</span>
        <span className="inline-flex items-center gap-1"><Lock size={12} />Site seguro (HTTPS)</span>
        <span className="inline-flex items-center gap-1"><ShieldCheck size={12} />Dados tratados conforme a LGPD</span>
        <span className="inline-flex items-center gap-1"><CreditCard size={12} />Pagamento real chega na próxima fase</span>
      </div>
    </footer>
  );
}
const FooterCol = ({ title, links }: { title: string; links: [string, string][] }) => (
  <div><div className="mb-3 text-xs font-extrabold uppercase tracking-widest text-white/60">{title}</div><ul className="space-y-2 text-sm">{links.map(([l, h]) => <li key={l}><Link to={h} className="text-white/85 transition hover:text-ball">{l}</Link></li>)}</ul></div>
);

/** Instalar como app (PWA). Usa o prompt nativo quando o navegador oferece. */
type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
function InstallApp() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [tip, setTip] = useState(false);
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);
  return (
    <div className="rounded-2xl bg-white/5 p-3">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-[#0b1640]"><QrCode size={30} /></span>
        <span className="text-xs text-white/70">Instale o Cuidopê na tela inicial: abre como app, sem loja.</span>
      </div>
      <button className="btn btn-ball btn-sm mt-3 w-full" onClick={async () => { if (evt) { await evt.prompt(); setEvt(null); } else setTip(true); }}><Download size={15} />Instalar o app</button>
      {tip && <p className="mt-2 text-xs text-white/70">No iPhone: Compartilhar → “Adicionar à Tela de Início”. No Android: menu ⋮ → “Instalar app”.</p>}
    </div>
  );
}

export function RequireRole({ role, children }: { role: Session['role']; children: ReactNode }) {
  const { session, ready } = useSession(); const loc = useLocation(); const repo = useRepo(); const nav = useNavigate();
  if (!ready) return <Spinner />;
  if (!session) return <Navigate to={`/entrar?next=${encodeURIComponent(loc.pathname)}&papel=${role}`} replace />;
  if (session.role !== role) {
    return (
      <div className="gutter mx-auto max-w-lg py-20 text-center">
        <BrandIcon size={72} badge className="mx-auto" />
        <h1 className="mt-5 text-2xl font-bold">Esta área é para {role === 'tutor' ? 'tutores' : 'prestadores'}</h1>
        <p className="mt-2 text-muted">Você entrou como {session.role}. {BACKEND === 'demo' ? 'Na demonstração dá para trocar de papel agora.' : 'Saia e entre com a conta certa.'}</p>
        {BACKEND === 'demo' && <button className="btn btn-primary mt-6" onClick={async () => { await repo.signInDemo(role); nav(loc.pathname); }}>Ver como {role === 'tutor' ? 'tutor' : 'prestador'}</button>}
      </div>
    );
  }
  return <>{children}</>;
}

export function NotFound() {
  return (
    <div className="gutter mx-auto max-w-lg py-24 text-center">
      <BrandIcon size={96} badge className="mx-auto" />
      <div className="mt-6 font-display text-6xl font-semibold text-brand">404</div>
      <h1 className="mt-2 text-2xl font-bold">Essa página fugiu para passear</h1>
      <p className="mt-2 text-muted">O endereço não existe ou mudou.</p>
      <Link to="/" className="btn btn-primary mt-6">Voltar ao início</Link>
    </div>
  );
}
