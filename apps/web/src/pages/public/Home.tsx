import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, Award, BadgeCheck, CalendarCheck, CheckCheck, ChevronLeft, ChevronRight, Clock3, Gift, MessageCircle, Package, Search, ShieldCheck, Star, TrendingUp } from 'lucide-react';
import { useQuery, useSession, useRepo } from '../../lib/repo';
import { CATEGORIES, CITIES } from '../../data/demo/catalog';
import { CategoryIcon } from '../../components/CategoryIcon';
import { ProviderCard } from '../../components/ProviderCard';
import { Avatar, Segmented, Stars } from '../../components/ui';
import type { CategoryId, Species } from '../../domain/types';
import { cx, relTime } from '../../lib/format';
import { IMG, categoryImage, personAvatar, providerAvatar } from '../../lib/media';
import { CountUp, Reveal, SplitHeading, gsap, reducedMotion, useGSAP } from '../../lib/motion';
import { BrandIcon } from '../../components/brand';
import { useActivePet } from '../../lib/activePet';

const POPULAR = [
  { l: 'Passeio 60 min', to: '/buscar?cat=passeio' },
  { l: 'Banho e tosa', to: '/buscar?cat=banho_tosa' },
  { l: 'Pet house no fim de semana', to: '/buscar?cat=hospedagem' },
  { l: 'Vacina em casa', to: '/buscar?cat=vet_domicilio' },
  { l: 'Hotel para gatos', to: '/buscar?cat=hospedagem&especie=gato' },
  { l: 'Creche com piscina', to: '/buscar?cat=creche' },
];

