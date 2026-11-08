import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, MessageCircle, Plus } from 'lucide-react';
import { errorMessage, useQuery, useRepo } from '../../lib/repo';
import { PageHead } from '../../components/ProviderLayout';
import { ErrorBox, Modal, PetAvatar, Segmented, Spinner, StatusPill, useToast } from '../../components/ui';
import { SIZE_SHORT } from '../../data/demo/catalog';
import { canTransition } from '../../domain/rules';
import { cx, fmtDateTime, fmtTime, formatBRL, formatPhone } from '../../lib/format';
import type { BookingStatus } from '../../domain/types';
import type { ProviderBooking } from '../../data/repository';
import { petPhoto } from '../../lib/media';

const H0 = 7, H1 = 21, PX = 46; // px por hora
const startOfWeek = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const TONE: Record<BookingStatus, string> = {
  pendente: 'border-warn bg-[color-mix(in_oklab,var(--warn)_16%,var(--surface))]', aguardando_cliente: 'border-info bg-[color-mix(in_oklab,var(--info)_14%,var(--surface))]',
  confirmado: 'border-ok bg-[color-mix(in_oklab,var(--ok)_14%,var(--surface))]', em_atendimento: 'border-brand bg-brand text-brand-ink', concluido: 'border-line bg-surface-2 text-muted',
  cancelado: 'border-danger/40 bg-surface opacity-50 line-through', recusado: 'border-danger/40 bg-surface opacity-50 line-through', nao_compareceu: 'border-danger/40 bg-surface opacity-60',
};

