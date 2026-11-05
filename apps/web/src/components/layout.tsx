import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { CalendarDays, Heart, House, LayoutDashboard, LogOut, Moon, RefreshCw, Search, Sun, UserRound } from 'lucide-react';
import { BACKEND, useRepo, useSession } from '../lib/repo';
import { Avatar, Logo, Spinner, useToast } from './ui';
import { cx } from '../lib/format';
import type { Session } from '../domain/types';

export function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [pathname]);
  return null;
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && window.matchMedia?.('(prefers-color-scheme: dark)').matches));
  const flip = () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next; setDark(!dark);
    try { localStorage.setItem('cuidope.theme', next); } catch { /* ignore */ }
  };
  return <button className={cx('btn btn-ghost btn-sm', className)} onClick={flip} aria-label={dark ? 'Usar tema claro' : 'Usar tema escuro'}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>;
}

/** Faixa de demonstração: troca de papel em 1 clique (só no modo demo). */
export function DemoBar() {
  const repo = useRepo(); const { session } = useSession(); const nav = useNavigate(); const toast = useToast();
  if (BACKEND !== 'demo') return null;
  const go = async (role: Session['role']) => { await repo.signInDemo(role); nav(role === 'tutor' ? '/conta' : '/painel'); toast(role === 'tutor' ? 'Você está vendo como a tutora Ana' : 'Você está vendo como a prestadora Carla', 'info'); };
  return (
    <div className="gutter bg-ink text-bg">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-[0.8rem]">
        <span className="inline-flex items-center gap-1.5 font-semibold"><span className="h-2 w-2 rounded-full bg-ball" />Demonstração</span>
        <span className="hidden opacity-75 sm:inline">dados e pessoas fictícios · nada é cobrado nem enviado de verdade</span>
        <span className="ml-auto flex flex-wrap items-center gap-1">
          <span className="opacity-70">Ver como:</span>
          <button onClick={() => go('tutor')} className={cx('rounded-md px-2 py-0.5 font-semibold', session?.role === 'tutor' ? 'bg-ball text-ball-ink' : 'hover:bg-white/10')}>Tutor</button>
          <button onClick={() => go('prestador')} className={cx('rounded-md px-2 py-0.5 font-semibold', session?.role === 'prestador' ? 'bg-ball text-ball-ink' : 'hover:bg-white/10')}>Prestador</button>
          <button onClick={async () => { await repo.resetDemo?.(); toast('Demonstração reiniciada', 'info'); }} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 hover:bg-white/10" title="Reiniciar dados da demonstração"><RefreshCw size={12} />Reiniciar</button>
        </span>
      </div>
    </div>
  );
}

function UserMenu() {
  const { session } = useSession(); const repo = useRepo(); const nav = useNavigate();
  const [open, setOpen] = useState(false);
  if (!session) return <Link to="/entrar" className="btn btn-outline btn-sm">Entrar</Link>;
  return (
    <div className="relative">
      <button className="flex items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-surface-2" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        <Avatar name={session.name} seed={session.name.length * 7} size={32} />
        <span className="hidden max-w-[10rem] truncate text-sm font-semibold md:inline">{session.name.split(' ')[0]}</span>
      </button>
      {open && (
        <div role="menu" className="rise absolute right-0 top-11 z-40 w-60 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-card" onMouseLeave={() => setOpen(false)}>
          <div className="px-3 py-2 text-xs text-muted">Conectado como {session.role === 'tutor' ? 'tutor' : 'prestador'}</div>
          {session.role === 'tutor' ? (
            <>
              <MenuLink to="/conta" onClick={() => setOpen(false)}>Meus agendamentos</MenuLink>
              <MenuLink to="/conta/pets" onClick={() => setOpen(false)}>Meus pets</MenuLink>
              <MenuLink to="/conta/pacotes" onClick={() => setOpen(false)}>Meus pacotes</MenuLink>
            </>
          ) : <MenuLink to="/painel" onClick={() => setOpen(false)}>Painel do prestador</MenuLink>}
          <button role="menuitem" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-danger hover:bg-surface-2" onClick={async () => { await repo.signOut(); setOpen(false); nav('/'); }}><LogOut size={15} />Sair</button>
        </div>
      )}
    </div>
  );
}
const MenuLink = ({ to, children, onClick }: { to: string; children: ReactNode; onClick: () => void }) => (
  <Link role="menuitem" to={to} onClick={onClick} className="block rounded-xl px-3 py-2 text-sm hover:bg-surface-2">{children}</Link>
);

