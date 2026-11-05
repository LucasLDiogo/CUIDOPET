import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, BadgeCheck, CalendarCheck, CheckCheck, MessageCircle, Package, Search, ShieldCheck, Star } from 'lucide-react';
import { useQuery, useSession, useRepo } from '../../lib/repo';
import { CATEGORIES, CITIES } from '../../data/demo/catalog';
import { CategoryIcon } from '../../components/CategoryIcon';
import { ProviderCard } from '../../components/ProviderCard';
import { Avatar, Segmented, Spinner, Stars } from '../../components/ui';
import type { CategoryId, Species } from '../../domain/types';
import { cx, relTime } from '../../lib/format';

export function Home() {
  const nav = useNavigate();
  const [cat, setCat] = useState<CategoryId | 'todos'>('todos');
  const [city, setCity] = useState('passo-fundo-rs');
  const [species, setSpecies] = useState<Species>('cao');
  const [featCity, setFeatCity] = useState('passo-fundo-rs');
  const stats = useQuery((r) => r.stats(), []);
  const featured = useQuery((r) => r.listFeatured(featCity), [featCity]);
  const recent = useQuery(async (r) => {
    const list = await r.listFeatured('passo-fundo-rs');
    const details = await Promise.all(list.slice(0, 4).map((p) => r.getProviderDetail(p.slug)));
    return details.flatMap((d) => (d ? d.reviews.filter((x) => x.rating === 5 && x.text.length > 70).slice(0, 2).map((rv) => ({ rv, p: d.provider })) : [])).slice(0, 6);
  }, [], { live: false });

  const go = () => nav(`/buscar?${new URLSearchParams({ ...(cat !== 'todos' && { cat }), cidade: city, especie: species }).toString()}`);

  return (
    <div>
      {/* HERO */}
      <section className="gutter relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-10 py-10 md:py-16 lg:grid-cols-[1.1fr_.9fr]">
          <div className="rise">
            <span className="chip bg-ball text-ball-ink">Passeio · Pet sitter · Pet house · Banho e tosa</span>
            <h1 className="mt-4 text-[2.4rem] font-extrabold leading-[1.02] sm:text-6xl">Quem cuida do seu pet<br />quando você <span className="relative whitespace-nowrap text-brand">não pode?<svg className="absolute -bottom-2 left-0 h-3 w-full" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true"><path d="M2 9 C 50 2, 120 2, 198 7" stroke="var(--ball)" strokeWidth="5" fill="none" strokeLinecap="round" /></svg></span></h1>
            <p className="mt-5 max-w-xl text-lg text-muted">Compare passeadores, cuidadores, pet houses e pet shops do seu bairro pelas avaliações de quem contratou. Escolha o horário e confirme pelo WhatsApp.</p>

            <form className="card mt-7 grid gap-3 p-3 shadow-card sm:grid-cols-[1.2fr_1fr_auto_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); go(); }}>
              <div>
                <label className="label px-1" htmlFor="h-cat">Serviço</label>
                <select id="h-cat" className="input" value={cat} onChange={(e) => setCat(e.target.value as CategoryId)}>
                  <option value="todos">Todos os serviços</option>
                  {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label px-1" htmlFor="h-city">Cidade</label>
                <select id="h-city" className="input" value={city} onChange={(e) => setCity(e.target.value)}>
                  {CITIES.map((c) => <option key={c.id} value={c.id}>{c.name} / {c.uf}</option>)}
                </select>
              </div>
              <div>
                <span className="label px-1">Pet</span>
                <Segmented value={species} onChange={setSpecies} options={[{ value: 'cao', label: 'Cão' }, { value: 'gato', label: 'Gato' }]} />
              </div>
              <button className="btn btn-primary h-[42px]" type="submit"><Search size={17} />Buscar</button>
            </form>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck size={16} className="text-brand" />Identidade verificada</span>
              <span className="inline-flex items-center gap-1.5"><Star size={16} className="text-brand" />Avaliação só de quem contratou</span>
              <span className="inline-flex items-center gap-1.5"><MessageCircle size={16} className="text-brand" />Confirmação no WhatsApp</span>
            </div>
          </div>

          {/* composição: card do prestador + confirmação no WhatsApp */}
          <div className="relative mx-auto hidden w-full max-w-md lg:block" aria-hidden="true">
            <div className="absolute -right-10 -top-10 h-72 w-72 rounded-full bg-ball/50 blur-3xl" />
            {featured.data?.[0] && <div className="relative rotate-[-2deg]"><ProviderCard p={featured.data[0]} compact /></div>}
            <div className="relative -mt-10 ml-auto w-[88%] rotate-[2deg] rounded-3xl bg-wa-bg p-3 shadow-card">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted"><MessageCircle size={14} className="text-wa" />WhatsApp · agora</div>
              <div className="max-w-[92%] rounded-2xl rounded-tl-sm bg-surface p-3 text-sm shadow-sm">
                Oi, Ana! <b>Casa da Carla Pet House</b> aceitou o agendamento de <b>Passeio 60 min</b> para <b>Thor</b> amanhã às 08:00. Toque em <b>Confirmar</b> para garantir sua vaga. 🐾
                <div className="mt-2 grid grid-cols-3 gap-1 border-t border-line pt-2 text-center text-[0.8rem] font-semibold text-info"><span>Confirmar</span><span>Remarcar</span><span>Cancelar</span></div>
              </div>
              <div className="ml-auto mt-2 w-fit rounded-2xl rounded-tr-sm bg-wa-bubble px-3 py-2 text-sm">Confirmar <CheckCheck size={14} className="ml-1 inline text-[#34b7f1]" /></div>
              <div className="mx-auto mt-2 w-fit rounded-lg bg-surface/80 px-2 py-1 text-[0.72rem] font-semibold text-ok">Agendamento CP-30142 confirmado ✓</div>
            </div>
          </div>
        </div>
      </section>

      {/* CATEGORIAS */}
      <section className="gutter">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CATEGORIES.map((c) => (
              <Link key={c.id} to={`/buscar?cat=${c.id}`} className="card group flex items-start gap-3 p-4 transition hover:border-brand">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-brand transition group-hover:bg-brand group-hover:text-brand-ink"><CategoryIcon id={c.id} size={22} /></span>
                <span className="min-w-0"><span className="block font-bold">{c.label}</span><span className="line-clamp-2 text-xs text-muted">{c.description}</span></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA (sequência real) */}
      <section className="gutter mt-16">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-extrabold sm:text-4xl">Do primeiro clique ao pet bem cuidado</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              { icon: Search, t: 'Compare com calma', d: 'Filtre por bairro, porte e espécie. Veja preço, pacotes, tempo de resposta e avaliações de quem já contratou.' },
              { icon: CalendarCheck, t: 'Peça o horário', d: 'Escolha serviço, pet e horário livre. O prestador recebe o pedido com a ficha do pet e responde no painel.' },
              { icon: MessageCircle, t: 'Confirme no WhatsApp', d: 'Quando o prestador aceita, chega uma mensagem com o botão Confirmar. Um toque e a vaga é sua; lembrete no dia anterior.' },
            ].map((s, i) => (
              <li key={s.t} className="card relative p-5">
                <span className="absolute right-5 top-4 font-display text-5xl font-extrabold text-surface-3">{i + 1}</span>
                <s.icon className="text-brand" size={26} />
                <h3 className="mt-3 text-lg font-bold">{s.t}</h3>
                <p className="mt-1 text-sm text-muted">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* DESTAQUES */}
      <section className="gutter mt-16">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="eyebrow">Bem avaliados</div>
              <h2 className="text-3xl font-extrabold">Perto de você</h2>
            </div>
            <div className="scroll-x flex max-w-full gap-1.5">
              {CITIES.map((c) => <button key={c.id} onClick={() => setFeatCity(c.id)} className={cx('chip px-3 py-1.5', featCity === c.id ? 'bg-ink text-bg' : 'hover:bg-surface-3')}>{c.name}</button>)}
            </div>
          </div>
          {featured.loading ? <Spinner /> : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{featured.data?.slice(0, 8).map((p) => <ProviderCard key={p.id} p={p} />)}</div>
          )}
          <div className="mt-6 text-center"><Link to={`/buscar?cidade=${featCity}`} className="btn btn-outline">Ver todos em {CITIES.find((c) => c.id === featCity)?.name}<ArrowRight size={16} /></Link></div>
        </div>
      </section>

      {/* AVALIAÇÕES */}
      <section className="gutter mt-16">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
            <div>
              <div className="eyebrow">Avaliações verificadas</div>
              <h2 className="mt-1 text-3xl font-extrabold">Só avalia quem contratou pelo Cuidopê</h2>
              <p className="mt-3 text-muted">Cada avaliação está ligada a um atendimento concluído. Prestador não paga para subir a nota, e as respostas dele ficam públicas ao lado.</p>
              {stats.data && (
                <dl className="mt-6 grid grid-cols-3 gap-3">
                  <Stat k="prestadores" v={stats.data.providers.toLocaleString('pt-BR')} />
                  <Stat k="avaliações" v={stats.data.reviews.toLocaleString('pt-BR')} />
                  <Stat k="nota média" v={stats.data.avgRating.toFixed(1).replace('.', ',')} />
                </dl>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {recent.data?.map(({ rv, p }) => (
                <figure key={rv.id} className="card flex flex-col gap-2 p-4">
                  <Stars value={rv.rating} />
                  <blockquote className="line-clamp-4 text-sm">“{rv.text}”</blockquote>
                  <figcaption className="mt-auto flex items-center gap-2 pt-2 text-xs text-muted">
                    <Avatar name={rv.authorName} seed={rv.authorName.length * 5} size={28} />
                    <span><b className="text-ink">{rv.authorName}</b> · tutor(a) de {rv.petName} · {relTime(rv.createdAt)}<br />sobre <Link className="relative z-[2] font-semibold text-brand" to={`/p/${p.slug}`}>{p.name}</Link></span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>
      </section>

      <ProviderCTA />
    </div>
  );
}

const Stat = ({ k, v }: { k: string; v: string }) => (
  <div className="rounded-2xl bg-surface-2 p-3"><dt className="text-xs text-muted">{k}</dt><dd className="font-display text-2xl font-extrabold tabular">{v}</dd></div>
);

function ProviderCTA() {
  const { session } = useSession(); const repo = useRepo(); const nav = useNavigate();
  return (
    <section className="gutter mt-16">
      <div className="mx-auto grid max-w-7xl items-center gap-8 overflow-hidden rounded-[28px] bg-brand p-6 text-brand-ink sm:p-10 lg:grid-cols-2">
        <div>
          <div className="eyebrow text-brand-ink/70">Para quem cuida de pets</div>
          <h2 className="mt-1 text-3xl font-extrabold sm:text-4xl">Agenda, WhatsApp e pacotes num só painel</h2>
          <ul className="mt-5 space-y-2.5 text-[0.95rem]">
            {['Pedidos chegam com a ficha do pet e você aceita em um toque', 'Confirmação, lembrete e pedido de avaliação saem sozinhos no WhatsApp', 'Caixa de conversas com status: aguardando atendimento, aguardando cliente, agendado', 'Pacotes de passeio, creche e banho com saldo controlado por cliente', 'Alerta de clientes sumidos e de horários livres para oferecer'].map((t) => (
              <li key={t} className="flex gap-2"><BadgeCheck size={19} className="mt-0.5 shrink-0 text-ball" />{t}</li>
            ))}
          </ul>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/anunciar" className="btn btn-ball">Anunciar meus serviços</Link>
            <button className="btn border border-brand-ink/30 text-brand-ink hover:bg-white/10" onClick={async () => { if (session?.role !== 'prestador') await repo.signInDemo('prestador'); nav('/painel'); }}>Ver painel de exemplo<ArrowRight size={16} /></button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-ink" aria-hidden="true">
          {[{ t: 'Aguardando atendimento', v: '3', s: 'responda em até 15 min', c: 'text-coral' }, { t: 'Agendamentos hoje', v: '6', s: '2 em atendimento', c: 'text-brand' }, { t: 'Receita do mês', v: 'R$ 8,4 mil', s: '+12% vs mês anterior', c: 'text-ok' }, { t: 'Pacotes ativos', v: '11', s: '10 passeios é o mais vendido', c: 'text-info' }].map((k) => (
            <div key={k.t} className="rounded-2xl bg-surface p-4">
              <div className="text-xs text-muted">{k.t}</div>
              <div className={cx('font-display text-2xl font-extrabold', k.c)}>{k.v}</div>
              <div className="mt-1 flex items-center gap-1 text-xs text-muted">{k.t.startsWith('Pacotes') && <Package size={12} />}{k.s}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
