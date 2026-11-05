import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { BadgeCheck, CalendarCheck, Check, Clock3, Copy, Heart, Home as HomeIcon, MapPin, MessageCircle, Package, PawPrint, ShieldCheck, Star, Timer } from 'lucide-react';
import { useQuery, useRepo, useSession } from '../../lib/repo';
import { catLabel, POLICY_LABEL, SIZE_SHORT, UNIT_LABEL } from '../../data/demo/catalog';
import { Avatar, Cover, Empty, RatingBadge, Spinner, Stars, useToast } from '../../components/ui';
import { NotFound } from '../../components/layout';
import { cx, formatBRL, formatPhone, relTime } from '../../lib/format';
import type { Review } from '../../domain/types';

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function ProviderPage() {
  const { slug = '' } = useParams();
  const { data, loading } = useQuery((r) => r.getProviderDetail(slug), [slug]);
  const { session } = useSession(); const repo = useRepo(); const toast = useToast(); const nav = useNavigate();
  const favs = useQuery((r) => (session?.role === 'tutor' ? r.listFavorites() : Promise.resolve([] as string[])), [session?.role]);
  const [tab, setTab] = useState<'servicos' | 'pacotes' | 'avaliacoes' | 'sobre'>('servicos');
  if (loading) return <Spinner />;
  if (!data) return <NotFound />;
  const { provider: p, services, packages, reviews, cityName } = data;
  const fav = favs.data?.includes(p.id);
  const toggleFav = async () => {
    if (session?.role !== 'tutor') { toast('Entre como tutor para salvar favoritos', 'info'); nav('/entrar?papel=tutor'); return; }
    await repo.toggleFavorite(p.id); favs.reload(); toast(fav ? 'Removido dos favoritos' : 'Salvo nos favoritos');
  };
  const waText = encodeURIComponent(`Olá! Vi seu perfil no Cuidopê e gostaria de saber mais sobre seus serviços.`);

  return (
    <div className="pb-28 lg:pb-0">
      <Cover seed={p.coverSeed} className="h-44 sm:h-60" />
      <div className="gutter mx-auto max-w-7xl">
        <div className="-mt-14 flex flex-wrap items-end gap-4">
          <Avatar name={p.name} seed={p.avatarSeed} size={112} className="ring-[6px] ring-bg" />
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap gap-1.5">{p.categories.map((c) => <span key={c} className="chip bg-surface">{catLabel(c)}</span>)}{p.isDemo && <span className="chip bg-ball/50">Perfil fictício (demo)</span>}</div>
            <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">{p.name}</h1>
            <p className="text-muted">{p.tagline}</p>
          </div>
          <button onClick={toggleFav} className="btn btn-outline" aria-pressed={fav}><Heart size={17} className="text-coral" fill={fav ? 'currentColor' : 'none'} />{fav ? 'Salvo' : 'Salvar'}</button>
        </div>

        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <RatingBadge rating={p.rating} count={p.reviewCount} />
          <span className="inline-flex items-center gap-1.5 text-muted"><MapPin size={15} />{p.neighborhood}, {cityName}</span>
          <span className="inline-flex items-center gap-1.5 text-muted"><Clock3 size={15} />Responde em ~{p.responseTimeMin} min · {Math.round(p.responseRate * 100)}% das mensagens</span>
          <span className="inline-flex items-center gap-1.5 text-muted"><PawPrint size={15} />{p.petsServed.toLocaleString('pt-BR')} pets atendidos · {p.yearsExperience} anos</span>
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="min-w-0">
            <div className="scroll-x sticky z-20 -mx-1 flex gap-1 border-b border-line bg-bg px-1" style={{ top: 'calc(64px + env(safe-area-inset-top, 0px))' }} role="tablist">
              {([['servicos', `Serviços (${services.length})`], ['pacotes', `Pacotes (${packages.length})`], ['avaliacoes', `Avaliações (${reviews.length})`], ['sobre', 'Sobre']] as const).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx('shrink-0 border-b-2 px-3 py-3 text-sm font-semibold', tab === k ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink')}>{l}</button>
              ))}
            </div>

            {tab === 'servicos' && (
              <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {services.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold">{s.name}</div>
                      <p className="text-sm text-muted">{s.description}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                        <span className="chip"><Timer size={12} />{s.durationMin >= 600 ? (s.unit === 'diaria' ? '24 h' : `${Math.round(s.durationMin / 60)} h`) : `${s.durationMin} min`}</span>
                        <span className="chip">{s.species.map((x) => (x === 'cao' ? 'Cães' : 'Gatos')).join(' e ')}</span>
                        {s.sizes.length < 5 && <span className="chip">Porte: {s.sizes.map((z) => SIZE_SHORT[z]).join(', ')}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-xl font-bold tabular">{formatBRL(s.priceCents)}</div>
                      <div className="text-xs text-muted">por {UNIT_LABEL[s.unit]}</div>
                    </div>
                    <Link to={`/agendar/${p.slug}?svc=${s.id}`} className="btn btn-primary btn-sm">Agendar</Link>
                  </li>
                ))}
              </ul>
            )}

            {tab === 'pacotes' && (packages.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {packages.map((k) => {
                  const save = Math.round((1 - k.priceCents / k.fullPriceCents) * 100);
                  return (
                    <div key={k.id} className={cx('card relative flex flex-col p-5', k.popular && 'border-brand ring-1 ring-brand')}>
                      {k.popular && <span className="chip absolute -top-2.5 left-4 bg-brand text-brand-ink">Mais vendido</span>}
                      <div className="flex items-start justify-between gap-2"><Package className="text-brand" /><span className="chip bg-ball text-ball-ink">−{save}%</span></div>
                      <div className="mt-3 text-lg font-bold">{k.name}</div>
                      <p className="text-sm text-muted">{k.description}</p>
                      <div className="mt-3 flex items-baseline gap-2"><span className="font-display text-2xl font-extrabold tabular">{formatBRL(k.priceCents)}</span><s className="text-sm text-muted">{formatBRL(k.fullPriceCents)}</s></div>
                      <div className="text-xs text-muted">{k.sessions} sessões · {formatBRL(Math.round(k.priceCents / k.sessions))} cada · validade {k.validityDays} dias</div>
                      <Link to={`/agendar/${p.slug}?svc=${k.serviceId}&pkg=${k.id}`} className="btn btn-outline btn-sm mt-4">Comprar e agendar a 1ª</Link>
                    </div>
                  );
                })}
              </div>
            ) : <div className="mt-4"><Empty icon={<Package />} title="Sem pacotes por enquanto">Este prestador vende apenas avulso.</Empty></div>)}

            {tab === 'avaliacoes' && <ReviewsBlock reviews={reviews} breakdown={p.ratingBreakdown} rating={p.rating} providerName={p.name} />}

            {tab === 'sobre' && (
              <div className="mt-4 grid gap-4">
                <section className="card p-5"><h2 className="text-lg font-bold">Apresentação</h2><p className="mt-2 whitespace-pre-line text-[0.95rem] leading-relaxed">{p.bio || 'O prestador ainda não escreveu a apresentação.'}</p></section>
                <section className="card p-5">
                  <h2 className="text-lg font-bold">Estrutura e diferenciais</h2>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">{p.amenities.map((a) => <li key={a} className="flex items-center gap-2 text-sm"><Check size={16} className="text-brand" />{a}</li>)}</ul>
                </section>
                <div className="grid gap-4 sm:grid-cols-2">
                  <section className="card p-5">
                    <h2 className="text-lg font-bold">Horário de atendimento</h2>
                    <table className="mt-2 w-full text-sm"><tbody>{[0, 1, 2, 3, 4, 5, 6].map((d) => { const h = p.openingHours.find((x) => x.day === d); return <tr key={d} className="border-b border-line last:border-0"><td className="py-1.5 font-medium">{DAYS[d]}</td><td className="py-1.5 text-right tabular text-muted">{h ? `${h.open} – ${h.close}` : 'Fechado'}</td></tr>; })}</tbody></table>
                  </section>
                  <section className="card p-5">
                    <h2 className="text-lg font-bold">Atende</h2>
                    <p className="mt-2 text-sm">{p.species.map((x) => (x === 'cao' ? 'Cães' : 'Gatos')).join(' e ')} · porte {p.sizes.map((z) => SIZE_SHORT[z].toLowerCase()).join(', ')}</p>
                    <h3 className="mt-4 font-bold">Política de cancelamento</h3>
                    <p className="mt-1 text-sm text-muted">{POLICY_LABEL[p.cancellationPolicy]}</p>
                  </section>
                </div>
                <section className="card p-5">
                  <h2 className="text-lg font-bold">Verificações</h2>
                  <ul className="mt-3 space-y-2 text-sm">
                    <Ver ok={p.verification.identity} t="Identidade conferida" d="Documento oficial conferido por verificador." />
                    <Ver ok={p.verification.background} t="Antecedentes" d="Consulta de antecedentes criminais." />
                    <Ver ok={p.verification.venue} t="Local vistoriado" d="Espaço visitado pela equipe (pet house, creche ou loja)." />
                  </ul>
                </section>
              </div>
            )}
          </div>

          {/* barra de agendamento */}
          <aside className="hidden lg:block">
            <div className="card sticky top-24 space-y-4 p-5 shadow-card">
              <div><div className="text-sm text-muted">a partir de</div><div className="font-display text-3xl font-extrabold tabular">{formatBRL(p.priceFromCents)}</div></div>
              <Link to={`/agendar/${p.slug}`} className="btn btn-primary w-full"><CalendarCheck size={18} />Ver horários e agendar</Link>
              {p.whatsappOptIn && p.whatsappPublic && <WaBox phone={p.whatsappPublic} text={waText} />}
              <ul className="space-y-2 border-t border-line pt-4 text-sm text-muted">
                <li className="flex gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand" />Pedido sem compromisso: só vale depois que você confirma.</li>
                <li className="flex gap-2"><MessageCircle size={16} className="mt-0.5 shrink-0 text-brand" />Confirmação e lembrete pelo WhatsApp.</li>
                <li className="flex gap-2"><Star size={16} className="mt-0.5 shrink-0 text-brand" />Depois do atendimento, você avalia.</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
      <div className="fixed inset-x-0 z-30 border-t border-line bg-surface lg:hidden" style={{ bottom: 'calc(58px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="gutter flex items-center gap-3 py-3">
          <div><div className="text-xs text-muted">a partir de</div><div className="font-display text-lg font-bold tabular">{formatBRL(p.priceFromCents)}</div></div>
          {p.whatsappOptIn && p.whatsappPublic && <a className="btn btn-wa ml-auto" href={`https://wa.me/${p.whatsappPublic.replace(/\D/g, '')}?text=${waText}`} target="_blank" rel="noopener noreferrer" aria-label="Conversar no WhatsApp"><MessageCircle size={18} /></a>}
          <Link to={`/agendar/${p.slug}`} className={cx('btn btn-primary', !(p.whatsappOptIn && p.whatsappPublic) && 'ml-auto')}>Agendar</Link>
        </div>
      </div>
    </div>
  );
}

