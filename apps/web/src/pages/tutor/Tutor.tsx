import { useState } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router';
import { Award, Bell, CalendarDays, Check, CheckCheck, Heart, MapPin, MessageCircle, Package, PawPrint, Pencil, Plus, RotateCcw, ShieldCheck, Star, Syringe, Trash2 } from 'lucide-react';
import { errorMessage, useQuery, useRepo } from '../../lib/repo';
import { SIZE_LABEL, SIZE_SHORT } from '../../data/demo/catalog';
import { Avatar, Empty, ErrorBox, Modal, PetAvatar, Segmented, Spinner, StatusPill, useToast } from '../../components/ui';
import { ProviderCard } from '../../components/ProviderCard';
import { cx, fmtDateTime, fmtTime, fmtWeekday, formatBRL, relTime } from '../../lib/format';
import type { Pet, PetSize, Review, Species } from '../../domain/types';
import type { TutorBooking } from '../../data/repository';
import { personAvatar, petPhoto, providerAvatar } from '../../lib/media';

export function TutorLayout() {
  const me = useQuery((r) => r.getMe(), []);
  const tabs = [['/conta', 'Agendamentos', CalendarDays], ['/conta/pets', 'Meus pets', PawPrint], ['/conta/pacotes', 'Pacotes', Package], ['/conta/clube', 'Clube', Award], ['/conta/favoritos', 'Favoritos', Heart]] as const;
  return (
    <div className="gutter mx-auto max-w-6xl py-6">
      <div className="flex items-center gap-3">
        {me.data && <Avatar name={me.data.customer.name} seed={me.data.customer.name.length * 7} src={personAvatar(me.data.customer.name)} size={56} className="ring-4 ring-surface" />}
        <div><div className="eyebrow">Minha conta</div><h1 className="text-2xl font-extrabold">Olá, {me.data?.customer.name.split(' ')[0] ?? ''}</h1></div>
      </div>
      <nav className="scroll-x mt-5 flex gap-1 border-b border-line" aria-label="Minha conta">
        {tabs.map(([to, l, I]) => <NavLink key={to} to={to} end={to === '/conta'} className={({ isActive }) => cx('flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold', isActive ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink')}><I size={16} />{l}</NavLink>)}
      </nav>
      <div className="mt-6"><Outlet /></div>
    </div>
  );
}

export function MyBookings() {
  const { data, loading, error } = useQuery((r) => r.listMyBookings(), []);
  const [tab, setTab] = useState<'proximos' | 'historico'>('proximos');
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  const now = Date.now();
  const upcoming = (data ?? []).filter((b) => Date.parse(b.end) >= now && !['cancelado', 'recusado', 'concluido'].includes(b.status)).sort((a, b) => a.start.localeCompare(b.start));
  const past = (data ?? []).filter((b) => !upcoming.includes(b));
  const actionNeeded = upcoming.filter((b) => b.status === 'aguardando_cliente');
  const toReview = past.filter((b) => b.status === 'concluido' && !b.reviewed && now - Date.parse(b.end) < 14 * 86400000);
  return (
    <div className="space-y-5">
      {actionNeeded.map((b) => (
        <Link key={b.id} to={`/conta/agendamento/${b.id}`} className="flex items-center gap-3 rounded-2xl bg-[color-mix(in_oklab,var(--info)_12%,transparent)] p-4">
          <Bell className="shrink-0 text-info" />
          <span className="flex-1 text-sm"><b>{b.provider.name} aceitou seu pedido.</b> Confirme o {b.service.name} de {fmtDateTime(b.start)} para garantir a vaga.</span>
          <span className="btn btn-primary btn-sm">Confirmar</span>
        </Link>
      ))}
      {toReview.map((b) => (
        <Link key={b.id} to={`/conta/agendamento/${b.id}`} className="flex items-center gap-3 rounded-2xl bg-ball/40 p-4">
          <Star className="shrink-0" />
          <span className="flex-1 text-sm"><b>Como foi com {b.provider.name}?</b> Avalie o {b.service.name} de {b.pets.map((p) => p.name).join(' e ')}.</span>
          <span className="btn btn-outline btn-sm">Avaliar</span>
        </Link>
      ))}
      <Segmented value={tab} onChange={setTab} options={[{ value: 'proximos', label: `Próximos (${upcoming.length})` }, { value: 'historico', label: `Histórico (${past.length})` }]} />
      {(tab === 'proximos' ? upcoming : past).length === 0 ? (
        <Empty icon={<CalendarDays />} title={tab === 'proximos' ? 'Nenhum agendamento futuro' : 'Sem histórico ainda'} action={<Link to="/buscar" className="btn btn-primary">Buscar serviços</Link>}>Encontre um prestador e peça um horário.</Empty>
      ) : (
        <ul className="grid gap-3">{(tab === 'proximos' ? upcoming : past).map((b) => <BookingRow key={b.id} b={b} />)}</ul>
      )}
    </div>
  );
}

function BookingRow({ b }: { b: TutorBooking }) {
  const d = new Date(b.start);
  return (
    <li className="card lift relative flex items-center gap-4 p-4 hover:border-brand">
      <Link to={`/conta/agendamento/${b.id}`} className="absolute inset-0 z-0 rounded-[22px]" aria-label={`Abrir ${b.service.name} de ${fmtDateTime(b.start)}`} />
        <div className="pointer-events-none w-14 shrink-0 rounded-2xl bg-brand-soft py-2 text-center text-brand">
          <div className="text-[0.68rem] font-bold uppercase text-muted">{d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</div>
          <div className="font-display text-2xl font-extrabold leading-none">{d.getDate()}</div>
          <div className="text-[0.7rem] tabular text-muted">{fmtTime(b.start)}</div>
        </div>
        <div className="pointer-events-none min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><b className="truncate">{b.service.name}</b><StatusPill status={b.status} /></div>
          <div className="truncate text-sm text-muted">{b.provider.name} · {b.pets.map((p) => p.name).join(', ')}</div>
          <div className="text-xs text-muted">Protocolo {b.code}{b.packagePurchaseId ? ' · pacote' : ''}</div>
        </div>
        <div className="relative z-[1] flex flex-col items-end gap-2">
          <b className="hidden tabular sm:block">{b.priceCents ? formatBRL(b.priceCents) : 'Pacote'}</b>
          {b.status === 'concluido' && <Link to={`/agendar/${b.provider.slug}?svc=${b.serviceId}`} className="btn btn-outline btn-sm"><RotateCcw size={14} />Agendar de novo</Link>}
        </div>
    </li>
  );
}

export function BookingDetail() {
  const { id = '' } = useParams(); const repo = useRepo(); const toast = useToast();
  const { data, loading } = useQuery((r) => r.listMyBookings().then((xs) => xs.find((x) => x.id === id) ?? null), [id]);
  const [cancelOpen, setCancelOpen] = useState(false); const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (loading) return <Spinner />;
  if (!data) return <Empty title="Agendamento não encontrado" />;
  const b = data;
  const reply = async (r: 'SIM' | 'NAO' | 'REMARCAR') => {
    setBusy(true);
    try { await repo.replyConfirmation(b.id, r); toast(r === 'SIM' ? 'Confirmado! Você recebe um lembrete na véspera.' : r === 'NAO' ? 'Agendamento cancelado' : 'Pedido de remarcação enviado'); }
    catch (e) { toast(errorMessage(e), 'erro'); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Link to="/conta" className="text-sm font-semibold text-muted hover:text-ink">← Agendamentos</Link>
        <div className="card p-5">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1"><div className="text-xs text-muted">Protocolo {b.code}</div><h2 className="text-2xl font-extrabold">{b.service.name}</h2><div className="mt-1 text-muted">{fmtWeekday(b.start)} · {fmtTime(b.start)}</div></div>
            <StatusPill status={b.status} />
          </div>
          <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
            <Info k="Prestador" v={<Link className="font-semibold text-brand" to={`/p/${b.provider.slug}`}>{b.provider.name}</Link>} />
            <Info k="Pet" v={b.pets.map((p) => p.name).join(', ')} />
            <Info k="Valor" v={b.priceCents ? formatBRL(b.priceCents) : 'Saldo do pacote'} />
            <Info k="Onde" v={b.location === 'casa_tutor' ? 'Na sua casa' : b.location === 'busca_e_entrega' ? 'Busca e entrega' : `${b.provider.neighborhood} (local do prestador)`} />
            <Info k="Canal" v={b.channel === 'app' ? 'App' : b.channel === 'whatsapp' ? 'WhatsApp' : 'Balcão'} />
          </div>
          {b.notes && <p className="mt-4 rounded-xl bg-surface-2 p-3 text-sm"><b>Suas observações:</b> {b.notes}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {b.status === 'aguardando_cliente' && <button className="btn btn-primary" disabled={busy} onClick={() => reply('SIM')}><Check size={16} />Confirmar agendamento</button>}
            {['pendente', 'aguardando_cliente', 'confirmado'].includes(b.status) && <button className="btn btn-danger" onClick={() => setCancelOpen(true)}>Cancelar</button>}
            {b.provider.whatsappPublic && <a className="btn btn-outline" href={`https://wa.me/${b.provider.whatsappPublic.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Sobre o agendamento ${b.code}…`)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} />Falar com o prestador</a>}
          </div>
        </div>

        {b.status === 'concluido' && !b.reviewed && <ReviewForm bookingId={b.id} providerName={b.provider.name} />}

        <div className="card p-5">
          <h3 className="font-bold">Linha do tempo</h3>
          <ol className="mt-3 space-y-0">
            {[...b.timeline].reverse().map((e, i) => (
              <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                <span className={cx('relative z-[1] mt-1 h-3 w-3 shrink-0 rounded-full', i === 0 ? 'bg-brand ring-4 ring-[color-mix(in_oklab,var(--brand)_20%,transparent)]' : 'bg-surface-3')} />
                {i < b.timeline.length - 1 && <span className="absolute left-[5px] top-4 h-full w-0.5 bg-surface-3" />}
                <span className="text-sm"><b>{e.label}</b><span className="block text-xs text-muted">{fmtDateTime(e.at)} · {e.by === 'whatsapp' ? 'via WhatsApp' : e.by}</span></span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* espelho do WhatsApp do tutor */}
      <aside>
        <div className="sticky top-24 overflow-hidden rounded-[28px] border-[6px] border-ink bg-wa-bg shadow-card">
          <div className="flex items-center gap-2 bg-[#075e54] px-4 py-3 text-white">
            <Avatar name={b.provider.name} seed={b.provider.avatarSeed} src={providerAvatar(b.provider.slug)} size={34} />
            <div className="min-w-0"><b className="block truncate text-sm">{b.provider.name}</b><span className="text-[0.7rem] opacity-80">conta comercial · via Cuidopê</span></div>
          </div>
          <div className="space-y-2 p-3 text-sm">
            <Bubble text={`Olá! Recebemos seu pedido de ${b.service.name} para ${b.pets.map((p) => p.name).join(' e ')}. ${b.provider.name} vai responder em breve. Protocolo ${b.code}.`} at={b.createdAt} />
            {b.waConfirmation && (
              <Bubble at={b.waConfirmation.sentAt} text={`${b.provider.name} aceitou o agendamento de ${b.service.name} para ${b.pets.map((p) => p.name).join(' e ')} em ${fmtDateTime(b.start)}. Toque em *Confirmar* para garantir sua vaga. 🐾`}
                buttons={b.status === 'aguardando_cliente' ? [['Confirmar', () => reply('SIM')], ['Remarcar', () => reply('REMARCAR')], ['Cancelar', () => reply('NAO')]] : undefined} disabled={busy} />
            )}
            {b.waConfirmation?.reply && <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-tr-sm bg-wa-bubble px-3 py-2">{b.waConfirmation.reply === 'SIM' ? 'Confirmar' : b.waConfirmation.reply === 'NAO' ? 'Cancelar' : 'Remarcar'}<span className="ml-2 inline-flex items-center gap-0.5 text-[0.65rem] text-muted">{b.waConfirmation.repliedAt && fmtTime(b.waConfirmation.repliedAt)}<CheckCheck size={12} className="text-[#34b7f1]" /></span></div>}
            {['confirmado', 'em_atendimento', 'concluido'].includes(b.status) && <div className="mx-auto w-fit rounded-lg bg-surface/90 px-2 py-1 text-[0.72rem] font-semibold text-ok">Agendamento {b.code} confirmado ✓</div>}
            {b.status === 'concluido' && <Bubble text={`${b.pets[0]?.name ?? 'Seu pet'} já está pronto(a)! Conta pra gente como foi? Sua avaliação ajuda outros tutores.`} at={b.end} />}
            {b.status === 'pendente' && <div className="mx-auto w-fit rounded-lg bg-surface/90 px-2 py-1 text-[0.72rem] text-muted">aguardando resposta do prestador…</div>}
          </div>
          <p className="border-t border-line bg-surface px-3 py-2 text-[0.7rem] text-muted">Prévia do que chega no seu WhatsApp. Os botões aqui funcionam igual aos da mensagem.</p>
        </div>
      </aside>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancelar agendamento" footer={<><button className="btn btn-ghost" onClick={() => setCancelOpen(false)}>Voltar</button><button className="btn btn-danger" onClick={async () => { try { await repo.cancelMyBooking(b.id, reason); toast('Agendamento cancelado'); setCancelOpen(false); } catch (e) { toast(errorMessage(e), 'erro'); } }}>Confirmar cancelamento</button></>}>
        <p className="text-sm text-muted">Política do prestador: {b.provider.cancellationPolicy === 'flexivel' ? 'grátis até 24 h antes' : b.provider.cancellationPolicy === 'moderada' ? 'grátis até 48 h antes; depois, 50% do valor' : 'grátis até 7 dias antes'}.{b.packagePurchaseId ? ' A sessão volta para o seu pacote.' : ''}</p>
        <label className="label mt-4" htmlFor="cancel-reason">Motivo (opcional)</label>
        <textarea id="cancel-reason" className="input min-h-20" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </div>
  );
}
const Info = ({ k, v }: { k: string; v: React.ReactNode }) => <div><div className="text-xs text-muted">{k}</div><div className="text-sm font-medium">{v}</div></div>;
function Bubble({ text, at, buttons, disabled }: { text: string; at: string; buttons?: [string, () => void][]; disabled?: boolean }) {
  return (
    <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-surface px-3 py-2 shadow-sm">
      <span>{text.split('*').map((t, i) => (i % 2 ? <b key={i}>{t}</b> : t))}</span>
      <div className="mt-0.5 text-right text-[0.65rem] text-muted">{fmtTime(at)}</div>
      {buttons && <div className="-mx-3 mt-1 grid border-t border-line">{buttons.map(([l, fn]) => <button key={l} disabled={disabled} onClick={fn} className="border-b border-line py-2 text-center text-sm font-semibold text-info last:border-0 hover:bg-surface-2">{l}</button>)}</div>}
    </div>
  );
}

function ReviewForm({ bookingId, providerName }: { bookingId: string; providerName: string }) {
  const repo = useRepo(); const toast = useToast();
  const [rating, setRating] = useState<Review['rating']>(5);
  const [aspects, setAspects] = useState({ pontualidade: 5, cuidado: 5, comunicacao: 5 });
  const [text, setText] = useState(''); const [err, setErr] = useState<unknown>(null);
  const StarsInput = ({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) => (
    <div role="radiogroup" aria-label={label} className="flex gap-1">{[1, 2, 3, 4, 5].map((i) => <button type="button" key={i} role="radio" aria-checked={value === i} aria-label={`${i} estrela${i > 1 ? 's' : ''}`} onClick={() => onChange(i)}><Star size={label === 'Nota geral' ? 30 : 20} className={i <= value ? 'text-[#f2b01e]' : 'text-line'} fill="currentColor" strokeWidth={0} /></button>)}</div>
  );
  return (
    <form className="card space-y-4 border-brand p-5" onSubmit={async (e) => { e.preventDefault(); setErr(null); try { await repo.submitReview(bookingId, { rating, aspects, text }); toast('Obrigado! Sua avaliação foi publicada.'); } catch (x) { setErr(x); } }}>
      <h3 className="text-lg font-bold">Como foi com {providerName}?</h3>
      <StarsInput value={rating} onChange={(v) => setRating(v as Review['rating'])} label="Nota geral" />
      <div className="grid gap-3 sm:grid-cols-3">
        {(['pontualidade', 'cuidado', 'comunicacao'] as const).map((k) => <div key={k}><div className="label capitalize">{k === 'comunicacao' ? 'Comunicação' : k}</div><StarsInput value={aspects[k]} onChange={(v) => setAspects({ ...aspects, [k]: v })} label={k} /></div>)}
      </div>
      <div><label className="label" htmlFor="rv-text">Conte para outros tutores</label><textarea id="rv-text" className="input min-h-24" maxLength={1200} value={text} onChange={(e) => setText(e.target.value)} placeholder="O que você mais gostou? Algo a melhorar?" /></div>
      {err ? <ErrorBox error={errorMessage(err)} /> : null}
      <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted">Publicamos seu primeiro nome e a inicial do sobrenome.</p><button className="btn btn-primary">Publicar avaliação</button></div>
    </form>
  );
}

export function MyPets() {
  const { data, loading } = useQuery((r) => r.getMe(), []);
  const repo = useRepo(); const toast = useToast();
  const [edit, setEdit] = useState<Pet | null | 'novo'>(null);
  if (loading) return <Spinner />;
  return (
    <div>
      <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Meus pets</h2><button className="btn btn-primary btn-sm" onClick={() => setEdit('novo')}><Plus size={16} />Adicionar pet</button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {data?.pets.map((p) => (
          <div key={p.id} className="card p-5">
            <div className="flex items-center gap-3"><PetAvatar species={p.species} seed={p.avatarSeed} src={petPhoto(p.id)} size={64} /><div className="min-w-0 flex-1"><div className="text-lg font-bold">{p.name}</div><div className="text-sm text-muted">{p.breed} · {new Date().getFullYear() - p.birthYear} anos · {p.weightKg} kg</div></div>
              <button className="btn btn-ghost btn-sm" onClick={() => setEdit(p)} aria-label={`Editar ${p.name}`}><Pencil size={16} /></button>
              <button className="btn btn-ghost btn-sm text-danger" aria-label={`Remover ${p.name}`} onClick={async () => { try { await repo.deletePet(p.id); toast('Pet removido'); } catch (e) { toast(errorMessage(e), 'erro'); } }}><Trash2 size={16} /></button>
            </div>
            <dl className="mt-4 grid gap-2 text-sm">
              <div className="flex flex-wrap gap-1.5"><span className="chip">{SIZE_SHORT[p.size]}</span><span className="chip">{p.species === 'cao' ? 'Cão' : 'Gato'}</span><span className={cx('chip', p.vaccinesUpToDate ? 'text-ok' : 'text-danger')}>{p.vaccinesUpToDate ? 'Vacinas em dia' : 'Vacinas pendentes'}</span></div>
              <div><dt className="text-xs text-muted">Temperamento</dt><dd>{p.temperament}</dd></div>
              <div><dt className="text-xs text-muted">Cuidados</dt><dd>{p.careNotes}</dd></div>
            </dl>
            <VaccineCard pet={p} />
          </div>
        ))}
      </div>
      <Modal open={edit !== null} onClose={() => setEdit(null)} title={edit === 'novo' ? 'Novo pet' : `Editar ${edit ? edit.name : ''}`}>
        {edit !== null && <PetForm pet={edit === 'novo' ? undefined : edit} onDone={() => setEdit(null)} onCancel={() => setEdit(null)} />}
      </Modal>
    </div>
  );
}

export function PetForm({ pet, onDone, onCancel }: { pet?: Pet; onDone: () => void; onCancel: () => void }) {
  const repo = useRepo(); const toast = useToast();
  const [f, setF] = useState({ name: pet?.name ?? '', species: pet?.species ?? ('cao' as Species), breed: pet?.breed ?? '', size: pet?.size ?? ('medio' as PetSize), birthYear: pet?.birthYear ?? new Date().getFullYear() - 2, weightKg: pet?.weightKg ?? 10, temperament: pet?.temperament ?? '', careNotes: pet?.careNotes ?? '', vaccinesUpToDate: pet?.vaccinesUpToDate ?? true });
  const [err, setErr] = useState<unknown>(null);
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); setErr(null); try { await repo.savePet({ ...f, id: pet?.id }); toast(pet ? 'Pet atualizado' : `${f.name} cadastrado(a)!`); onDone(); } catch (x) { setErr(x); } }}>
      <div><label className="label" htmlFor="pf-name">Nome</label><input id="pf-name" className="input" required maxLength={40} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div><span className="label">Espécie</span><Segmented value={f.species} onChange={(v) => setF({ ...f, species: v, size: v === 'gato' ? 'pequeno' : f.size })} options={[{ value: 'cao', label: 'Cão' }, { value: 'gato', label: 'Gato' }]} /></div>
      <div><label className="label" htmlFor="pf-breed">Raça</label><input id="pf-breed" className="input" maxLength={40} value={f.breed} onChange={(e) => setF({ ...f, breed: e.target.value })} placeholder="SRD, Shih Tzu…" /></div>
      <div><label className="label" htmlFor="pf-size">Porte</label><select id="pf-size" className="input" value={f.size} onChange={(e) => setF({ ...f, size: e.target.value as PetSize })}>{(Object.keys(SIZE_LABEL) as PetSize[]).map((s) => <option key={s} value={s}>{SIZE_LABEL[s]}</option>)}</select></div>
      <div><label className="label" htmlFor="pf-year">Ano de nascimento</label><input id="pf-year" className="input" type="number" min={1995} max={new Date().getFullYear()} value={f.birthYear} onChange={(e) => setF({ ...f, birthYear: Number(e.target.value) })} /></div>
      <div><label className="label" htmlFor="pf-w">Peso (kg)</label><input id="pf-w" className="input" type="number" min={0.5} max={120} step={0.1} value={f.weightKg} onChange={(e) => setF({ ...f, weightKg: Number(e.target.value) })} /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="pf-temp">Temperamento</label><input id="pf-temp" className="input" maxLength={160} value={f.temperament} onChange={(e) => setF({ ...f, temperament: e.target.value })} placeholder="Ex.: sociável, medo de fogos" /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="pf-care">Cuidados e medicação</label><textarea id="pf-care" className="input min-h-20" maxLength={400} value={f.careNotes} onChange={(e) => setF({ ...f, careNotes: e.target.value })} /></div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={f.vaccinesUpToDate} onChange={(e) => setF({ ...f, vaccinesUpToDate: e.target.checked })} />Vacinas em dia</label>
      {err ? <div className="sm:col-span-2"><ErrorBox error={errorMessage(err)} /></div> : null}
      <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button><button className="btn btn-primary">Salvar</button></div>
    </form>
  );
}

export function Favorites() {
  const repo = useRepo();
  const { data, loading } = useQuery(async (r) => { const ids = await r.listFavorites(); const all = await r.searchProviders({}); return all.filter((p) => ids.includes(p.id)); }, []);
  if (loading) return <Spinner />;
  if (!data?.length) return <Empty icon={<Heart />} title="Nenhum favorito ainda" action={<Link to="/buscar" className="btn btn-primary">Buscar prestadores</Link>}>Toque no coração de um prestador para guardar aqui.</Empty>;
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.map((p) => <ProviderCard key={p.id} p={p} fav onFav={() => repo.toggleFavorite(p.id)} />)}</div>;
}

export function MyPackages() {
  const { data, loading } = useQuery((r) => r.listMyPackages(), []);
  if (loading) return <Spinner />;
  if (!data?.length) return <Empty icon={<Package />} title="Você ainda não tem pacotes" action={<Link to="/buscar?pacotes=1" className="btn btn-primary">Ver prestadores com pacotes</Link>}>Pacotes de passeio, creche ou banho saem mais baratos que o avulso.</Empty>;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {data.map((x) => {
        const left = x.sessionsTotal - x.sessionsUsed; const pct = (x.sessionsUsed / x.sessionsTotal) * 100;
        return (
          <div key={x.id} className="card p-5">
            <div className="flex items-start justify-between gap-2"><div><b className="text-lg">{x.pkg.name}</b><div className="text-sm text-muted">{x.provider.name}</div></div><span className={cx('chip', x.status === 'ativo' ? 'bg-ball text-ball-ink' : 'text-muted')}>{x.status}</span></div>
            <div className="mt-4 flex items-baseline gap-1"><span className="font-display text-4xl font-extrabold tabular">{left}</span><span className="text-muted">de {x.sessionsTotal} sessões restantes</span></div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} /></div>
            <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm text-muted"><span><MapPin size={13} className="inline" /> {x.provider.neighborhood}</span><span>válido até {new Date(x.expiresAt).toLocaleDateString('pt-BR')} ({relTime(x.expiresAt)})</span></div>
            {x.status === 'ativo' && <Link to={`/agendar/${x.provider.slug}?svc=${x.pkg.serviceId}`} className="btn btn-primary btn-sm mt-4 w-full">Agendar usando o pacote</Link>}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- carteirinha de vacinação (inspirada no "perfil do pet" dos grandes pet shops) ---------- */
type Vac = { name: string; last: Date; next: Date };
function vaccinesFor(p: Pet): Vac[] {
  // Demonstração: datas derivadas do id do pet (estáveis). No produto, o tutor/vet registra cada dose.
  const h = [...p.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const names = p.species === 'gato' ? ['V5 (quíntupla felina)', 'Antirrábica', 'FeLV'] : ['V10 (múltipla)', 'Antirrábica', 'Gripe canina', 'Giárdia'];
  const today = Date.now();
  return names.map((name, i) => {
    let ago = 40 + ((h * (i + 3)) % 300);
    if (!p.vaccinesUpToDate && i === 0) ago = 380;
    const last = new Date(today - ago * 86400000); const next = new Date(last.getTime() + 365 * 86400000);
    return { name, last, next };
  });
}
function VaccineCard({ pet }: { pet: Pet }) {
  const [open, setOpen] = useState(false);
  const list = vaccinesFor(pet);
  const now = Date.now();
  const late = list.filter((v) => v.next.getTime() < now).length;
  const soon = list.filter((v) => v.next.getTime() >= now && v.next.getTime() - now < 45 * 86400000).length;
  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface-2/60">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 p-3 text-left">
        <span className={cx('grid h-9 w-9 place-items-center rounded-xl', late ? 'bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-danger' : 'bg-brand-soft text-brand')}><Syringe size={17} /></span>
        <span className="flex-1"><b className="block text-sm">Carteirinha de vacinação</b><span className="text-xs text-muted">{late ? `${late} vacina(s) atrasada(s)` : soon ? `${soon} vence(m) nos próximos 45 dias` : 'Tudo em dia'}</span></span>
        <span className="text-xs font-bold text-brand">{open ? 'Fechar' : 'Ver'}</span>
      </button>
      {open && (
        <ul className="divide-y divide-line border-t border-line px-3 text-sm">
          {list.map((v) => {
            const st = v.next.getTime() < now ? 'atrasada' : v.next.getTime() - now < 45 * 86400000 ? 'vence logo' : 'em dia';
            return (
              <li key={v.name} className="flex flex-wrap items-center gap-2 py-2.5">
                <ShieldCheck size={15} className={st === 'atrasada' ? 'text-danger' : st === 'vence logo' ? 'text-warn' : 'text-ok'} />
                <b className="flex-1">{v.name}</b>
                <span className="text-xs text-muted">última {v.last.toLocaleDateString('pt-BR')} · próxima {v.next.toLocaleDateString('pt-BR')}</span>
                <span className={cx('chip', st === 'atrasada' ? 'text-danger' : st === 'vence logo' ? 'text-warn' : 'text-ok')}>{st}</span>
              </li>
            );
          })}
          <li className="flex flex-wrap items-center justify-between gap-2 py-3">
            <span className="text-xs text-muted">Registro de demonstração. Vacine em casa com um veterinário a domicílio.</span>
            <Link to="/buscar?cat=vet_domicilio" className="btn btn-primary btn-sm"><Syringe size={14} />Agendar vacina em casa</Link>
          </li>
        </ul>
      )}
    </div>
  );
}
