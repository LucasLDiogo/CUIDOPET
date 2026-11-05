import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, Bot, CalendarCheck, Columns3, FileText, Inbox, MessageCircle, Package, PawPrint, Search, Send, Smartphone, Tag, Timer, Wand2, X, Zap } from 'lucide-react';
import { BACKEND, errorMessage, useQuery, useRepo } from '../../lib/repo';
import { Avatar, CONV_LABEL, ConvPill, Delivery, Empty, Modal, PetAvatar, Segmented, Spinner, StatusPill, useToast } from '../../components/ui';
import { fillTemplate, formatPhone } from '../../domain/rules';
import { chatTime, cx, fmtDateTime, fmtTime, formatBRL, relTime } from '../../lib/format';
import type { ConversationStatus, Customer, Conversation, WaTemplate } from '../../domain/types';

type Conv = Conversation & { customer: Customer };
const FILTERS: { v: 'todas' | ConversationStatus; l: string }[] = [
  { v: 'todas', l: 'Todas' }, { v: 'aguardando_atendimento', l: 'Aguardando atendimento' }, { v: 'novo', l: 'Novos' }, { v: 'aguardando_cliente', l: 'Aguardando cliente' }, { v: 'agendado', l: 'Agendados' }, { v: 'resolvido', l: 'Resolvidos' },
];
const QUICK = ['Oi! Tudo bem? Já te respondo 😊', 'Tenho vaga sim! Quer que eu reserve?', 'Pode me mandar a carteirinha de vacinação?', 'O valor é o mesmo do app, sem taxa extra.', 'Combinado! Até lá 🐾'];