export function Home() {
  const nav = useNavigate();
  const { session } = useSession();
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
      <Hero onSearch={go} cat={cat} setCat={setCat} city={city} setCity={setCity} species={species} setSpecies={setSpecies} />

      {/* faixa "mais procurados" em movimento */}
      <div className="relative mt-4 overflow-hidden border-y border-line bg-surface py-3" aria-label="Mais procurados">
        <div className="marquee flex w-max gap-3">
          {[...POPULAR, ...POPULAR, ...POPULAR, ...POPULAR].map((p, i) => (
            <Link key={i} to={p.to} tabIndex={i >= POPULAR.length ? -1 : 0} aria-hidden={i >= POPULAR.length} className="flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-sm font-bold text-muted transition hover:bg-brand-soft hover:text-brand">
              <TrendingUp size={14} className="text-coral" />{p.l}
            </Link>
          ))}
        </div>
      </div>

      {session?.role === 'tutor' && <ForMyPet />}

      {/* CATEGORIAS COM FOTO */}
      <section className="gutter mt-14">
        <div className="mx-auto max-w-7xl">
          <SectionTitle eyebrow="Serviços" title="Tudo o que seu pet precisa, perto de casa" />
          <Reveal className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            {CATEGORIES.map((c) => (
              <Link key={c.id} to={`/buscar?cat=${c.id}`} className="lift zoom-img group relative block overflow-hidden rounded-3xl bg-surface-2">
                <div className="aspect-[4/3.4] w-full">
                  {categoryImage(c.id)
                    ? <img src={categoryImage(c.id)} alt="" loading="lazy" decoding="async" className="img-cover" />
                    : <div className="dots grid h-full place-items-center bg-brand-soft text-brand"><CategoryIcon id={c.id} size={44} strokeWidth={1.6} /></div>}
                </div>
                <div className={cx('absolute inset-0', categoryImage(c.id) ? 'bg-gradient-to-t from-[rgb(7_13_38/.85)] via-[rgb(7_13_38/.15)] to-transparent' : 'bg-gradient-to-t from-[#1838cc] via-[#1838cc]/40 to-transparent')} />
                <div className="absolute inset-x-0 bottom-0 p-3 text-white sm:p-4">
                  <span className="mb-2 grid h-9 w-9 place-items-center rounded-xl bg-white/95 text-[#1838cc] shadow transition group-hover:bg-ball group-hover:text-[#0b1640]"><CategoryIcon id={c.id} size={19} /></span>
                  <b className="block font-display text-lg font-semibold leading-tight sm:text-xl">{c.label}</b>
                  <span className="mt-0.5 line-clamp-2 hidden text-xs text-white/80 sm:block">{c.description}</span>
                </div>
              </Link>
            ))}
          </Reveal>
        </div>
      </section>

      <Promos />

      <HowItWorks />

      {/* DESTAQUES */}
      <section className="gutter mt-20">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SectionTitle eyebrow="Bem avaliados" title="Perto de você" />
            <div className="scroll-x flex max-w-full gap-1.5">
              {CITIES.map((c) => <button key={c.id} onClick={() => setFeatCity(c.id)} className={cx('chip px-3 py-1.5 transition', featCity === c.id ? 'bg-[#1838cc] text-white' : 'hover:bg-surface-3')}>{c.name}</button>)}
            </div>
          </div>
          {featured.loading ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-80" />)}</div>
          ) : (
            <Reveal key={featCity} className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{featured.data?.slice(0, 8).map((p) => <ProviderCard key={p.id} p={p} />)}</Reveal>
          )}
          <div className="mt-8 text-center"><Link to={`/buscar?cidade=${featCity}`} className="btn btn-outline">Ver todos em {CITIES.find((c) => c.id === featCity)?.name}<ArrowRight size={16} /></Link></div>
        </div>
      </section>

      <ClubBanner />

      {/* AVALIAÇÕES */}
      <section className="gutter mt-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[.85fr_1.15fr]">
            <div>
              <SectionTitle eyebrow="Avaliações verificadas" title="Só avalia quem contratou pelo Cuidopê" />
              <p className="mt-3 text-muted">Cada avaliação está ligada a um atendimento concluído. Prestador não paga para subir a nota, e as respostas dele ficam públicas ao lado.</p>
              {stats.data && (
                <dl className="mt-7 grid grid-cols-3 gap-3">
                  <Stat k="prestadores"><CountUp value={stats.data.providers} /></Stat>
                  <Stat k="avaliações"><CountUp value={stats.data.reviews} /></Stat>
                  <Stat k="nota média"><CountUp value={stats.data.avgRating} decimals={1} /></Stat>
                </dl>
              )}
            </div>
            <Reveal className="grid gap-3 sm:grid-cols-2">
              {recent.data?.map(({ rv, p }) => (
                <figure key={rv.id} className="card lift flex flex-col gap-2 p-5">
                  <div className="flex items-center justify-between"><Stars value={rv.rating} /><span className="text-xs text-muted">{relTime(rv.createdAt)}</span></div>
                  <blockquote className="line-clamp-4 text-[0.95rem] leading-relaxed">“{rv.text}”</blockquote>
                  <figcaption className="mt-auto flex items-center gap-2 border-t border-line pt-3 text-xs text-muted">
                    <Avatar name={rv.authorName} seed={rv.authorName.length * 5} src={personAvatar(rv.authorName)} size={32} />
                    <span><b className="text-ink">{rv.authorName}</b> · tutor(a) de {rv.petName}<br />sobre <Link className="relative z-[2] font-bold text-brand" to={`/p/${p.slug}`}>{p.name}</Link></span>
                  </figcaption>
                </figure>
              ))}
            </Reveal>
          </div>
        </div>
      </section>

      <ProviderCTA />
    </div>
  );
}

function SectionTitle({ eyebrow, title, light = false }: { eyebrow: string; title: string; light?: boolean }) {
  return (
    <div>
      <div className={cx('eyebrow', light && 'text-ball')}>{eyebrow}</div>
      <h2 className={cx('mt-1 text-3xl sm:text-[2.6rem] sm:leading-[1.08]', light && 'text-white')}>{title}</h2>
    </div>
  );
}

const Stat = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="rounded-2xl border border-line bg-surface p-4"><dt className="text-xs font-bold text-muted">{k}</dt><dd className="font-display text-3xl font-semibold tabular text-brand">{children}</dd></div>
);

