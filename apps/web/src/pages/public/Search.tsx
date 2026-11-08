import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { List, Map as MapIcon, Search, SlidersHorizontal, X } from 'lucide-react';
import { useQuery, useRepo, useSession } from '../../lib/repo';
import { CATEGORIES, CITIES, SIZE_SHORT } from '../../data/demo/catalog';
import { CategoryIcon } from '../../components/CategoryIcon';
import { ProviderCard } from '../../components/ProviderCard';
import { MiniMap } from '../../components/MiniMap';
import { CardSkeletons, Empty, ErrorBox, Modal, Segmented, useToast } from '../../components/ui';
import { IMG } from '../../lib/media';
import type { CategoryId, PetSize, SearchFilters, Species } from '../../domain/types';
import { cx } from '../../lib/format';

export function SearchPage() {
  const [sp, setSp] = useSearchParams();
  const repo = useRepo(); const { session } = useSession(); const toast = useToast(); const nav = useNavigate();
  const [view, setView] = useState<'lista' | 'mapa'>('lista');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [q, setQ] = useState(sp.get('q') ?? '');

  const f: SearchFilters = useMemo(() => ({
    q: sp.get('q') ?? undefined,
    category: (sp.get('cat') as CategoryId) || 'todos',
    cityId: sp.get('cidade') ?? undefined,
    neighborhood: sp.get('bairro') ?? undefined,
    species: (sp.get('especie') as Species) || undefined,
    size: (sp.get('porte') as PetSize) || undefined,
    minRating: sp.get('nota') ? Number(sp.get('nota')) : undefined,
    maxPriceCents: sp.get('preco') ? Number(sp.get('preco')) * 100 : undefined,
    verifiedOnly: sp.get('verificado') === '1',
    withPackages: sp.get('pacotes') === '1',
    sort: (sp.get('ordem') as SearchFilters['sort']) || 'relevancia',
  }), [sp]);

  const set = (k: string, v?: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k === 'cidade') n.delete('bairro'); setSp(n, { replace: true }); };
  const res = useQuery((r) => r.searchProviders(f), [JSON.stringify(f)]);
  const favs = useQuery((r) => (session?.role === 'tutor' ? r.listFavorites() : Promise.resolve([] as string[])), [session?.role]);
  const city = CITIES.find((c) => c.id === f.cityId);
  const active = [
    f.cityId && { k: 'cidade', l: city?.name ?? f.cityId }, f.neighborhood && { k: 'bairro', l: f.neighborhood }, f.species && { k: 'especie', l: f.species === 'cao' ? 'Cães' : 'Gatos' },
    f.size && { k: 'porte', l: `Porte ${SIZE_SHORT[f.size]}` }, f.minRating && { k: 'nota', l: `${f.minRating}+ estrelas` }, f.maxPriceCents && { k: 'preco', l: `até R$ ${f.maxPriceCents / 100}` },
    f.verifiedOnly && { k: 'verificado', l: 'Verificados' }, f.withPackages && { k: 'pacotes', l: 'Com pacotes' }, f.q && { k: 'q', l: `“${f.q}”` },
  ].filter(Boolean) as { k: string; l: string }[];

  const toggleFav = async (id: string) => {
    if (session?.role !== 'tutor') { toast('Entre como tutor para salvar favoritos', 'info'); nav('/entrar?papel=tutor'); return; }
    await repo.toggleFavorite(id); favs.reload();
  };

  const filters = (
    <div className="space-y-5">
      <div>
        <label className="label" htmlFor="f-city">Cidade</label>
        <select id="f-city" className="input" value={f.cityId ?? ''} onChange={(e) => set('cidade', e.target.value)}>
          <option value="">Todas as cidades</option>
          {CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}/{c.uf}</option>)}
        </select>
      </div>
      {city && (
        <div>
          <label className="label" htmlFor="f-hood">Bairro</label>
          <select id="f-hood" className="input" value={f.neighborhood ?? ''} onChange={(e) => set('bairro', e.target.value)}>
            <option value="">Todos os bairros</option>
            {city.neighborhoods.map((n) => <option key={n}>{n}</option>)}
          </select>
        </div>
      )}
      <div>
        <span className="label">Espécie</span>
        <Segmented value={(f.species ?? 'todos') as string} onChange={(v) => set('especie', v === 'todos' ? null : v)} options={[{ value: 'todos', label: 'Todas' }, { value: 'cao', label: 'Cão' }, { value: 'gato', label: 'Gato' }]} />
      </div>
      <div>
        <span className="label">Porte do pet</span>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(SIZE_SHORT) as PetSize[]).map((s) => <button key={s} onClick={() => set('porte', f.size === s ? null : s)} className={cx('chip px-3 py-1.5', f.size === s ? 'bg-brand text-brand-ink' : 'hover:bg-surface-3')}>{SIZE_SHORT[s]}</button>)}
        </div>
      </div>
      <div>
        <span className="label">Avaliação mínima</span>
        <div className="flex gap-1.5">{[0, 4, 4.5, 4.8].map((n) => <button key={n} onClick={() => set('nota', n ? String(n) : null)} className={cx('chip px-3 py-1.5', (f.minRating ?? 0) === n ? 'bg-brand text-brand-ink' : 'hover:bg-surface-3')}>{n ? `${n.toString().replace('.', ',')}+ ★` : 'Todas'}</button>)}</div>
      </div>
      <div>
        <label className="label" htmlFor="f-price">Preço até {f.maxPriceCents ? `R$ ${f.maxPriceCents / 100}` : '(sem limite)'}</label>
        <input id="f-price" type="range" min={20} max={250} step={10} value={f.maxPriceCents ? f.maxPriceCents / 100 : 250} onChange={(e) => set('preco', e.target.value === '250' ? null : e.target.value)} className="w-full accent-[var(--brand)]" />
      </div>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={!!f.verifiedOnly} onChange={(e) => set('verificado', e.target.checked ? '1' : null)} />Só identidade verificada</label>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={!!f.withPackages} onChange={(e) => set('pacotes', e.target.checked ? '1' : null)} />Com pacotes (economize)</label>
    </div>
  );

  return (
    <div className="gutter mx-auto max-w-7xl py-6">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); set('q', q.trim() || null); }} role="search">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-10" placeholder="Nome, serviço ou bairro (ex.: tosa, Vila Rodrigues)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        </div>
        <button className="btn btn-primary" type="submit">Buscar</button>
        <button type="button" className="btn btn-outline lg:hidden" onClick={() => setFiltersOpen(true)} aria-label="Filtros"><SlidersHorizontal size={17} /></button>
      </form>

      <div className="scroll-x -mx-1 mt-4 flex gap-2 px-1 pb-1">
        <button onClick={() => set('cat', null)} className={cx('chip shrink-0 px-3.5 py-2 text-sm', f.category === 'todos' ? 'bg-ink text-bg' : 'hover:bg-surface-3')}>Todos</button>
        {CATEGORIES.map((c) => (
          <button key={c.id} onClick={() => set('cat', f.category === c.id ? null : c.id)} className={cx('chip shrink-0 px-3.5 py-2 text-sm', f.category === c.id ? 'bg-ink text-bg' : 'hover:bg-surface-3')}>
            <CategoryIcon id={c.id} size={15} />{c.label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block"><div className="card sticky top-24 p-5"><div className="mb-4 font-display text-lg font-bold">Filtros</div>{filters}</div></aside>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="mr-auto text-xl font-bold">
              {res.data ? `${res.data.length} ${res.data.length === 1 ? 'resultado' : 'resultados'}` : 'Buscando…'}
              <span className="font-normal text-muted"> {f.category !== 'todos' ? `de ${CATEGORIES.find((c) => c.id === f.category)?.label.toLowerCase()}` : ''} {city ? `em ${city.name}` : ''}</span>
            </h1>
            <select className="input w-auto py-1.5 text-sm" value={f.sort} onChange={(e) => set('ordem', e.target.value)} aria-label="Ordenar">
              <option value="relevancia">Mais relevantes</option><option value="avaliacao">Melhor avaliados</option><option value="preco">Menor preço</option><option value="resposta">Respondem mais rápido</option>
            </select>
            <Segmented value={view} onChange={setView} options={[{ value: 'lista', label: <span className="inline-flex items-center gap-1"><List size={15} />Lista</span> }, { value: 'mapa', label: <span className="inline-flex items-center gap-1"><MapIcon size={15} />Mapa</span> }]} />
          </div>
          {active.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {active.map((a) => <button key={a.k} onClick={() => { set(a.k, null); if (a.k === 'q') setQ(''); }} className="chip bg-surface-3 hover:bg-line">{a.l}<X size={12} /></button>)}
              <button className="text-sm font-semibold text-brand" onClick={() => { setSp(new URLSearchParams(), { replace: true }); setQ(''); }}>Limpar tudo</button>
            </div>
          )}
          <p className="mt-2 text-xs text-muted">Ordem por relevância: nota (ponderada pelo nº de avaliações), tempo de resposta e verificações. Destaques pagos não alteram a nota.</p>

          {res.error ? <ErrorBox error={res.error} /> : res.loading ? <div className="mt-4"><CardSkeletons /></div> : !res.data?.length ? (
            <div className="mt-6"><Empty icon={<Search />} image={IMG.gato} title="Nenhum prestador com esses filtros">Tente remover {active.length ? `“${active[active.length - 1].l}”` : 'algum filtro'} ou buscar em outra cidade. Não relaxamos filtros sem avisar.</Empty></div>
          ) : view === 'mapa' ? (
            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
              <MiniMap items={res.data} active={hover} onPick={(s) => nav(`/p/${s}`)} className="h-[420px] xl:h-[620px]" />
              <div className="grid max-h-[620px] gap-3 overflow-y-auto pr-1">{res.data.map((p) => <ProviderCard key={p.id} p={p} compact highlight={hover === p.id} onHover={setHover} fav={favs.data?.includes(p.id)} onFav={() => toggleFav(p.id)} />)}</div>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{res.data.map((p) => <ProviderCard key={p.id} p={p} fav={favs.data?.includes(p.id)} onFav={() => toggleFav(p.id)} />)}</div>
          )}
        </div>
      </div>
      <Modal open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filtros" footer={<button className="btn btn-primary" onClick={() => setFiltersOpen(false)}>Ver {res.data?.length ?? ''} resultados</button>}>{filters}</Modal>
    </div>
  );
}
