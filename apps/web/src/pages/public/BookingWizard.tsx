import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCheck, Clock, Hourglass, MessageCircle, Package, Plus, ShieldCheck } from 'lucide-react';
import { errorMessage, useQuery, useRepo, useSession } from '../../lib/repo';
import { SIZE_SHORT, UNIT_LABEL } from '../../data/demo/catalog';
import { Avatar, ErrorBox, PetAvatar, Spinner, useToast } from '../../components/ui';
import { NotFound } from '../../components/layout';
import { PetForm } from '../tutor/Tutor';
import { bookingPriceCents, formatPhone } from '../../domain/rules';
import { cx, fmtTime, fmtWeekday, formatBRL } from '../../lib/format';
import type { Booking, Booking as B } from '../../domain/types';

const STEPS = ['Serviço', 'Pet', 'Horário', 'Confirmar'] as const;

export function BookingWizard() {
  const { slug = '' } = useParams(); const [sp] = useSearchParams();
  const repo = useRepo(); const { session } = useSession(); const toast = useToast();
  const detail = useQuery((r) => r.getProviderDetail(slug), [slug], { live: false });
  const me = useQuery((r) => (session?.role === 'tutor' ? r.getMe() : Promise.resolve(null)), [session?.role]);
  const myPkgs = useQuery((r) => (session?.role === 'tutor' ? r.listMyPackages() : Promise.resolve([])), [session?.role]);

  const [step, setStep] = useState(0);
  const [svcId, setSvcId] = useState(sp.get('svc') ?? '');
  const [pkgId, setPkgId] = useState(sp.get('pkg') ?? '');
  const [usePurchase, setUsePurchase] = useState('');
  const [petIds, setPetIds] = useState<string[]>([]);
  const [day, setDay] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return d.toISOString(); });
  const [slot, setSlot] = useState('');
  const [addingPet, setAddingPet] = useState(false);
  const [contact, setContact] = useState({ name: '', phone: '', email: '', waOptIn: true, marketingOptIn: false });
  const [location, setLocation] = useState<B['location']>('local_prestador');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [done, setDone] = useState<Booking | null>(null);

  const d = detail.data;
  const svc = d?.services.find((s) => s.id === svcId);
  const pkg = d?.packages.find((k) => k.id === pkgId);
  const purchases = (myPkgs.data ?? []).filter((x) => x.providerId === d?.provider.id && x.status === 'ativo' && x.pkg.serviceId === svcId);

  useEffect(() => { if (d && !svcId && d.services[0]) setSvcId(d.services[0].id); }, [d, svcId]);
  useEffect(() => { if (me.data) setContact((c) => ({ ...c, name: c.name || me.data!.customer.name, phone: c.phone || formatPhone(me.data!.customer.phone), email: c.email || me.data!.customer.email, waOptIn: me.data!.customer.waOptIn, marketingOptIn: me.data!.customer.marketingOptIn })); }, [me.data]);
  useEffect(() => { if (svc) setLocation(svc.category === 'passeio' || svc.category === 'pet_sitter' || svc.category === 'vet_domicilio' ? 'casa_tutor' : 'local_prestador'); }, [svc]);
  useEffect(() => { if (purchases[0] && !pkgId) setUsePurchase(purchases[0].id); }, [purchases.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const slots = useQuery((r) => (d && svc ? r.availableSlots(d.provider.id, svc.id, day) : Promise.resolve([])), [d?.provider.id, svc?.id, day]);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => { const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + i); return x; }), []);

  if (detail.loading) return <Spinner />;
  if (!d) return <NotFound />;
  const p = d.provider;
  const compatPets = (me.data?.pets ?? []).map((pet) => ({ pet, ok: !!svc && svc.species.includes(pet.species) && svc.sizes.includes(pet.size) }));
  const price = pkg ? pkg.priceCents : svc ? bookingPriceCents(svc, petIds.length || 1, 1, !!usePurchase) : 0;

  const canNext = [!!svc, petIds.length > 0, !!slot, contact.name.trim().length > 1 && contact.phone.replace(/\D/g, '').length >= 10][step];

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const b = await repo.createBooking({ providerId: p.id, serviceId: svc!.id, packageId: pkg?.id, packagePurchaseId: !pkg && usePurchase ? usePurchase : undefined, petIds, start: slot, notes, location, contact });
      setDone(b); toast('Pedido enviado ao prestador');
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  if (done) return <Done b={done} providerName={p.name} serviceName={svc?.name ?? ''} pets={compatPets.filter((x) => petIds.includes(x.pet.id)).map((x) => x.pet.name).join(' e ')} wa={contact.waOptIn} />;

  return (
    <div className="gutter mx-auto max-w-6xl py-6">
      <Link to={`/p/${p.slug}`} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft size={16} />{p.name}</Link>
      <h1 className="mt-2 text-3xl font-extrabold">Agendar</h1>
      <ol className="mt-4 flex gap-1.5" aria-label="Etapas">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <button disabled={i > step} onClick={() => setStep(i)} className="w-full text-left">
              <div className={cx('h-1.5 rounded-full', i <= step ? 'bg-brand' : 'bg-surface-3')} />
              <div className={cx('mt-1.5 text-xs font-semibold', i === step ? 'text-ink' : 'text-muted')}>{i + 1}. {s}</div>
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {step === 0 && (
            <div className="space-y-5">
              <fieldset><legend className="mb-2 font-bold">Qual serviço?</legend>
                <div className="grid gap-2">
                  {d.services.map((s) => (
                    <label key={s.id} className={cx('card flex cursor-pointer items-center gap-3 p-4', svcId === s.id && 'border-brand ring-1 ring-brand')}>
                      <input type="radio" name="svc" className="accent-[var(--brand)]" checked={svcId === s.id} onChange={() => { setSvcId(s.id); setPkgId(''); setSlot(''); setPetIds([]); }} />
                      <span className="min-w-0 flex-1"><b>{s.name}</b><span className="block truncate text-sm text-muted">{s.description}</span></span>
                      <span className="text-right"><b className="tabular">{formatBRL(s.priceCents)}</b><span className="block text-xs text-muted">/{UNIT_LABEL[s.unit]}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {svc && (purchases.length > 0 || d.packages.some((k) => k.serviceId === svc.id)) && (
                <fieldset><legend className="mb-2 font-bold">Pagar com pacote?</legend>
                  <div className="grid gap-2">
                    <label className={cx('card flex cursor-pointer items-center gap-3 p-3', !pkgId && !usePurchase && 'border-brand')}><input type="radio" name="pk" checked={!pkgId && !usePurchase} onChange={() => { setPkgId(''); setUsePurchase(''); }} className="accent-[var(--brand)]" />Avulso ({formatBRL(svc.priceCents)})</label>
                    {purchases.map((x) => <label key={x.id} className={cx('card flex cursor-pointer items-center gap-3 p-3', usePurchase === x.id && 'border-brand ring-1 ring-brand')}><input type="radio" name="pk" checked={usePurchase === x.id} onChange={() => { setUsePurchase(x.id); setPkgId(''); }} className="accent-[var(--brand)]" /><Package size={17} className="text-brand" /><span className="flex-1">Usar meu pacote <b>{x.pkg.name}</b></span><span className="chip bg-ball text-ball-ink">{x.sessionsTotal - x.sessionsUsed} restantes</span></label>)}
                    {d.packages.filter((k) => k.serviceId === svc.id).map((k) => <label key={k.id} className={cx('card flex cursor-pointer items-center gap-3 p-3', pkgId === k.id && 'border-brand ring-1 ring-brand')}><input type="radio" name="pk" checked={pkgId === k.id} onChange={() => { setPkgId(k.id); setUsePurchase(''); }} className="accent-[var(--brand)]" /><span className="flex-1">Comprar <b>{k.name}</b> e usar a 1ª sessão agora</span><b className="tabular">{formatBRL(k.priceCents)}</b></label>)}
                  </div>
                </fieldset>
              )}
            </div>
          )}

          {step === 1 && (session?.role !== 'tutor' ? (
            <div className="card p-6 text-center">
              <ShieldCheck className="mx-auto text-brand" size={32} />
              <h2 className="mt-2 text-xl font-bold">Entre para escolher o pet</h2>
              <p className="mt-1 text-sm text-muted">A ficha do pet (porte, temperamento, cuidados) vai junto com o pedido e só é vista pelo prestador que você escolher.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button className="btn btn-primary" onClick={async () => { await repo.signInDemo('tutor'); }}>Continuar como Ana (demo)</button>
                <Link className="btn btn-outline" to={`/entrar?next=${encodeURIComponent(`/agendar/${slug}?svc=${svcId}`)}&papel=tutor`}>Entrar com e-mail</Link>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <h2 className="font-bold">Para qual pet?</h2>
              {me.loading ? <Spinner /> : compatPets.map(({ pet, ok }) => (
                <label key={pet.id} className={cx('card flex items-center gap-3 p-4', ok ? 'cursor-pointer' : 'opacity-60', petIds.includes(pet.id) && 'border-brand ring-1 ring-brand')}>
                  <input type="checkbox" disabled={!ok} checked={petIds.includes(pet.id)} onChange={(e) => setPetIds(e.target.checked ? [...petIds, pet.id] : petIds.filter((x) => x !== pet.id))} className="h-4 w-4 accent-[var(--brand)]" />
                  <PetAvatar species={pet.species} seed={pet.avatarSeed} />
                  <span className="min-w-0 flex-1"><b>{pet.name}</b><span className="block text-sm text-muted">{pet.breed} · {SIZE_SHORT[pet.size]} · {pet.weightKg} kg</span>{!ok && <span className="block text-xs font-semibold text-danger">Este serviço não atende {pet.species === 'gato' ? 'gatos' : `porte ${SIZE_SHORT[pet.size].toLowerCase()}`}.</span>}</span>
                </label>
              ))}
              {addingPet ? <div className="card p-4"><PetForm onDone={() => { setAddingPet(false); me.reload(); }} onCancel={() => setAddingPet(false)} /></div>
                : <button className="btn btn-outline w-full" onClick={() => setAddingPet(true)}><Plus size={16} />Cadastrar outro pet</button>}
            </div>
          ))}

          {step === 2 && svc && (
            <div className="space-y-4">
              <h2 className="font-bold">Escolha o dia</h2>
              <div className="scroll-x -mx-1 flex gap-2 px-1 pb-1">
                {days.map((x) => {
                  const closed = !p.openingHours.some((h) => h.day === x.getDay());
                  return (
                    <button key={x.toISOString()} disabled={closed} onClick={() => { setDay(x.toISOString()); setSlot(''); }}
                      className={cx('flex w-16 shrink-0 flex-col items-center rounded-2xl border py-2', day === x.toISOString() ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-surface', closed && 'opacity-40')}>
                      <span className="text-[0.7rem] font-semibold uppercase">{x.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</span>
                      <span className="font-display text-xl font-bold">{x.getDate()}</span>
                      <span className="text-[0.65rem]">{closed ? 'fechado' : x.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span>
                    </button>
                  );
                })}
              </div>
              <h2 className="font-bold">{svc.unit === 'diaria' ? 'Horário de entrada' : 'Horário'} · <span className="font-normal text-muted">{fmtWeekday(day)}</span></h2>
              {slots.loading ? <Spinner /> : !slots.data?.length ? <p className="text-sm text-muted">Sem atendimento neste dia.</p> : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {slots.data.map((s) => (
                    <button key={s.start} disabled={!s.free} onClick={() => setSlot(s.start)}
                      className={cx('rounded-xl border py-2.5 text-sm font-semibold tabular', slot === s.start ? 'border-brand bg-brand text-brand-ink' : s.free ? 'border-line bg-surface hover:border-brand' : 'border-transparent bg-surface-2 text-muted line-through')}>
                      {fmtTime(s.start)}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted">Horários riscados já estão ocupados ou fora da antecedência mínima de 30 min.</p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="label" htmlFor="c-name">Seu nome</label><input id="c-name" className="input" autoComplete="name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></div>
                <div><label className="label" htmlFor="c-phone">WhatsApp (com DDD)</label><input id="c-phone" className="input" inputMode="tel" autoComplete="tel" placeholder="(54) 99123-4567" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></div>
                <div className="sm:col-span-2"><label className="label" htmlFor="c-email">E-mail</label><input id="c-email" className="input" type="email" autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></div>
              </div>
              <fieldset><legend className="label">Onde?</legend>
                <div className="flex flex-wrap gap-2">
                  {([['local_prestador', 'No local do prestador'], ['casa_tutor', 'Na minha casa'], ['busca_e_entrega', 'Buscar e entregar (táxi dog)']] as const).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setLocation(k)} className={cx('chip px-3 py-2 text-sm', location === k ? 'bg-brand text-brand-ink' : 'hover:bg-surface-3')}>{l}</button>
                  ))}
                </div>
              </fieldset>
              <div><label className="label" htmlFor="c-notes">Algo que o prestador precisa saber?</label><textarea id="c-notes" className="input min-h-24" maxLength={600} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: toma remédio às 20h; tem medo de trovão; portão da garagem." /><div className="mt-1 text-right text-xs text-muted">{notes.length}/600</div></div>
              <div className="space-y-2 rounded-2xl bg-surface-2 p-4 text-sm">
                <label className="flex gap-2.5"><input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]" checked={contact.waOptIn} onChange={(e) => setContact({ ...contact, waOptIn: e.target.checked })} /><span><b>Receber confirmação e lembretes deste agendamento no WhatsApp.</b> Usamos seu número só para mensagens do atendimento (você responde “Confirmar” por lá).</span></label>
                <label className="flex gap-2.5"><input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]" checked={contact.marketingOptIn} onChange={(e) => setContact({ ...contact, marketingOptIn: e.target.checked })} /><span>Aceito receber ofertas e vagas liberadas deste prestador (opcional, cancele quando quiser).</span></label>
                <p className="text-xs text-muted">Ao enviar, você concorda com os <Link to="/termos" className="underline">Termos</Link> e a <Link to="/privacidade" className="underline">Política de Privacidade</Link>. O prestador vê seu nome, WhatsApp e a ficha do pet escolhido.</p>
              </div>
              {err ? <ErrorBox error={errorMessage(err)} /> : null}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-2">
            <button className="btn btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={16} />Voltar</button>
            {step < 3
              ? <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Continuar<ArrowRight size={16} /></button>
              : <button className="btn btn-ball" disabled={!canNext || busy} onClick={submit}>{busy ? 'Enviando…' : 'Enviar pedido'}</button>}
          </div>
        </div>

        <aside>
          <div className="card sticky top-24 space-y-3 p-5">
            <div className="flex items-center gap-3"><Avatar name={p.name} seed={p.avatarSeed} size={44} /><div className="min-w-0"><b className="block truncate">{p.name}</b><span className="text-xs text-muted">{p.neighborhood}</span></div></div>
            <dl className="space-y-2 border-t border-line pt-3 text-sm">
              <Row k="Serviço" v={svc?.name ?? '—'} />
              {pkg && <Row k="Pacote" v={pkg.name} />}
              {usePurchase && !pkg && <Row k="Pagamento" v="Saldo do pacote" />}
              <Row k="Pet" v={compatPets.filter((x) => petIds.includes(x.pet.id)).map((x) => x.pet.name).join(', ') || '—'} />
              <Row k="Quando" v={slot ? `${new Date(slot).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })} às ${fmtTime(slot)}` : '—'} />
            </dl>
            <div className="flex items-baseline justify-between border-t border-line pt-3"><span className="font-semibold">Total</span><span className="font-display text-2xl font-extrabold tabular">{formatBRL(price)}</span></div>
            <p className="text-xs text-muted">Nada é cobrado agora. O pagamento é combinado com o prestador após a confirmação{usePurchase ? ' (esta sessão sai do seu pacote)' : ''}.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
const Row = ({ k, v }: { k: string; v: string }) => <div className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>;

function Done({ b, providerName, serviceName, pets, wa }: { b: Booking; providerName: string; serviceName: string; pets: string; wa: boolean }) {
  const nav = useNavigate();
  return (
    <div className="gutter mx-auto max-w-2xl py-10">
      <div className="rise card overflow-hidden">
        <div className="bg-brand p-6 text-brand-ink">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-ball text-ball-ink"><Check size={26} /></div>
          <h1 className="mt-3 text-2xl font-extrabold">Pedido enviado!</h1>
          <p className="opacity-90">Protocolo <b className="tabular">{b.code}</b> · {serviceName} para {pets}</p>
        </div>
        <div className="space-y-5 p-6">
          <ol className="space-y-3">
            <Stage done icon={<Check size={15} />} t="Pedido recebido" d={`${providerName} já foi avisado no painel.`} />
            <Stage active icon={<Hourglass size={15} />} t="Aguardando o prestador aceitar" d="Tempo médio de resposta: poucos minutos no horário comercial." />
            <Stage icon={<MessageCircle size={15} />} t="Você confirma no WhatsApp" d={wa ? 'Chega uma mensagem com o botão “Confirmar”. Também dá para confirmar aqui no app.' : 'Você ativou só o app: confirme em Meus agendamentos.'} />
            <Stage icon={<CalendarDays size={15} />} t="Lembrete na véspera" d="E depois do atendimento, você avalia." />
          </ol>
          {wa && (
            <div className="rounded-2xl bg-wa-bg p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted"><MessageCircle size={13} className="text-wa" />Mensagem enviada ao seu WhatsApp</div>
              <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-surface p-3 text-sm">Olá! Recebemos seu pedido de {serviceName} para {pets}. {providerName} vai responder em breve. Protocolo {b.code}.<div className="mt-1 flex justify-end gap-1 text-[0.7rem] text-muted">{fmtTime(b.createdAt)} <CheckCheck size={13} className="text-[#34b7f1]" /></div></div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => nav(`/conta/agendamento/${b.id}`)}>Acompanhar pedido</button>
            <button className="btn btn-outline" onClick={() => nav('/buscar')}>Continuar buscando</button>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted"><Clock size={13} />Na demonstração, troque para “Prestador” na faixa do topo para aceitar este pedido e ver a confirmação chegar.</p>
        </div>
      </div>
    </div>
  );
}
function Stage({ icon, t, d, done, active }: { icon: React.ReactNode; t: string; d: string; done?: boolean; active?: boolean }) {
  return (
    <li className="flex gap-3">
      <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-full', done ? 'bg-brand text-brand-ink' : active ? 'pulse-dot bg-ball text-ball-ink' : 'bg-surface-2 text-muted')}>{icon}</span>
      <span><b className={cx(!done && !active && 'text-muted')}>{t}</b><span className="block text-sm text-muted">{d}</span></span>
    </li>
  );
}
