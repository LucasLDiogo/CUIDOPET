import { Link, useNavigate } from 'react-router';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, Check, MessageCircle, Package, PlayCircle, Sparkles, Star, UserRound } from 'lucide-react';
import { errorMessage, useQuery, useRepo } from '../../lib/repo';
import { PageHead } from '../../components/ProviderLayout';
import { PetAvatar, Spinner, StatusPill, useToast } from '../../components/ui';
import { cx, fmtTime, formatBRL, relTime } from '../../lib/format';
import type { DashboardData } from '../../domain/types';
import { petPhoto } from '../../lib/media';

export function Dashboard() {
  const dash = useQuery((r) => r.getDashboard(), []);
  const bks = useQuery((r) => r.listProviderBookings({ from: new Date(Date.now() - 86400000).toISOString(), to: new Date(Date.now() + 15 * 86400000).toISOString() }), []);
  const convs = useQuery((r) => r.listConversations(), []);
  const me = useQuery((r) => r.getMyProvider(), []);
  const repo = useRepo(); const toast = useToast(); const nav = useNavigate();
  if (dash.loading || !dash.data) return <Spinner />;
  const d = dash.data;
  const byId = new Map((bks.data ?? []).map((b) => [b.id, b]));
  const today = d.todayBookings.map((b) => byId.get(b.id)).filter(Boolean) as NonNullable<ReturnType<typeof byId.get>>[];
  const pending = (bks.data ?? []).filter((b) => b.status === 'pendente');
  const waitingConvs = (convs.data ?? []).filter((c) => c.status === 'aguardando_atendimento' || c.status === 'novo');
  const delta = d.prevMonthRevenueCents ? (d.monthRevenueCents - d.prevMonthRevenueCents) / d.prevMonthRevenueCents : 0;
  const act = async (id: string, st: 'confirmado' | 'em_atendimento' | 'concluido' | 'recusado', msg: string) => { try { await repo.updateBookingStatus(id, st, st === 'recusado' ? 'sem vaga no período' : undefined); toast(msg); } catch (e) { toast(errorMessage(e), 'erro'); } };
  const hour = new Date().getHours();

  return (
    <div>
      <PageHead title={hour < 12 ? 'Bom dia!' : hour < 18 ? 'Boa tarde!' : 'Boa noite!'} sub={`${me.data?.name ?? ''} · ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}`}
        actions={<Link to="/painel/agenda?novo=1" className="btn btn-primary btn-sm">+ Agendamento manual</Link>} />

      {me.data?.status === 'em_analise' && <div className="mb-5 rounded-2xl bg-ball/40 p-4 text-sm"><b>Seu perfil está em análise.</b> Cadastre serviços, horários e a apresentação enquanto isso. Ele aparece na busca depois da verificação de identidade.</div>}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi to="/painel/whatsapp" tone="coral" label="Aguardando atendimento" value={String(d.waitingAttention)} sub={waitingConvs[0] ? `mais antiga ${relTime(waitingConvs[waitingConvs.length - 1].lastMessageAt)}` : 'tudo respondido'} icon={<MessageCircle size={18} />} />
        <Kpi to="/painel/agenda" tone="warn" label="Novos pedidos" value={String(d.pendingCount)} sub={`${d.awaitingCustomerCount} aguardando cliente confirmar`} icon={<CalendarClock size={18} />} />
        <Kpi label="Hoje" tone="brand" value={`${d.todayBookings.length} atend.`} sub={`ocupação ${Math.round(d.occupancy * 100)}%`} icon={<PlayCircle size={18} />} />
        <Kpi label="Receita do mês" tone="ok" value={formatBRL(d.monthRevenueCents)} sub={<span>inclui confirmados futuros · mês passado {formatBRL(d.prevMonthRevenueCents)} {delta >= 0 ? <ArrowUpRight size={13} className="inline text-ok" /> : <ArrowDownRight size={13} className="inline text-muted" />}</span>} icon={<Sparkles size={18} />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <section className="card p-5">
          <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Hoje</h2><Link to="/painel/agenda" className="text-sm font-semibold text-brand">Abrir agenda</Link></div>
          {!today.length ? <p className="py-8 text-center text-sm text-muted">Nenhum atendimento hoje.</p> : (
            <ul className="mt-3 divide-y divide-line">
              {today.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="w-12 font-display text-lg font-bold tabular">{fmtTime(b.start)}</span>
                  <div className="flex -space-x-2">{b.pets.map((p) => <PetAvatar key={p.id} species={p.species} seed={p.avatarSeed} src={petPhoto(p.id)} size={34} className="ring-2 ring-surface" />)}</div>
                  <div className="min-w-0 flex-1"><b className="block truncate">{b.pets.map((p) => p.name).join(', ')} · {b.service.name}</b><span className="text-sm text-muted">{b.customer.name}</span></div>
                  <StatusPill status={b.status} perspective="prestador" />
                  {b.status === 'confirmado' && <button className="btn btn-outline btn-sm" onClick={() => act(b.id, 'em_atendimento', 'Check-in feito — tutor avisado no WhatsApp')}>Check-in</button>}
                  {b.status === 'em_atendimento' && <button className="btn btn-primary btn-sm" onClick={() => act(b.id, 'concluido', 'Concluído — pedido de avaliação enviado')}><Check size={15} />Concluir</button>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Pedidos para aceitar</h2><span className="chip bg-ball text-ball-ink">{pending.length}</span></div>
          {!pending.length ? <p className="py-8 text-center text-sm text-muted">Nenhum pedido esperando você. 🎉</p> : (
            <ul className="mt-3 space-y-2">
              {pending.slice(0, 5).map((b) => (
                <li key={b.id} className="rounded-2xl border border-line p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1"><b className="block truncate">{b.service.name} · {b.pets.map((p) => p.name).join(', ')}</b><span className="text-sm text-muted">{b.customer.name} · {new Date(b.start).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })} {fmtTime(b.start)}</span></div>
                    <b className="tabular">{b.priceCents ? formatBRL(b.priceCents) : 'pacote'}</b>
                  </div>
                  {b.notes && <p className="mt-1 line-clamp-2 text-xs text-muted">“{b.notes}”</p>}
                  <div className="mt-2 flex gap-2">
                    <button className="btn btn-primary btn-sm flex-1" onClick={() => act(b.id, 'confirmado', 'Aceito! Confirmação enviada ao WhatsApp do tutor')}>Aceitar e pedir confirmação</button>
                    <button className="btn btn-danger btn-sm" onClick={() => act(b.id, 'recusado', 'Pedido recusado — tutor avisado')}>Recusar</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <section className="card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-bold">Receita por semana</h2><span className="text-sm text-muted">confirmados e concluídos · últimas 8 semanas</span></div>
          <RevenueChart weekly={d.weekly} />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {d.topServices.map((s) => (
              <div key={s.name} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm"><span className="truncate">{s.name}</span><span className="tabular text-muted">{s.count}× · <b className="text-ink">{formatBRL(s.revenueCents)}</b></span></div>
            ))}
          </div>
        </section>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold"><AlertTriangle size={18} className="text-warn" />Oportunidades</h2>
            <div className="mt-3">
              <div className="eyebrow">Clientes sumidos (sem visita há {d.inactiveCustomers[0] ? '30+' : '—'} dias)</div>
              <ul className="mt-2 space-y-1.5">
                {d.inactiveCustomers.slice(0, 4).map((x) => (
                  <li key={x.customer.id} className="flex items-center gap-2 text-sm">
                    <UserRound size={15} className="text-muted" /><span className="flex-1 truncate">{x.customer.name}</span><span className="text-muted tabular">{x.days} dias</span>
                    <button className="btn btn-ghost btn-sm text-wa" onClick={() => nav(`/painel/whatsapp?cliente=${x.customer.id}`)}>Chamar</button>
                  </li>
                ))}
                {!d.inactiveCustomers.length && <li className="text-sm text-muted">Ninguém sumido. Ótimo!</li>}
              </ul>
            </div>
            <div className="mt-4">
              <div className="eyebrow">Horários livres para oferecer</div>
              <div className="mt-2 flex flex-wrap gap-1.5">{d.freeSlots.map((s) => <span key={s.start} className="chip bg-[color-mix(in_oklab,var(--ok)_14%,transparent)] text-ok">{s.label}</span>)}{!d.freeSlots.length && <span className="text-sm text-muted">Agenda cheia hoje e amanhã.</span>}</div>
              {d.freeSlots.length > 0 && <Link to="/painel/whatsapp" className="mt-2 inline-block text-sm font-semibold text-brand">Enviar “vaga liberada” para quem aceita ofertas →</Link>}
            </div>
          </section>
          <section className="grid grid-cols-3 gap-3">
            <Mini icon={<Star size={16} className="text-[#f2b01e]" />} k="Nota" v={d.rating ? d.rating.toFixed(2).replace('.', ',') : '—'} s={`${d.reviewCount} avaliações`} />
            <Mini icon={<MessageCircle size={16} className="text-wa" />} k="Resposta" v={`${Math.round(d.responseRate * 100)}%`} s="das mensagens" />
            <Mini icon={<Package size={16} className="text-info" />} k="Pacotes" v={String(d.activePackages)} s="ativos" />
          </section>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, icon, tone, to }: { label: string; value: string; sub: React.ReactNode; icon: React.ReactNode; tone: 'coral' | 'warn' | 'brand' | 'ok'; to?: string }) {
  const color = { coral: 'text-coral', warn: 'text-warn', brand: 'text-brand', ok: 'text-ok' }[tone];
  const inner = (
    <>
      <div className="flex items-center justify-between text-sm text-muted">{label}<span className={color}>{icon}</span></div>
      <div className={cx('mt-1 font-display text-[1.7rem] font-extrabold leading-tight tabular', color)}>{value}</div>
      <div className="mt-0.5 text-xs text-muted">{sub}</div>
    </>
  );
  return to ? <Link to={to} className="card block p-4 transition hover:border-brand">{inner}</Link> : <div className="card p-4">{inner}</div>;
}
const Mini = ({ icon, k, v, s }: { icon: React.ReactNode; k: string; v: string; s: string }) => (
  <div className="card p-3"><div className="flex items-center gap-1 text-xs text-muted">{icon}{k}</div><div className="font-display text-xl font-extrabold tabular">{v}</div><div className="text-[0.7rem] text-muted">{s}</div></div>
);

function RevenueChart({ weekly }: { weekly: DashboardData['weekly'] }) {
  const max = Math.max(1, ...weekly.map((w) => w.revenueCents));
  const nice = Math.ceil(max / 100000) * 100000; // degrau de R$ 1.000
  const W = 640, H = 220, L = 54, B = 26, T = 10;
  const bw = (W - L - 10) / weekly.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / nice);
  const ticks = [0, 0.5, 1].map((f) => nice * f);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full" role="img" aria-label="Gráfico de receita semanal">
      {ticks.map((t) => (
        <g key={t}><line x1={L} x2={W - 6} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t ? '3 4' : undefined} />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{(t / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</text></g>
      ))}
      {weekly.map((w, i) => {
        const x = L + i * bw + bw * 0.18; const h = (H - T - B) * (w.revenueCents / nice); const last = i === weekly.length - 1;
        return (
          <g key={w.label}>
            <rect x={x} y={y(w.revenueCents)} width={bw * 0.64} height={Math.max(0, h)} rx="6" fill={last ? 'var(--ball)' : 'var(--brand)'} opacity={last ? 1 : 0.85}><title>{`Semana de ${w.label}: ${formatBRL(w.revenueCents)} · ${w.bookings} agendamentos`}</title></rect>
            <text x={x + bw * 0.32} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{w.label}</text>
            {last && <text x={x + bw * 0.32} y={y(w.revenueCents) - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ink)">{(w.revenueCents / 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</text>}
          </g>
        );
      })}
    </svg>
  );
}