function Ver({ ok, t, d }: { ok: boolean; t: string; d: string }) {
  return <li className="flex gap-2.5"><span className={cx('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full', ok ? 'bg-brand text-brand-ink' : 'bg-surface-3 text-muted')}>{ok ? <BadgeCheck size={13} /> : '–'}</span><span><b>{t}</b> {ok ? '' : '(pendente)'}<br /><span className="text-muted">{d}</span></span></li>;
}

function WaBox({ phone, text }: { phone: string; text: string }) {
  const toast = useToast();
  return (
    <div className="rounded-2xl bg-[color-mix(in_oklab,var(--wa)_10%,transparent)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm"><span className="block text-xs text-muted">WhatsApp profissional</span><b className="tabular select-all">{formatPhone(phone)}</b></span>
        <button className="btn btn-ghost btn-sm" aria-label="Copiar número" onClick={() => navigator.clipboard?.writeText(formatPhone(phone)).then(() => toast('Número copiado')).catch(() => toast('Selecione o número para copiar', 'info'))}><Copy size={15} /></button>
      </div>
      <a className="btn btn-wa btn-sm mt-2 w-full" href={`https://wa.me/${phone.replace(/\D/g, '')}?text=${text}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} />Conversar no WhatsApp</a>
      <p className="mt-1.5 text-[0.7rem] text-muted">O prestador autorizou exibir este número.</p>
    </div>
  );
}

export function ReviewsBlock({ reviews, breakdown, rating, providerName }: { reviews: Review[]; breakdown: [number, number, number, number, number]; rating: number | null; providerName: string }) {
  const [filter, setFilter] = useState<'todas' | '5' | '4' | 'baixas' | 'resposta'>('todas');
  const [limit, setLimit] = useState(8);
  const list = useMemo(() => reviews.filter((r) => filter === 'todas' || (filter === '5' && r.rating === 5) || (filter === '4' && r.rating === 4) || (filter === 'baixas' && r.rating <= 3) || (filter === 'resposta' && !!r.reply)), [reviews, filter]);
  if (!reviews.length) return <div className="mt-4"><Empty icon={<Star />} title="Ainda sem avaliações">{providerName} é novo na plataforma. As avaliações aparecem depois dos primeiros atendimentos concluídos — nunca colocamos nota inicial.</Empty></div>;
  const total = reviews.length;
  const avg = (k: keyof Review['aspects']) => reviews.reduce((a, r) => a + r.aspects[k], 0) / total;
  return (
    <div className="mt-4 space-y-4">
      <div className="card grid gap-6 p-5 sm:grid-cols-[auto_1fr_auto]">
        <div className="text-center sm:text-left">
          <div className="font-display text-5xl font-extrabold tabular">{rating?.toFixed(1).replace('.', ',')}</div>
          <Stars value={rating ?? 0} size={16} />
          <div className="mt-1 text-sm text-muted">{total.toLocaleString('pt-BR')} avaliações verificadas</div>
        </div>
        <div className="space-y-1.5">
          {[5, 4, 3, 2, 1].map((s) => {
            const n = breakdown[s - 1]; const pct = total ? (n / total) * 100 : 0;
            return <div key={s} className="flex items-center gap-2 text-sm"><span className="w-3 tabular">{s}</span><Star size={13} className="text-[#f2b01e]" fill="currentColor" strokeWidth={0} /><div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-[#f2b01e]" style={{ width: `${pct}%` }} /></div><span className="w-10 text-right tabular text-muted">{n}</span></div>;
          })}
        </div>
        <dl className="grid grid-cols-3 gap-3 text-center sm:grid-cols-1 sm:text-left">
          {([['pontualidade', 'Pontualidade'], ['cuidado', 'Cuidado'], ['comunicacao', 'Comunicação']] as const).map(([k, l]) => <div key={k}><dt className="text-xs text-muted">{l}</dt><dd className="font-bold tabular">{avg(k).toFixed(1).replace('.', ',')}</dd></div>)}
        </dl>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {([['todas', 'Todas'], ['5', '5 estrelas'], ['4', '4 estrelas'], ['baixas', '3 ou menos'], ['resposta', 'Com resposta']] as const).map(([k, l]) => <button key={k} onClick={() => { setFilter(k); setLimit(8); }} className={cx('chip px-3 py-1.5', filter === k ? 'bg-ink text-bg' : 'hover:bg-surface-3')}>{l}</button>)}
      </div>
      <ul className="space-y-3">
        {list.slice(0, limit).map((r) => (
          <li key={r.id} className="card p-4">
            <div className="flex items-start gap-3">
              <Avatar name={r.authorName} seed={r.authorName.charCodeAt(0) + r.authorName.length} size={38} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2"><b>{r.authorName}</b><span className="text-xs text-muted">tutor(a) de {r.petName} · {r.serviceName} · {relTime(r.createdAt)}</span></div>
                <div className="mt-0.5 flex items-center gap-2"><Stars value={r.rating} />{r.verifiedBooking && <span className="inline-flex items-center gap-1 text-xs font-semibold text-ok"><BadgeCheck size={13} />Contratou pelo Cuidopê</span>}</div>
                <p className="mt-2 text-[0.95rem]">{r.text}</p>
                {r.reply && <div className="mt-3 rounded-xl border-l-4 border-brand bg-surface-2 px-3 py-2 text-sm"><div className="mb-0.5 flex items-center gap-1 text-xs font-semibold"><HomeIcon size={12} />Resposta de {providerName}</div>{r.reply.text}</div>}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {list.length > limit && <button className="btn btn-outline w-full" onClick={() => setLimit(limit + 10)}>Ver mais avaliações ({list.length - limit})</button>}
    </div>
  );
}