export function WhatsAppCRM() {
  const [sp, setSp] = useSearchParams();
  const convs = useQuery((r) => r.listConversations(), []);
  const settings = useQuery((r) => r.getSettings(), []);
  const [filter, setFilter] = useState<'todas' | ConversationStatus>('todas');
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'inbox' | 'kanban'>('inbox');
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 30000); return () => clearInterval(t); }, []); // atualiza SLA

  const all = convs.data ?? [];
  const selId = sp.get('c') ?? (sp.get('cliente') ? all.find((c) => c.customerId === sp.get('cliente'))?.id : undefined);
  const sel = all.find((c) => c.id === selId) ?? null;
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.v, f.v === 'todas' ? all.length : all.filter((c) => c.status === f.v).length])), [all]);
  const list = all.filter((c) => (filter === 'todas' || c.status === filter) && (!q || `${c.customer.name} ${c.lastMessagePreview} ${c.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => prio(a) - prio(b) || b.lastMessageAt.localeCompare(a.lastMessageAt));

  if (convs.loading) return <Spinner />;
  const missingCustomer = sp.get('cliente') && !sel;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">WhatsApp</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className={cx('inline-flex items-center gap-1 font-semibold', settings.data?.waConnected ? 'text-ok' : 'text-danger')}><span className={cx('h-2 w-2 rounded-full', settings.data?.waConnected ? 'bg-ok' : 'bg-danger')} />{settings.data?.waConnected ? `Conectado · ${formatPhone(settings.data.waNumber)}` : 'Desconectado'}</span>
            · SLA de 1ª resposta: {settings.data?.firstResponseSlaMin ?? 15} min · {BACKEND === 'demo' ? 'mensagens simuladas' : 'WhatsApp Cloud API'}
          </p>
        </div>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'inbox', label: <span className="inline-flex items-center gap-1"><Inbox size={15} />Caixa</span> }, { value: 'kanban', label: <span className="inline-flex items-center gap-1"><Columns3 size={15} />Funil</span> }]} />
      </div>

      {mode === 'kanban' ? <Kanban convs={all} open={(id) => { setMode('inbox'); setSp({ c: id }); }} /> : (
        <div className="card grid h-[calc(100vh-210px)] min-h-[560px] overflow-hidden lg:grid-cols-[340px_1fr] 2xl:grid-cols-[340px_1fr_300px]">
          {/* lista */}
          <div className={cx('flex min-h-0 flex-col border-r border-line', sel || missingCustomer ? 'hidden lg:flex' : 'flex')}>
            <div className="space-y-2 border-b border-line p-3">
              <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input py-2 pl-9 text-sm" placeholder="Buscar conversa ou etiqueta" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar conversa" /></div>
              <div className="scroll-x flex gap-1">{FILTERS.map((f) => <button key={f.v} onClick={() => setFilter(f.v)} className={cx('chip shrink-0', filter === f.v ? 'bg-ink text-bg' : 'hover:bg-surface-3')}>{f.l} <span className="opacity-60">{counts[f.v]}</span></button>)}</div>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {list.map((c) => (
                <li key={c.id}>
                  <button onClick={() => setSp({ c: c.id })} className={cx('flex w-full gap-3 border-b border-line px-3 py-3 text-left hover:bg-surface-2', sel?.id === c.id && 'bg-surface-2')}>
                    <Avatar name={c.customer.name} seed={c.customer.name.length * 3} size={42} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2"><b className="truncate">{c.customer.name}</b><span className={cx('ml-auto shrink-0 text-xs', c.unread ? 'font-bold text-wa' : 'text-muted')}>{chatTime(c.lastMessageAt)}</span></span>
                      <span className="flex items-center gap-2"><span className="truncate text-sm text-muted">{c.lastMessagePreview}</span>{c.unread > 0 && <span className="ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-wa px-1.5 text-[0.7rem] font-bold text-white">{c.unread}</span>}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1"><ConvPill status={c.status} className="px-2 py-0 text-[0.68rem]" /><Sla c={c} /></span>
                    </span>
                  </button>
                </li>
              ))}
              {!list.length && <li className="p-6 text-center text-sm text-muted">Nenhuma conversa aqui.</li>}
            </ul>
          </div>

          {/* chat */}
          <div className={cx('min-h-0 min-w-0 flex-col', sel || missingCustomer ? 'flex' : 'hidden lg:flex')}>
            {sel ? <Chat key={sel.id} conv={sel} onBack={() => setSp({})} /> : missingCustomer ? <NoConversation customerId={sp.get('cliente')!} onBack={() => setSp({})} /> : (
              <div className="grid flex-1 place-items-center bg-wa-bg p-8"><Empty icon={<MessageCircle />} title="Escolha uma conversa">Comece pelas <b>Aguardando atendimento</b>: elas estão com o relógio do SLA correndo.</Empty></div>
            )}
          </div>

          {/* ficha do cliente */}
          <div className="hidden min-h-0 overflow-y-auto border-l border-line 2xl:block">{sel ? <CustomerPanel conv={sel} /> : null}</div>
        </div>
      )}
    </div>
  );
}

const prio = (c: Conv) => ({ aguardando_atendimento: 0, novo: 1, aguardando_cliente: 2, agendado: 3, resolvido: 4 }[c.status]);

function Sla({ c }: { c: Conv }) {
  if (!c.slaDueAt || !(c.status === 'aguardando_atendimento' || c.status === 'novo')) return null;
  const left = (Date.parse(c.slaDueAt) - Date.now()) / 60000;
  return <span className={cx('inline-flex items-center gap-0.5 text-[0.68rem] font-semibold', left < 0 ? 'text-danger' : left < 5 ? 'text-warn' : 'text-muted')}><Timer size={11} />{left < 0 ? `SLA estourado há ${Math.round(-left)} min` : `responder em ${Math.max(1, Math.round(left))} min`}</span>;
}

function Chat({ conv, onBack }: { conv: Conv; onBack: () => void }) {
  const repo = useRepo(); const toast = useToast();
  const msgs = useQuery((r) => r.listMessages(conv.id), [conv.id]);
  const templates = useQuery((r) => r.listTemplates(), []);
  const bookings = useQuery((r) => r.listProviderBookings(), []);
  const me = useQuery((r) => r.getMyProvider(), []);
  const [text, setText] = useState(''); const [tplOpen, setTplOpen] = useState(false); const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const booking = bookings.data?.find((b) => b.id === conv.bookingId) ?? bookings.data?.filter((b) => b.customerId === conv.customerId && ['pendente', 'aguardando_cliente', 'confirmado'].includes(b.status)).sort((a, b) => a.start.localeCompare(b.start))[0];
  useEffect(() => { if (conv.unread) repo.markConversationRead(conv.id); }, [conv.id, conv.unread, repo]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.data?.length]);
  const lastIn = (msgs.data ?? []).filter((m) => m.from === 'cliente').map((m) => Date.parse(m.at)).sort().pop() ?? 0;
  const windowOpen = Date.now() - lastIn < 24 * 3600000;
  const hoursLeft = Math.max(0, 24 - (Date.now() - lastIn) / 3600000);

  const send = async (body: string, tpl?: WaTemplate) => {
    if (!body.trim()) return;
    setSending(true);
    try { await repo.sendMessage(conv.id, body, tpl); setText(''); } catch (e) { toast(errorMessage(e), 'erro'); } finally { setSending(false); }
  };
  const vars = (t: WaTemplate) => {
    const pet = booking?.pets.map((p) => p.name).join(' e ') ?? 'seu pet';
    return fillTemplate(t.body, { nome: conv.customer.name.split(' ')[0], pet, servico: booking?.service.name ?? 'o serviço', data: booking ? new Date(booking.start).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }) : 'a data combinada', hora: booking ? fmtTime(booking.start) : '', prestador: me.data?.name ?? '', codigo: booking?.code ?? '', pacote: 'seu pacote', saldo: '—', validade: '—' });
  };
  const accept = async () => { if (!booking) return; try { await repo.updateBookingStatus(booking.id, 'confirmado'); toast('Aceito! Pedido de confirmação enviado'); } catch (e) { toast(errorMessage(e), 'erro'); } };

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2.5">
        <button className="btn btn-ghost btn-sm lg:hidden" onClick={onBack} aria-label="Voltar"><ArrowLeft size={18} /></button>
        <Avatar name={conv.customer.name} seed={conv.customer.name.length * 3} size={38} />
        <div className="min-w-0 flex-1"><b className="block truncate">{conv.customer.name}</b><span className="whitespace-nowrap text-xs tabular text-muted">{formatPhone(conv.phone)}</span></div>
        <select className="input order-last w-full py-1.5 text-xs font-semibold sm:order-none sm:w-auto" value={conv.status} onChange={async (e) => { await repo.setConversationStatus(conv.id, e.target.value as ConversationStatus); toast(`Movida para “${CONV_LABEL[e.target.value as ConversationStatus]}”`, 'info'); }} aria-label="Status da conversa">
          {(Object.keys(CONV_LABEL) as ConversationStatus[]).map((s) => <option key={s} value={s}>{CONV_LABEL[s]}</option>)}
        </select>
        {BACKEND === 'demo' && <button className="btn btn-outline btn-sm hidden sm:inline-flex" title="Demonstração: simula a resposta do cliente" onClick={async () => { const m = await repo.simulateIncoming(conv.id); if (m) toast('Cliente respondeu (simulado)', 'info'); }}><Smartphone size={15} />Simular cliente</button>}
      </div>

      {booking && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-3 py-2 text-sm">
          <CalendarCheck size={16} className="text-brand" />
          <span className="min-w-0 flex-1 truncate"><b>{booking.code}</b> · {booking.service.name} · {booking.pets.map((p) => p.name).join(', ')} · {fmtDateTime(booking.start)}</span>
          <StatusPill status={booking.status} perspective="prestador" />
          {booking.status === 'pendente' && <button className="btn btn-primary btn-sm" onClick={accept}>Aceitar e pedir confirmação</button>}
          {booking.status === 'aguardando_cliente' && <span className="inline-flex items-center gap-1 text-xs text-info"><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-info" />esperando o “Confirmar”{booking.waConfirmation?.sentAt ? ` · enviado ${relTime(booking.waConfirmation.sentAt)}` : ''}</span>}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto bg-wa-bg px-3 py-4" style={{ backgroundImage: 'radial-gradient(color-mix(in oklab, var(--ink) 6%, transparent) 1px, transparent 1px)', backgroundSize: '18px 18px' }}>
        {msgs.loading ? <Spinner /> : (
          <div className="mx-auto flex max-w-2xl flex-col gap-1.5">
            {(msgs.data ?? []).map((m, i, arr) => {
              const showDay = i === 0 || new Date(arr[i - 1].at).toDateString() !== new Date(m.at).toDateString();
              return (
                <div key={m.id} className="contents">
                  {showDay && <div className="mx-auto my-2 rounded-lg bg-surface/90 px-2.5 py-0.5 text-[0.7rem] font-semibold text-muted">{new Date(m.at).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })}</div>}
                  {m.from === 'sistema' ? (
                    <div className="mx-auto my-1 max-w-[85%] rounded-lg bg-[color-mix(in_oklab,var(--ball)_55%,var(--surface))] px-2.5 py-1 text-center text-[0.75rem] font-semibold text-ball-ink">{m.text}</div>
                  ) : (
                    <div className={cx('max-w-[82%] rounded-2xl px-3 py-1.5 text-[0.92rem] shadow-sm', m.from === 'cliente' ? 'self-start rounded-tl-sm bg-surface' : 'self-end rounded-tr-sm bg-wa-bubble')}>
                      {m.template && <div className="mb-0.5 flex items-center gap-1 text-[0.68rem] font-semibold text-muted"><Bot size={11} />Modelo · {m.template}</div>}
                      <div className="whitespace-pre-wrap break-words">{m.text.split('*').map((t, k) => (k % 2 ? <b key={k}>{t}</b> : t))}</div>
                      <div className="mt-0.5 flex items-center justify-end gap-1 text-[0.66rem] text-muted">{fmtTime(m.at)}{m.from !== 'cliente' && <Delivery d={m.delivery} />}</div>
                      {m.buttons && <div className="-mx-3 mt-1 grid border-t border-line/70" style={{ gridTemplateColumns: `repeat(${Math.min(3, m.buttons.length)}, 1fr)` }}>{m.buttons.map((b) => <span key={b} className="py-1.5 text-center text-[0.8rem] font-semibold text-info">{b}</span>)}</div>}
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={end} />
          </div>
        )}
      </div>

      <div className="border-t border-line bg-surface p-2.5">
        <div className="scroll-x mb-2 flex gap-1.5">{QUICK.map((qr) => <button key={qr} onClick={() => setText(qr)} className="chip shrink-0 hover:bg-surface-3"><Zap size={11} />{qr}</button>)}</div>
        {!windowOpen && <div className="mb-2 rounded-xl bg-[color-mix(in_oklab,var(--warn)_14%,transparent)] px-3 py-2 text-xs"><b>Janela de 24 h fechada.</b> Pela regra do WhatsApp, só modelos aprovados podem reabrir a conversa.</div>}
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <button type="button" className="btn btn-outline btn-sm h-10" onClick={() => setTplOpen(true)} title="Modelos aprovados"><FileText size={16} /><span className="hidden sm:inline">Modelos</span></button>
          <textarea className="input max-h-32 min-h-10 flex-1 resize-none py-2" rows={1} placeholder={windowOpen ? 'Mensagem' : 'Use um modelo para retomar'} disabled={!windowOpen} value={text} maxLength={4096}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }} aria-label="Mensagem" />
          <button className="btn btn-wa h-10 w-10 p-0" disabled={sending || !text.trim() || !windowOpen} aria-label="Enviar"><Send size={17} /></button>
        </form>
        {windowOpen && lastIn > 0 && <p className="mt-1 text-[0.68rem] text-muted">Janela de atendimento aberta por mais {Math.floor(hoursLeft)} h.</p>}
      </div>

      <Modal open={tplOpen} onClose={() => setTplOpen(false)} title="Modelos aprovados do WhatsApp" wide>
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.data?.map((t) => (
            <div key={t.id} className={cx('flex flex-col rounded-2xl border border-line p-3', !t.approved && 'opacity-60')}>
              <div className="flex items-center gap-2"><b className="text-sm">{t.title}</b><span className={cx('chip ml-auto text-[0.65rem]', t.category === 'marketing' ? 'bg-ball/50' : '')}>{t.category === 'marketing' ? 'marketing' : 'utilidade'}</span></div>
              <code className="text-[0.68rem] text-muted">{t.name}</code>
              <p className="mt-2 flex-1 rounded-xl bg-wa-bubble p-2 text-sm">{vars(t)}</p>
              {t.buttons.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{t.buttons.map((b) => <span key={b} className="chip text-info">{b}</span>)}</div>}
              {t.category === 'marketing' && !conv.customer.marketingOptIn && <p className="mt-1 text-xs text-danger">Cliente não aceitou ofertas — bloqueado (LGPD).</p>}
              <button className="btn btn-primary btn-sm mt-2" disabled={!t.approved || (t.category === 'marketing' && !conv.customer.marketingOptIn)}
                onClick={async () => {
                  if (t.name === 'confirmacao_agendamento' && booking?.status === 'pendente') { await accept(); setTplOpen(false); return; }
                  await send(vars(t), t); setTplOpen(false);
                }}>{t.approved ? 'Enviar' : 'Aguardando aprovação da Meta'}</button>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}

function CustomerPanel({ conv }: { conv: Conv }) {
  const repo = useRepo(); const toast = useToast();
  const rows = useQuery((r) => r.listCustomers(), []);
  const row = rows.data?.find((x) => x.customer.id === conv.customerId);
  const [tag, setTag] = useState('');
  return (
    <div className="space-y-5 p-4">
      <div className="text-center"><Avatar name={conv.customer.name} seed={conv.customer.name.length * 3} size={64} /><div className="mt-2 font-bold">{conv.customer.name}</div><div className="text-sm tabular text-muted">{formatPhone(conv.customer.phone)}</div><div className="text-xs text-muted">{conv.customer.neighborhood}</div></div>
      <div className="flex flex-wrap justify-center gap-1.5 text-[0.7rem]">
        <span className={cx('chip', conv.customer.waOptIn ? 'text-ok' : 'text-danger')}>{conv.customer.waOptIn ? '✓ WhatsApp autorizado' : '✗ sem WhatsApp'}</span>
        <span className={cx('chip', conv.customer.marketingOptIn ? 'text-ok' : 'text-muted')}>{conv.customer.marketingOptIn ? '✓ aceita ofertas' : 'não aceita ofertas'}</span>
      </div>
      {row && (
        <dl className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-surface-2 p-2"><dt className="text-[0.7rem] text-muted">Agendamentos</dt><dd className="font-bold tabular">{row.bookings}</dd></div>
          <div className="rounded-xl bg-surface-2 p-2"><dt className="text-[0.7rem] text-muted">Total gasto</dt><dd className="font-bold tabular">{formatBRL(row.totalSpentCents)}</dd></div>
        </dl>
      )}
      <div>
        <div className="eyebrow mb-2 flex items-center gap-1"><PawPrint size={12} />Pets</div>
        {row?.pets.map((p) => <div key={p.id} className="mb-2 flex items-start gap-2 text-sm"><PetAvatar species={p.species} seed={p.avatarSeed} size={32} /><span><b>{p.name}</b> · {p.breed}<br /><span className="text-xs text-muted">{p.temperament}</span></span></div>)}
      </div>
      {!!row?.activePackages.length && (
        <div>
          <div className="eyebrow mb-2 flex items-center gap-1"><Package size={12} />Pacotes ativos</div>
          {row.activePackages.map((x) => <div key={x.id} className="rounded-xl bg-ball/30 p-2 text-sm"><b className="tabular">{x.sessionsTotal - x.sessionsUsed}</b> de {x.sessionsTotal} sessões · até {new Date(x.expiresAt).toLocaleDateString('pt-BR')}</div>)}
        </div>
      )}
      <div>
        <div className="eyebrow mb-2 flex items-center gap-1"><Tag size={12} />Etiquetas</div>
        <div className="flex flex-wrap gap-1">{conv.tags.map((t) => <button key={t} className="chip hover:bg-surface-3" onClick={() => repo.tagConversation(conv.id, conv.tags.filter((x) => x !== t))} aria-label={`Remover etiqueta ${t}`}>{t}<X size={11} /></button>)}</div>
        <form className="mt-2 flex gap-1" onSubmit={async (e) => { e.preventDefault(); if (!tag.trim()) return; await repo.tagConversation(conv.id, [...conv.tags, tag]); setTag(''); toast('Etiqueta adicionada'); }}>
          <input className="input py-1.5 text-sm" placeholder="nova etiqueta" maxLength={24} value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Nova etiqueta" /><button className="btn btn-outline btn-sm">+</button>
        </form>
      </div>
      <Link to="/painel/agenda?novo=1" className="btn btn-primary btn-sm w-full"><Wand2 size={15} />Novo agendamento</Link>
    </div>
  );
}

function NoConversation({ customerId, onBack }: { customerId: string; onBack: () => void }) {
  const rows = useQuery((r) => r.listCustomers(), []);
  const me = useQuery((r) => r.getMyProvider(), []);
  const row = rows.data?.find((x) => x.customer.id === customerId);
  if (!row) return <Spinner />;
  const text = `Oi, ${row.customer.name.split(' ')[0]}! Faz um tempinho que ${row.pets[0]?.name ?? 'seu pet'} não vem nos visitar. Que tal agendar esta semana? — ${me.data?.name ?? ''}`;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-wa-bg p-8 text-center">
      <button className="btn btn-ghost btn-sm self-start lg:hidden" onClick={onBack}><ArrowLeft size={16} />Voltar</button>
      <Avatar name={row.customer.name} seed={row.customer.name.length * 3} size={64} />
      <div><b>{row.customer.name}</b><p className="text-sm text-muted">Sem conversa aberta nos últimos 30 dias.</p></div>
      {row.customer.marketingOptIn ? (
        <>
          <p className="max-w-md rounded-2xl bg-wa-bubble p-3 text-left text-sm">{text}</p>
          <a className="btn btn-wa" href={`https://wa.me/${row.customer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} />Abrir no WhatsApp</a>
          <p className="text-xs text-muted">Com a API conectada, este envio sai pelo modelo aprovado “saudade_reativacao”.</p>
        </>
      ) : <p className="max-w-sm text-sm text-danger">Este cliente não aceitou receber ofertas. Pela LGPD, a reativação fica bloqueada até um novo contato dele.</p>}
    </div>
  );
}