export function PublicLayout() {
  const { session } = useSession();
  return (
    <div className="flex min-h-screen flex-col">
      <ScrollTop />
      <DemoBar />
      <header className="sticky z-30 border-b border-line bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] backdrop-blur-md" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="gutter mx-auto flex h-16 max-w-7xl items-center gap-3">
          <Link to="/" aria-label="Cuidopê — início"><Logo /></Link>
          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Principal">
            <TopLink to="/buscar">Buscar serviços</TopLink>
            <TopLink to="/buscar?cat=passeio">Passeios</TopLink>
            <TopLink to="/buscar?cat=hospedagem">Pet house</TopLink>
            <TopLink to="/buscar?cat=banho_tosa">Banho e tosa</TopLink>
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            {session?.role === 'prestador'
              ? <Link to="/painel" className="btn btn-primary btn-sm"><LayoutDashboard size={15} />Meu painel</Link>
              : <Link to="/anunciar" className="btn btn-ball btn-sm hidden sm:inline-flex">Anunciar meus serviços</Link>}
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="flex-1 pb-24 md:pb-0"><Outlet /></main>
      <Footer />
      <BottomNav />
    </div>
  );
}
const TopLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <NavLink to={to} className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-ink">{children}</NavLink>
);

function BottomNav() {
  const { session } = useSession();
  const items = session?.role === 'prestador'
    ? [{ to: '/', icon: House, label: 'Início' }, { to: '/buscar', icon: Search, label: 'Buscar' }, { to: '/painel', icon: LayoutDashboard, label: 'Painel' }]
    : [{ to: '/', icon: House, label: 'Início' }, { to: '/buscar', icon: Search, label: 'Buscar' }, { to: '/conta', icon: CalendarDays, label: 'Agenda' }, { to: '/conta/favoritos', icon: Heart, label: 'Favoritos' }, { to: session ? '/conta/pets' : '/entrar', icon: UserRound, label: session ? 'Pets' : 'Entrar' }];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} aria-label="Navegação do app">
      <div className="gutter mx-auto flex max-w-lg justify-around">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink key={label} to={to} end={to === '/' || to === '/conta'} className={({ isActive }) => cx('flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.7rem] font-semibold', isActive ? 'text-brand' : 'text-muted')}>
            <Icon size={21} strokeWidth={2.1} />{label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="gutter mx-auto grid max-w-7xl gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="text-sm text-muted">Cuidado pet perto de você, com avaliações de quem contratou e agendamento confirmado no WhatsApp.</p>
        </div>
        <FooterCol title="Para tutores" links={[['Buscar serviços', '/buscar'], ['Passeadores', '/buscar?cat=passeio'], ['Pet house e hospedagem', '/buscar?cat=hospedagem'], ['Veterinário em casa', '/buscar?cat=vet_domicilio']]} />
        <FooterCol title="Para prestadores" links={[['Anunciar serviços', '/anunciar'], ['Planos', '/anunciar#planos'], ['Entrar no painel', '/entrar']]} />
        <FooterCol title="Cuidopê" links={[['Política de privacidade', '/privacidade'], ['Termos de uso', '/termos']]} />
      </div>
      <div className="gutter mx-auto max-w-7xl border-t border-line py-4 text-xs text-muted">© {new Date().getFullYear()} Cuidopê · Versão de demonstração. Prestadores, tutores e avaliações exibidos são fictícios.</div>
    </footer>
  );
}
const FooterCol = ({ title, links }: { title: string; links: [string, string][] }) => (
  <div><div className="eyebrow mb-3">{title}</div><ul className="space-y-2 text-sm">{links.map(([l, h]) => <li key={h}><Link to={h} className="hover:text-brand">{l}</Link></li>)}</ul></div>
);

export function RequireRole({ role, children }: { role: Session['role']; children: ReactNode }) {
  const { session, ready } = useSession(); const loc = useLocation(); const repo = useRepo(); const nav = useNavigate();
  if (!ready) return <Spinner />;
  if (!session) return <Navigate to={`/entrar?next=${encodeURIComponent(loc.pathname)}&papel=${role}`} replace />;
  if (session.role !== role) {
    return (
      <div className="gutter mx-auto max-w-lg py-20 text-center">
        <h1 className="text-2xl font-bold">Esta área é para {role === 'tutor' ? 'tutores' : 'prestadores'}</h1>
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
      <div className="font-display text-6xl font-extrabold text-brand">404</div>
      <h1 className="mt-2 text-2xl font-bold">Essa página fugiu para passear</h1>
      <p className="mt-2 text-muted">O endereço não existe ou mudou.</p>
      <Link to="/" className="btn btn-primary mt-6">Voltar ao início</Link>
    </div>
  );
}