/* ------------------------------------------------------------------ HERO */
function Hero(props: { onSearch: () => void; cat: CategoryId | 'todos'; setCat: (c: CategoryId | 'todos') => void; city: string; setCity: (c: string) => void; species: Species; setSpecies: (s: Species) => void }) {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    if (reducedMotion()) return;
    const q = gsap.utils.selector(root);
    const t = gsap.timeline({ delay: 0.15 });
    t.from(q('.h-chip'), { opacity: 0, y: 12, duration: 0.5 })
      .from(q('.h-sub, .h-form, .h-trust'), { opacity: 0, y: 18, stagger: 0.1, duration: 0.7 }, 0.45)
      .from(q('.h-photo'), { clipPath: 'inset(10% 10% 10% 10% round 48px)', opacity: 0, duration: 1.2, ease: 'expo.out' }, 0.1)
      .from(q('.h-float'), { opacity: 0, y: 26, scale: 0.92, stagger: 0.15, duration: 0.7, ease: 'back.out(1.7)' }, 0.7)
      .from(q('.h-blob'), { scale: 0.6, opacity: 0, duration: 1.4, ease: 'expo.out' }, 0);
    q('.h-float').forEach((el, i) => gsap.to(el, { y: i % 2 ? 8 : -8, duration: 2.6 + i * 0.4, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 1.6 }));
    gsap.to(q('.h-photo img'), { yPercent: 6, ease: 'none', scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: true } });
  }, { scope: root });

  return (
    <section ref={root} className="gutter relative overflow-hidden">
      <div className="h-blob pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-ball/30 blur-3xl" aria-hidden="true" />
      <div className="h-blob pointer-events-none absolute -left-32 top-64 h-80 w-80 rounded-full bg-[#1838cc]/15 blur-3xl" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 py-8 md:py-14 lg:grid-cols-[1.05fr_.95fr]">
        <div>
          <span className="h-chip chip bg-brand-soft text-brand"><BrandIcon size={16} />Passeio · Pet sitter · Pet house · Banho e tosa</span>
          <SplitHeading className="mt-4 text-[2.55rem] font-semibold leading-[1.02] sm:text-[4.1rem]">Quem cuida do seu pet quando você <span className="whitespace-nowrap text-brand">não pode?</span></SplitHeading>
          <p className="h-sub mt-5 max-w-xl text-lg text-muted">Compare passeadores, cuidadores, pet houses e pet shops do seu bairro pelas avaliações de quem contratou. Escolha o horário e confirme pelo WhatsApp.</p>

          <form className="h-form card mt-7 grid gap-3 p-3 shadow-lift sm:grid-cols-[1.2fr_1fr_auto_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); props.onSearch(); }}>
            <div>
              <label className="label px-1" htmlFor="h-cat">Serviço</label>
              <select id="h-cat" className="input" value={props.cat} onChange={(e) => props.setCat(e.target.value as CategoryId)}>
                <option value="todos">Todos os serviços</option>
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label px-1" htmlFor="h-city">Cidade</label>
              <select id="h-city" className="input" value={props.city} onChange={(e) => props.setCity(e.target.value)}>
                {CITIES.map((c) => <option key={c.id} value={c.id}>{c.name} / {c.uf}</option>)}
              </select>
            </div>
            <div>
              <span className="label px-1">Pet</span>
              <Segmented value={props.species} onChange={props.setSpecies} options={[{ value: 'cao', label: 'Cão' }, { value: 'gato', label: 'Gato' }]} />
            </div>
            <button className="btn btn-primary h-[44px]" type="submit"><Search size={17} />Buscar</button>
          </form>

          <div className="h-trust mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-semibold text-muted">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck size={17} className="text-brand" />Identidade verificada</span>
            <span className="inline-flex items-center gap-1.5"><Star size={17} className="text-brand" />Avaliação só de quem contratou</span>
            <span className="inline-flex items-center gap-1.5"><MessageCircle size={17} className="text-brand" />Confirmação no WhatsApp</span>
          </div>
        </div>

        {/* cena: foto + cartões flutuantes */}
        <div className="relative mx-auto w-full max-w-xl px-2 sm:px-6" aria-hidden="true">
          <div className="h-photo relative aspect-[4/3.6] overflow-hidden rounded-[44px] bg-surface-2 shadow-lift">
            {IMG.hero && <img src={IMG.hero} srcSet={`${IMG.heroSm} 900w, ${IMG.hero} 1600w`} sizes="(min-width:1024px) 560px, 92vw" alt="" className="img-cover scale-[1.1] object-[62%_50%]" fetchPriority="high" />}
            <div className="absolute inset-0 bg-gradient-to-t from-[rgb(7_13_38/.35)] to-transparent" />
          </div>

          <div className="h-float glass absolute left-0 top-5 flex items-center gap-3 rounded-2xl border border-white/40 p-3 shadow-lift">
            <Avatar name="Casa da Carla Pet House" seed={1} src={providerAvatar('casa-da-carla-pet-house')} size={40} />
            <div className="text-sm"><b className="block leading-tight">Casa da Carla</b><span className="inline-flex items-center gap-1 text-xs text-muted"><Star size={12} className="text-[#f2b01e]" fill="currentColor" strokeWidth={0} />4,9 · 212 avaliações</span></div>
          </div>

          <div className="h-float absolute right-0 top-[40%] w-52 rounded-2xl bg-wa-bg p-2.5 shadow-lift sm:w-56">
            <div className="mb-1.5 flex items-center gap-1.5 text-[0.7rem] font-bold text-muted"><MessageCircle size={12} className="text-wa" />WhatsApp · agora</div>
            <div className="rounded-xl rounded-tl-sm bg-surface p-2 text-[0.78rem] leading-snug shadow-sm">Carla aceitou o <b>passeio do Thor</b> amanhã às 08:00. Toque em <b>Confirmar</b>. 🐾</div>
            <div className="ml-auto mt-1.5 w-fit rounded-xl rounded-tr-sm bg-wa-bubble px-2.5 py-1 text-[0.78rem] font-semibold">Confirmar <CheckCheck size={12} className="inline text-[#34b7f1]" /></div>
          </div>

          <div className="h-float absolute -bottom-4 left-8 flex items-center gap-3 rounded-2xl bg-[#0b1640] px-4 py-3 text-white shadow-lift">
            <span className="relative grid h-9 w-9 place-items-center rounded-full bg-ball text-[#0b1640]"><span className="absolute inset-0 animate-ping rounded-full bg-ball/60" /><Clock3 size={18} className="relative" /></span>
            <div className="text-sm"><b className="block leading-tight">Thor está passeando</b><span className="text-xs text-white/70">32 min · rota no Parque da Gare</span></div>
          </div>
        </div>
      </div>

      <div className="relative mx-auto max-w-7xl pb-2 pt-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-bold text-muted">Mais buscados:</span>
          {POPULAR.slice(0, 5).map((p) => <Link key={p.l} to={p.to} className="chip border border-line bg-surface transition hover:border-brand hover:text-brand">{p.l}</Link>)}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ PARA O MEU PET */
function ForMyPet() {
  const me = useQuery((r) => r.getMe(), []);
  const [active] = useActivePet();
  const pet = me.data?.pets.find((p) => p.id === active) ?? me.data?.pets[0];
  const list = useQuery(async (r) => (pet ? r.searchProviders({ species: pet.species, size: pet.species === 'cao' ? pet.size : undefined, cityId: 'passo-fundo-rs', sort: 'avaliacao' }) : []), [pet?.id]);
  if (!pet || !list.data?.length) return null;
  return (
    <section className="gutter mt-12">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionTitle eyebrow={`Escolhidos para ${pet.name}`} title={pet.species === 'gato' ? 'Quem cuida bem de gatos perto de você' : `Quem atende cães de porte ${pet.size} perto de você`} />
          <Link to={`/buscar?especie=${pet.species}${pet.species === 'cao' ? `&porte=${pet.size}` : ''}`} className="btn btn-outline btn-sm">Ver todos<ArrowRight size={15} /></Link>
        </div>
        <Reveal className="scroll-x -mx-4 mt-5 flex snap-x gap-4 px-4 pb-2">
          {list.data.slice(0, 8).map((p) => <div key={p.id} className="w-[280px] shrink-0 snap-start"><ProviderCard p={p} compact /></div>)}
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ CARROSSEL */
const SLIDES = [
  { key: 'pacotes', eyebrow: 'Pacotes', title: 'Passeio todo dia sai até 25% mais barato', text: '10 passeios, creche mensal ou clube do banho: você compra uma vez e agenda quando quiser, com o saldo no app.', cta: 'Ver prestadores com pacotes', to: '/buscar?pacotes=1', img: IMG.pacotes ?? IMG.diego, tone: 'bg-[#1838cc] text-white', btn: 'btn-ball' },
  { key: 'clube', eyebrow: 'Clube Patinhas', title: 'Cada cuidado vira patinha. Patinhas viram mimo.', text: 'Junte patinhas a cada atendimento e avaliação e suba de nível: Filhote, Companheiro e Melhor Amigo.', cta: 'Conhecer o clube', to: '/clube', img: IMG.gato ?? IMG.carla, tone: 'bg-ball text-[#0b1640]', btn: 'btn-primary' },
  { key: 'prestador', eyebrow: 'Para quem cuida de pets', title: 'Sua agenda e seu WhatsApp trabalhando juntos', text: 'Receba pedidos com a ficha do pet, confirme pelo WhatsApp e venda pacotes. Comece grátis.', cta: 'Anunciar meus serviços', to: '/anunciar', img: IMG.prestador ?? IMG.groomer, tone: 'bg-[#0b1640] text-white', btn: 'btn-ball' },
];

function Promos() {
  const [i, setI] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const prog = useRef<gsap.core.Tween | null>(null);
  const touch = useRef<number | null>(null);
  const goTo = (n: number) => setI((n + SLIDES.length) % SLIDES.length);

  useGSAP(() => {
    const q = gsap.utils.selector(root);
    if (!reducedMotion()) {
      gsap.fromTo(q(`[data-slide="${i}"]`), { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power2.out' });
      gsap.fromTo(q(`[data-slide="${i}"] .p-anim`), { opacity: 0, y: 22 }, { opacity: 1, y: 0, stagger: 0.08, duration: 0.6, delay: 0.1 });
      gsap.fromTo(q(`[data-slide="${i}"] .p-img`), { scale: 1.12 }, { scale: 1, duration: 1.4, ease: 'expo.out' });
    }
    prog.current?.kill();
    const bars = q('.p-bar');
    bars.forEach((b, k) => gsap.set(b, { scaleX: k < i ? 1 : 0 }));
    if (reducedMotion()) gsap.set(bars[i], { scaleX: 1 });
    else prog.current = gsap.to(bars[i], { scaleX: 1, duration: 6, ease: 'none', onComplete: () => goTo(i + 1) });
  }, { scope: root, dependencies: [i] });

  return (
    <section className="gutter mt-20" aria-roledescription="carrossel" aria-label="Destaques">
      <div ref={root} className="relative mx-auto max-w-7xl"
        onMouseEnter={() => prog.current?.pause()} onMouseLeave={() => prog.current?.resume()}
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; prog.current?.pause(); }}
        onTouchEnd={(e) => { const s = touch.current; touch.current = null; if (s == null) return; const dx = e.changedTouches[0].clientX - s; if (Math.abs(dx) > 40) goTo(i + (dx < 0 ? 1 : -1)); else prog.current?.resume(); }}>
        <div className="relative overflow-hidden rounded-[32px]">
          {SLIDES.map((s, k) => (
            <div key={s.key} data-slide={k} aria-hidden={k !== i} className={cx('grid min-h-[420px] items-stretch md:grid-cols-[1.05fr_.95fr]', s.tone, k === i ? 'relative' : 'pointer-events-none invisible absolute inset-0')}>
              <div className="relative z-[1] flex flex-col justify-center p-7 sm:p-12">
                <div className="p-anim text-xs font-extrabold uppercase tracking-[.12em] opacity-80">{s.eyebrow}</div>
                <h3 className="p-anim mt-2 font-display text-3xl font-semibold leading-[1.05] sm:text-5xl">{s.title}</h3>
                <p className="p-anim mt-4 max-w-md opacity-85">{s.text}</p>
                <Link to={s.to} tabIndex={k === i ? 0 : -1} className={cx('p-anim btn mt-7 w-fit', s.btn)}>{s.cta}<ArrowRight size={16} /></Link>
              </div>
              <div className="relative hidden overflow-hidden md:block">
                {s.img ? <img src={s.img} alt="" loading="lazy" className="p-img img-cover absolute inset-0" /> : <div className="dots absolute inset-0 opacity-40" />}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="flex flex-1 gap-2">
            {SLIDES.map((s, k) => (
              <button key={s.key} onClick={() => goTo(k)} aria-label={`Ir para destaque ${k + 1}: ${s.eyebrow}`} aria-current={k === i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                <span className="p-bar block h-full origin-left rounded-full bg-brand" />
              </button>
            ))}
          </div>
          <button className="btn btn-outline btn-sm h-9 w-9 p-0" onClick={() => goTo(i - 1)} aria-label="Destaque anterior"><ChevronLeft size={18} /></button>
          <button className="btn btn-outline btn-sm h-9 w-9 p-0" onClick={() => goTo(i + 1)} aria-label="Próximo destaque"><ChevronRight size={18} /></button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ COMO FUNCIONA */
function HowItWorks() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    if (reducedMotion()) return;
    const q = gsap.utils.selector(root);
    gsap.fromTo(q('.hw-line'), { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: root.current, start: 'top 75%', end: 'center 45%', scrub: 0.6 } });
    q('.hw-step').forEach((el, k) => {
      gsap.from(el, { opacity: 0, y: 40, duration: 0.8, delay: k * 0.12, scrollTrigger: { trigger: root.current, start: 'top 80%', once: true } });
      gsap.from(el.querySelector('.hw-num'), { scale: 0, rotate: -40, duration: 0.7, ease: 'back.out(2.4)', delay: 0.25 + k * 0.15, scrollTrigger: { trigger: root.current, start: 'top 80%', once: true } });
    });
  }, { scope: root });
  const steps = [
    { icon: Search, t: 'Compare com calma', d: 'Filtre por bairro, porte e espécie. Veja preço, pacotes, tempo de resposta e avaliações de quem já contratou.' },
    { icon: CalendarCheck, t: 'Peça o horário', d: 'Escolha serviço, pet e horário livre. O prestador recebe o pedido com a ficha do pet e responde no painel.' },
    { icon: MessageCircle, t: 'Confirme no WhatsApp', d: 'Quando o prestador aceita, chega uma mensagem com o botão Confirmar. Um toque e a vaga é sua; lembrete no dia anterior.' },
  ];
  return (
    <section ref={root} className="gutter mt-20">
      <div className="mx-auto max-w-7xl">
        <SectionTitle eyebrow="Como funciona" title="Do primeiro clique ao pet bem cuidado" />
        <div className="relative mt-10">
          <div className="absolute left-[16%] right-[16%] top-8 hidden h-1 rounded-full bg-surface-3 md:block" aria-hidden="true"><div className="hw-line h-full origin-left rounded-full bg-gradient-to-r from-[#1838cc] via-[#5b7bff] to-ball" /></div>
          <ol className="relative grid gap-5 md:grid-cols-3">
            {steps.map((s, k) => (
              <li key={s.t} className="hw-step card lift relative p-6 pt-5 text-center">
                <span className="hw-num relative mx-auto -mt-1 mb-4 grid h-16 w-16 place-items-center rounded-[22px] bg-[#1838cc] text-white shadow-lift">
                  <s.icon size={28} />
                  <span className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-ball font-display text-sm font-bold text-[#0b1640]">{k + 1}</span>
                </span>
                <h3 className="text-xl font-semibold">{s.t}</h3>
                <p className="mt-2 text-sm text-muted">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ CLUBE */
function ClubBanner() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    if (reducedMotion()) return;
    const q = gsap.utils.selector(root);
    gsap.from(q('.cb-paw'), { y: 30, opacity: 0, rotate: -12, stagger: 0.08, duration: 0.6, ease: 'back.out(2)', scrollTrigger: { trigger: root.current, start: 'top 80%', once: true } });
  }, { scope: root });
  return (
    <section ref={root} className="gutter mt-20">
      <div className="relative mx-auto grid max-w-7xl items-center gap-8 overflow-hidden rounded-[32px] bg-ball p-7 text-[#0b1640] sm:p-12 lg:grid-cols-[1.1fr_.9fr]">
        <div className="relative z-[1]">
          <div className="text-xs font-extrabold uppercase tracking-[.12em]">Clube Patinhas</div>
          <h2 className="mt-2 font-display text-3xl font-semibold leading-[1.05] sm:text-5xl">Cuidou, ganhou patinha.</h2>
          <p className="mt-4 max-w-lg text-[#0b1640]/80">+10 patinhas por atendimento concluído, +50 por avaliação publicada e +30 por pacote. Troque por banho de cortesia, desconto em pacotes e prioridade nas datas de pico.</p>
          <div className="mt-6 flex flex-wrap gap-3"><Link to="/clube" className="btn btn-primary"><Award size={17} />Conhecer o clube</Link><Link to="/conta/clube" className="btn border border-[#0b1640]/25 hover:bg-[#0b1640]/5">Ver minhas patinhas</Link></div>
        </div>
        <div className="relative grid grid-cols-3 gap-3" aria-hidden="true">
          {[['Filhote', '0+', 'bg-white'], ['Companheiro', '200+', 'bg-white'], ['Melhor Amigo', '600+', 'bg-[#1838cc] text-white']].map(([n, p, c], k) => (
            <div key={n} className={cx('cb-paw rounded-3xl p-4 text-center shadow-lift', c)} style={{ marginTop: k * 18 }}>
              <svg viewBox="0 0 24 24" className={cx('mx-auto h-10 w-10', k === 2 ? 'fill-ball' : 'fill-[#1838cc]')}><ellipse cx="12" cy="15.5" rx="5" ry="4.2" /><circle cx="5.5" cy="10" r="2.2" /><circle cx="9.5" cy="5.8" r="2.2" /><circle cx="14.5" cy="5.8" r="2.2" /><circle cx="18.5" cy="10" r="2.2" /></svg>
              <b className="mt-2 block font-display text-lg leading-tight">{n}</b><span className="text-xs opacity-70">{p} patinhas</span>
            </div>
          ))}
          <Gift className="absolute -right-2 -top-8 h-16 w-16 rotate-12 text-[#0b1640]/10" />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ CTA PRESTADOR */
function ProviderCTA() {
  const { session } = useSession(); const repo = useRepo(); const nav = useNavigate();
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    if (reducedMotion()) return;
    const q = gsap.utils.selector(root);
    gsap.from(q('.pc-kpi'), { opacity: 0, y: 30, scale: 0.95, stagger: 0.1, duration: 0.7, ease: 'back.out(1.5)', scrollTrigger: { trigger: root.current, start: 'top 75%', once: true } });
  }, { scope: root });
  return (
    <section ref={root} className="gutter mt-20">
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 overflow-hidden rounded-[32px] bg-[#1838cc] p-7 text-white sm:p-12 lg:grid-cols-2">
        <div className="dots pointer-events-none absolute inset-0 opacity-25" aria-hidden="true" />
        <div className="relative">
          <SectionTitle eyebrow="Para quem cuida de pets" title="Agenda, WhatsApp e pacotes num só painel" light />
          <ul className="mt-6 space-y-2.5 text-[0.97rem]">
            {['Pedidos chegam com a ficha do pet e você aceita em um toque', 'Confirmação, lembrete e pedido de avaliação saem sozinhos no WhatsApp', 'Caixa de conversas com status: aguardando atendimento, aguardando cliente, agendado', 'Pacotes de passeio, creche e banho com saldo controlado por cliente', 'Alerta de clientes sumidos e de horários livres para oferecer'].map((t) => (
              <li key={t} className="flex gap-2"><BadgeCheck size={19} className="mt-0.5 shrink-0 text-ball" />{t}</li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/anunciar" className="btn btn-ball">Anunciar meus serviços</Link>
            <button className="btn border border-white/30 text-white hover:bg-white/10" onClick={async () => { if (session?.role !== 'prestador') await repo.signInDemo('prestador'); nav('/painel'); }}>Ver painel de exemplo<ArrowRight size={16} /></button>
          </div>
        </div>
        <div className="relative" aria-hidden="true">
          {IMG.prestador && <img src={IMG.prestador} alt="" loading="lazy" className="absolute right-0 top-0 hidden h-64 w-64 rounded-[40px] object-cover shadow-lift lg:block" />}
          <div className="relative grid grid-cols-2 gap-3 text-[#0b1640] lg:pt-44">
            {[{ t: 'Aguardando atendimento', v: '3', s: 'responda em até 15 min', c: 'text-[#d9473a]' }, { t: 'Agendamentos hoje', v: '6', s: '2 em atendimento', c: 'text-[#1838cc]' }, { t: 'Receita do mês', v: 'R$ 8,4 mil', s: '+12% vs mês anterior', c: 'text-[#138a5b]' }, { t: 'Pacotes ativos', v: '11', s: '10 passeios é o mais vendido', c: 'text-[#2f6fe0]' }].map((k) => (
              <div key={k.t} className="pc-kpi rounded-2xl bg-white p-4 shadow-lift">
                <div className="text-xs font-bold text-[#56608a]">{k.t}</div>
                <div className={cx('font-display text-2xl font-semibold', k.c)}>{k.v}</div>
                <div className="mt-1 flex items-center gap-1 text-xs text-[#56608a]">{k.t.startsWith('Pacotes') && <Package size={12} />}{k.s}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