export function Agenda() {
  const [sp, setSp] = useSearchParams();
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const [view, setView] = useState<'semana' | 'lista'>(() => (typeof window !== 'undefined' && window.innerWidth < 900 ? 'lista' : 'semana'));
  const [statusF, setStatusF] = useState<'ativos' | BookingStatus | 'todos'>('ativos');
  const [openId, setOpenId] = useState<string | null>(null);
  const range = useMemo(() => ({ from: week.toISOString(), to: new Date(week.getTime() + 7 * 86400000).toISOString() }), [week]);
  const listRange = useMemo(() => ({ from: new Date(Date.now() - 30 * 86400000).toISOString(), to: new Date(Date.now() + 45 * 86400000).toISOString() }), []);
  const q = useQuery((r) => r.listProviderBookings(view === 'semana' ? range : listRange), [view, range.from]);
  const days = Array.from({ length: 7 }, (_, i) => new Date(week.getTime() + i * 86400000));
  const open = q.data?.find((b) => b.id === openId) ?? null;
  const isAllDay = (b: ProviderBooking) => b.service.durationMin >= 300;

  const list = (q.data ?? []).filter((b) => statusF === 'todos' || (statusF === 'ativos' ? ['pendente', 'aguardando_cliente', 'confirmado', 'em_atendimento'].includes(b.status) : b.status === statusF));

  return (
    <div>
      <PageHead title="Agenda" sub="Pedidos, confirmações e atendimentos. Cores mostram o status." actions={<button className="btn btn-primary btn-sm" onClick={() => setSp({ novo: '1' })}><Plus size={16} />Agendamento manual</button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={setView} options={[{ value: 'semana', label: 'Semana' }, { value: 'lista', label: 'Lista' }]} />
        {view === 'semana' ? (
          <div className="flex items-center gap-1">
            <button className="btn btn-outline btn-sm" onClick={() => setWeek(new Date(week.getTime() - 7 * 86400000))} aria-label="Semana anterior"><ChevronLeft size={16} /></button>
            <button className="btn btn-outline btn-sm" onClick={() => setWeek(startOfWeek(new Date()))}>Hoje</button>
            <button className="btn btn-outline btn-sm" onClick={() => setWeek(new Date(week.getTime() + 7 * 86400000))} aria-label="Próxima semana"><ChevronRight size={16} /></button>
            <b className="ml-2 text-sm">{days[0].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – {days[6].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</b>
          </div>
        ) : (
          <select className="input w-auto py-1.5 text-sm" value={statusF} onChange={(e) => setStatusF(e.target.value as typeof statusF)} aria-label="Filtrar status">
            <option value="ativos">Ativos</option><option value="pendente">Novos pedidos</option><option value="aguardando_cliente">Aguardando cliente</option><option value="confirmado">Confirmados</option><option value="concluido">Concluídos</option><option value="cancelado">Cancelados</option><option value="todos">Todos</option>
          </select>
        )}
        <div className="ml-auto hidden flex-wrap gap-1.5 text-xs md:flex">{(['pendente', 'aguardando_cliente', 'confirmado', 'em_atendimento', 'concluido'] as BookingStatus[]).map((s) => <StatusPill key={s} status={s} perspective="prestador" />)}</div>
      </div>

      {q.loading ? <Spinner /> : view === 'semana' ? (
        <div className="card overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="grid border-b border-line" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
              <div />
              {days.map((d) => { const today = d.toDateString() === new Date().toDateString(); return (
                <div key={d.toISOString()} className={cx('border-l border-line px-2 py-2 text-center', today && 'bg-ball/30')}>
                  <div className="text-xs font-semibold uppercase text-muted">{d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</div>
                  <div className={cx('font-display text-xl font-bold', today && 'text-brand')}>{d.getDate()}</div>
                </div>); })}
            </div>
            {/* dia inteiro (hospedagem/creche) */}
            <div className="grid border-b border-line" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
              <div className="px-1 py-2 text-[0.65rem] leading-tight text-muted">dia<br />inteiro</div>
              {days.map((d) => (
                <div key={d.toISOString()} className="space-y-1 border-l border-line p-1">
                  {(q.data ?? []).filter((b) => isAllDay(b) && new Date(b.start).toDateString() === d.toDateString()).map((b) => (
                    <button key={b.id} onClick={() => setOpenId(b.id)} className={cx('block w-full truncate rounded-md border-l-4 px-1.5 py-1 text-left text-[0.72rem] font-semibold', TONE[b.status])}>{b.pets.map((p) => p.name).join(', ')} · {b.service.name.replace(' (diária)', '')}</button>
                  ))}
                </div>
              ))}
            </div>
            <div className="relative grid" style={{ gridTemplateColumns: '56px repeat(7, 1fr)', height: (H1 - H0) * PX }}>
              <div className="relative">{Array.from({ length: H1 - H0 }, (_, i) => <div key={i} className="absolute right-2 text-[0.7rem] tabular text-muted" style={{ top: i * PX - 7 }}>{String(H0 + i).padStart(2, '0')}:00</div>)}</div>
              {days.map((d) => {
                const items = (q.data ?? []).filter((b) => !isAllDay(b) && new Date(b.start).toDateString() === d.toDateString());
                const cols: string[][] = [];
                const colOf = new Map<string, number>();
                for (const b of items) { let c = cols.findIndex((ids) => ids.every((id) => { const o = items.find((x) => x.id === id)!; return Date.parse(o.end) <= Date.parse(b.start) || Date.parse(o.start) >= Date.parse(b.end); })); if (c < 0) { cols.push([]); c = cols.length - 1; } cols[c].push(b.id); colOf.set(b.id, c); }
                const now = new Date(); const isToday = d.toDateString() === now.toDateString();
                return (
                  <div key={d.toISOString()} className="relative border-l border-line">
                    {Array.from({ length: H1 - H0 }, (_, i) => <div key={i} className="absolute inset-x-0 border-t border-dashed border-line/70" style={{ top: i * PX }} />)}
                    {isToday && now.getHours() >= H0 && now.getHours() < H1 && <div className="absolute inset-x-0 z-10 border-t-2 border-coral" style={{ top: (now.getHours() - H0 + now.getMinutes() / 60) * PX }}><span className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-coral" /></div>}
                    {items.map((b) => {
                      const s = new Date(b.start); const top = (s.getHours() - H0 + s.getMinutes() / 60) * PX; const h = Math.max(22, ((Date.parse(b.end) - s.getTime()) / 3600000) * PX - 2);
                      const n = cols.length; const c = colOf.get(b.id)!;
                      return (
                        <button key={b.id} onClick={() => setOpenId(b.id)} className={cx('absolute overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-[0.7rem] leading-tight shadow-sm', TONE[b.status])}
                          style={{ top, height: h, left: `calc(${(c / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)` }}>
                          <b className="block truncate">{fmtTime(b.start)} {b.pets.map((p) => p.name).join(', ')}</b><span className="block truncate opacity-80">{b.service.name}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <ul className="grid gap-2">
          {list.length === 0 && <li className="py-10 text-center text-muted">Nada com esse filtro.</li>}
          {list.map((b) => (
            <li key={b.id}>
              <button onClick={() => setOpenId(b.id)} className="card flex w-full flex-wrap items-center gap-3 p-3 text-left hover:border-brand">
                <span className="w-24 shrink-0 text-sm"><b className="block capitalize">{new Date(b.start).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</b><span className="tabular text-muted">{fmtTime(b.start)}</span></span>
                <div className="flex -space-x-2">{b.pets.map((p) => <PetAvatar key={p.id} species={p.species} seed={p.avatarSeed} src={petPhoto(p.id)} size={32} className="ring-2 ring-surface" />)}</div>
                <span className="min-w-0 flex-1"><b className="block truncate">{b.pets.map((p) => p.name).join(', ')} · {b.service.name}</b><span className="text-sm text-muted">{b.customer.name} · {b.code}</span></span>
                <StatusPill status={b.status} perspective="prestador" />
                <b className="w-24 text-right tabular">{b.priceCents ? formatBRL(b.priceCents) : 'pacote'}</b>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && <BookingDrawer b={open} onClose={() => setOpenId(null)} />}
      {sp.get('novo') && <ManualBooking onClose={() => setSp({})} />}
    </div>
  );
}

function BookingDrawer({ b, onClose }: { b: ProviderBooking; onClose: () => void }) {
  const repo = useRepo(); const toast = useToast();
  const [resched, setResched] = useState(false); const [when, setWhen] = useState(b.start.slice(0, 16));
  const [busy, setBusy] = useState(false);
  const convs = useQuery((r) => r.listConversations(), []);
  const conv = convs.data?.find((c) => c.customerId === b.customerId);
  const go = async (s: BookingStatus, msg: string, note?: string) => { setBusy(true); try { await repo.updateBookingStatus(b.id, s, note); toast(msg); } catch (e) { toast(errorMessage(e), 'erro'); } finally { setBusy(false); } };
  const can = (s: BookingStatus) => canTransition(b.status, s);
  return (
    <Modal open onClose={onClose} title={`${b.code} · ${b.service.name}`} wide
      footer={<>
        {b.status === 'pendente' && <><button disabled={busy} className="btn btn-danger" onClick={() => go('recusado', 'Recusado — tutor avisado', 'sem vaga no período')}>Recusar</button><button disabled={busy} className="btn btn-primary" onClick={() => go('confirmado', 'Aceito! Confirmação enviada no WhatsApp')}>Aceitar e pedir confirmação</button></>}
        {b.status === 'aguardando_cliente' && <button disabled={busy} className="btn btn-outline" onClick={() => go('confirmado', 'Confirmado manualmente')}>Marcar como confirmado</button>}
        {can('em_atendimento') && <button disabled={busy} className="btn btn-primary" onClick={() => go('em_atendimento', 'Check-in feito')}>Fazer check-in</button>}
        {can('concluido') && <button disabled={busy} className="btn btn-primary" onClick={() => go('concluido', 'Concluído — pedido de avaliação enviado')}>Concluir atendimento</button>}
        {can('nao_compareceu') && <button disabled={busy} className="btn btn-ghost" onClick={() => go('nao_compareceu', 'Marcado como não compareceu')}>Não compareceu</button>}
        {['pendente', 'aguardando_cliente', 'confirmado'].includes(b.status) && <button disabled={busy} className="btn btn-outline" onClick={() => setResched(!resched)}>Remarcar</button>}
        {can('cancelado') && b.status !== 'pendente' && <button disabled={busy} className="btn btn-danger" onClick={() => go('cancelado', 'Agendamento cancelado — tutor avisado', 'cancelado pelo prestador')}>Cancelar</button>}
      </>}>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center gap-2"><StatusPill status={b.status} perspective="prestador" /><span className="text-sm text-muted">{b.channel === 'app' ? 'pedido pelo app' : b.channel === 'whatsapp' ? 'via WhatsApp' : 'balcão'}</span></div>
          <div className="text-lg font-bold capitalize">{fmtDateTime(b.start)} → {fmtTime(b.end)}</div>
          <div className="text-sm"><b>{b.customer.name}</b><br /><span className="tabular text-muted">{formatPhone(b.customer.phone)}</span> · {b.customer.neighborhood}</div>
          <div className="text-sm">Valor: <b className="tabular">{b.priceCents ? formatBRL(b.priceCents) : 'sessão de pacote'}</b> · Local: {b.location === 'casa_tutor' ? 'casa do tutor' : b.location === 'busca_e_entrega' ? 'busca e entrega' : 'seu espaço'}</div>
          {b.notes && <p className="rounded-xl bg-surface-2 p-3 text-sm">“{b.notes}”</p>}
          {!b.customer.waOptIn && <p className="rounded-xl bg-[color-mix(in_oklab,var(--warn)_14%,transparent)] p-3 text-sm">Este tutor não autorizou WhatsApp. Ao aceitar, o pedido é confirmado direto e ele vê no app.</p>}
          {conv && <Link to={`/painel/whatsapp?c=${conv.id}`} className="btn btn-wa btn-sm"><MessageCircle size={15} />Abrir conversa</Link>}
          {resched && (
            <form className="flex flex-wrap items-end gap-2 rounded-xl border border-line p-3" onSubmit={async (e) => { e.preventDefault(); try { await repo.rescheduleBooking(b.id, new Date(when).toISOString()); toast('Remarcado — tutor precisa reconfirmar'); setResched(false); } catch (x) { toast(errorMessage(x), 'erro'); } }}>
              <div className="flex-1"><label className="label" htmlFor="rs">Novo horário</label><input id="rs" type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
              <button className="btn btn-primary btn-sm">Salvar</button>
            </form>
          )}
        </div>
        <div className="space-y-3">
          <div className="eyebrow">Ficha do pet</div>
          {b.pets.map((p) => (
            <div key={p.id} className="rounded-2xl border border-line p-3">
              <div className="flex items-center gap-2"><PetAvatar species={p.species} seed={p.avatarSeed} src={petPhoto(p.id)} size={40} /><div><b>{p.name}</b><div className="text-xs text-muted">{p.breed} · {SIZE_SHORT[p.size]} · {p.weightKg} kg · {new Date().getFullYear() - p.birthYear} anos</div></div></div>
              <p className="mt-2 text-sm"><b>Temperamento:</b> {p.temperament}</p>
              <p className="text-sm"><b>Cuidados:</b> {p.careNotes}</p>
              <p className={cx('mt-1 text-xs font-semibold', p.vaccinesUpToDate ? 'text-ok' : 'text-danger')}>{p.vaccinesUpToDate ? 'Vacinas em dia' : 'Vacinas pendentes — peça a carteirinha'}</p>
            </div>
          ))}
          <div className="eyebrow pt-2">Histórico</div>
          <ol className="space-y-1.5 text-sm">{[...b.timeline].reverse().map((e, i) => <li key={i} className="flex gap-2"><span className="w-28 shrink-0 text-xs tabular text-muted">{new Date(e.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>{e.label}</li>)}</ol>
        </div>
      </div>
    </Modal>
  );
}

function ManualBooking({ onClose }: { onClose: () => void }) {
  const repo = useRepo(); const toast = useToast();
  const customers = useQuery((r) => r.listCustomers(), []);
  const services = useQuery((r) => r.listServices(), []);
  const [f, setF] = useState({ customerId: '', serviceId: '', petIds: [] as string[], start: (() => { const d = new Date(Date.now() + 86400000); d.setHours(9, 0, 0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); })(), notes: '', channel: 'whatsapp' as const });
  const [err, setErr] = useState<unknown>(null);
  const cust = customers.data?.find((c) => c.customer.id === f.customerId);
  return (
    <Modal open onClose={onClose} title="Agendamento manual" footer={<><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={!f.customerId || !f.serviceId || !f.petIds.length} onClick={async () => { setErr(null); try { await repo.createManualBooking({ ...f, start: new Date(f.start).toISOString() }); toast('Agendamento criado — confirmação enviada no WhatsApp'); onClose(); } catch (e) { setErr(e); } }}>Criar e pedir confirmação</button></>}>
      {customers.loading ? <Spinner /> : (
        <div className="space-y-3">
          <p className="text-sm text-muted">Para pedidos que chegaram por telefone, Instagram ou balcão. O tutor recebe a confirmação no WhatsApp.</p>
          <div><label className="label" htmlFor="m-c">Cliente</label><select id="m-c" className="input" value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value, petIds: [] })}><option value="">Escolha…</option>{customers.data?.map((c) => <option key={c.customer.id} value={c.customer.id}>{c.customer.name} — {c.pets.map((p) => p.name).join(', ')}</option>)}</select></div>
          {cust && <div className="flex flex-wrap gap-2">{cust.pets.map((p) => <label key={p.id} className="chip cursor-pointer px-3 py-1.5"><input type="checkbox" className="accent-[var(--brand)]" checked={f.petIds.includes(p.id)} onChange={(e) => setF({ ...f, petIds: e.target.checked ? [...f.petIds, p.id] : f.petIds.filter((x) => x !== p.id) })} />{p.name}</label>)}</div>}
          <div><label className="label" htmlFor="m-s">Serviço</label><select id="m-s" className="input" value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value })}><option value="">Escolha…</option>{services.data?.map((s) => <option key={s.id} value={s.id}>{s.name} — {formatBRL(s.priceCents)}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="label" htmlFor="m-d">Quando</label><input id="m-d" type="datetime-local" className="input" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></div>
            <div><label className="label" htmlFor="m-ch">Origem</label><select id="m-ch" className="input" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value as 'whatsapp' })}><option value="whatsapp">WhatsApp</option><option value="balcao">Balcão / telefone</option></select></div></div>
          <div><label className="label" htmlFor="m-n">Observações</label><input id="m-n" className="input" value={f.notes} maxLength={300} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          {err ? <ErrorBox error={errorMessage(err)} /> : null}
        </div>
      )}
    </Modal>
  );
}