function Kanban({ convs, open }: { convs: Conv[]; open: (id: string) => void }) {
  const repo = useRepo();
  const cols: ConversationStatus[] = ['novo', 'aguardando_atendimento', 'aguardando_cliente', 'agendado', 'resolvido'];
  return (
    <div className="scroll-x -mx-1 flex gap-3 px-1 pb-2">
      {cols.map((s) => {
        const items = convs.filter((c) => c.status === s);
        return (
          <section key={s} className="flex w-72 shrink-0 flex-col rounded-2xl bg-surface-2 p-2" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const id = e.dataTransfer.getData('text/plain'); if (id) repo.setConversationStatus(id, s); }}>
            <div className="flex items-center justify-between px-2 py-1.5"><ConvPill status={s} /><span className="text-sm font-bold tabular text-muted">{items.length}</span></div>
            <div className="mt-1 space-y-2">
              {items.map((c) => (
                <button key={c.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)} onClick={() => open(c.id)} className="card block w-full p-3 text-left hover:border-brand">
                  <div className="flex items-center gap-2"><Avatar name={c.customer.name} seed={c.customer.name.length * 3} size={28} /><b className="truncate text-sm">{c.customer.name}</b>{c.unread > 0 && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-wa px-1 text-[0.65rem] font-bold text-white">{c.unread}</span>}</div>
                  <p className="mt-1.5 line-clamp-2 text-xs text-muted">{c.lastMessagePreview}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">{c.tags.slice(0, 2).map((t) => <span key={t} className="chip px-1.5 py-0 text-[0.62rem]">{t}</span>)}<span className="ml-auto text-[0.65rem] text-muted">{chatTime(c.lastMessageAt)}</span></div>
                  <Sla c={c} />
                </button>
              ))}
              {!items.length && <p className="px-2 py-6 text-center text-xs text-muted">Arraste conversas para cá</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
