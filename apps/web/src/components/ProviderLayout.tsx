import { Link, NavLink, Outlet } from 'react-router';
import { CalendarDays, ExternalLink, LayoutDashboard, MessageCircle, Package, Settings, Star, Store, Tags, Users } from 'lucide-react';
import { useQuery } from '../lib/repo';
import { Avatar, Logo } from './ui';
import { DemoBar, ScrollTop, ThemeToggle } from './layout';
import { cx } from '../lib/format';

export function ProviderLayout() {
  const me = useQuery((r) => r.getMyProvider(), []);
  const convs = useQuery((r) => r.listConversations(), []);
  const bk = useQuery((r) => r.listProviderBookings({ from: new Date().toISOString(), to: new Date(Date.now() + 60 * 86400000).toISOString() }), []);
  const waiting = convs.data?.filter((c) => c.status === 'aguardando_atendimento' || c.status === 'novo').length ?? 0;
  const pending = bk.data?.filter((b) => b.status === 'pendente').length ?? 0;
  const nav = [
    { to: '/painel', l: 'Visão geral', I: LayoutDashboard, end: true },
    { to: '/painel/agenda', l: 'Agenda', I: CalendarDays, badge: pending },
    { to: '/painel/whatsapp', l: 'WhatsApp', I: MessageCircle, badge: waiting, hot: true },
    { to: '/painel/servicos', l: 'Serviços', I: Tags },
    { to: '/painel/pacotes', l: 'Pacotes', I: Package },
    { to: '/painel/clientes', l: 'Clientes', I: Users },
    { to: '/painel/avaliacoes', l: 'Avaliações', I: Star },
    { to: '/painel/perfil', l: 'Perfil público', I: Store },
    { to: '/painel/config', l: 'Automação', I: Settings },
  ];
  const p = me.data;
  return (
    <div className="min-h-screen">
      <ScrollTop />
      <DemoBar />
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
          <div className="flex h-16 items-center px-5"><Link to="/"><Logo /></Link></div>
          {p && (
            <div className="mx-3 mb-3 flex items-center gap-2.5 rounded-2xl bg-surface-2 p-2.5">
              <Avatar name={p.name} seed={p.avatarSeed} size={38} />
              <div className="min-w-0"><b className="block truncate text-sm">{p.name}</b><span className="text-xs capitalize text-muted">Plano {p.plan === 'pro' ? 'Pro Regional' : p.plan}{p.status === 'em_analise' ? ' · em análise' : ''}</span></div>
            </div>
          )}
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Painel">
            {nav.map(({ to, l, I, end, badge, hot }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold', isActive ? 'bg-brand text-brand-ink' : 'text-muted hover:bg-surface-2 hover:text-ink')}>
                <I size={18} />{l}
                {!!badge && <span className={cx('ml-auto grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[0.7rem] font-bold', hot ? 'bg-coral text-white' : 'bg-ball text-ball-ink')}>{badge}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="space-y-1 border-t border-line p-3">
            {p && <Link to={`/p/${p.slug}`} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted hover:bg-surface-2"><ExternalLink size={15} />Ver meu perfil público</Link>}
            <ThemeToggle className="w-full justify-start" />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky z-30 flex h-14 items-center gap-2 border-b border-line bg-surface px-4 lg:hidden" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
            <Link to="/"><Logo compact /></Link>
            <b className="truncate text-sm">{p?.name}</b>
            <ThemeToggle className="ml-auto" />
          </header>
          <main className="gutter mx-auto max-w-[1400px] py-6 pb-28 lg:pb-10"><Outlet /></main>
        </div>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} aria-label="Painel (celular)">
        <div className="scroll-x flex">
          {nav.map(({ to, l, I, end, badge, hot }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => cx('relative flex min-w-[4.6rem] flex-1 flex-col items-center gap-0.5 py-2 text-[0.66rem] font-semibold', isActive ? 'text-brand' : 'text-muted')}>
              <I size={20} />{l.split(' ')[0]}
              {!!badge && <span className={cx('absolute right-3 top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[0.6rem] font-bold', hot ? 'bg-coral text-white' : 'bg-ball text-ball-ink')}>{badge}</span>}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>{sub && <p className="mt-1 text-muted">{sub}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
