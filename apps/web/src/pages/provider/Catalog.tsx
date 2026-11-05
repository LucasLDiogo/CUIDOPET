import { useState } from 'react';
import { Package, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { errorMessage, useQuery, useRepo } from '../../lib/repo';
import { PageHead } from '../../components/ProviderLayout';
import { Empty, ErrorBox, Modal, Spinner, Toggle, useToast } from '../../components/ui';
import { CategoryIcon } from '../../components/CategoryIcon';
import { CATEGORIES, SIZE_SHORT, UNIT_LABEL } from '../../data/demo/catalog';
import { commissionCents } from '../../domain/rules';
import { cx, formatBRL, relTime } from '../../lib/format';
import type { CategoryId, PetSize, PriceUnit, Service, ServicePackage, Species } from '../../domain/types';

const toCents = (s: string) => Math.round(Number(s.replace(/\./g, '').replace(',', '.')) * 100);
const fromCents = (c: number) => (c / 100).toFixed(2).replace('.', ',');

export function ServicesPage() {
  const { data, loading } = useQuery((r) => r.listServices(), []);
  const repo = useRepo(); const toast = useToast();
  const [edit, setEdit] = useState<Service | 'novo' | null>(null);
  if (loading) return <Spinner />;
  const byCat = CATEGORIES.map((c) => ({ c, items: (data ?? []).filter((s) => s.category === c.id) })).filter((g) => g.items.length);
  return (
    <div>
      <PageHead title="Serviços e preços" sub="O que aparece no seu perfil e no agendamento. O tutor vê o preço final; a comissão estimada é só para você." actions={<button className="btn btn-primary btn-sm" onClick={() => setEdit('novo')}><Plus size={16} />Novo serviço</button>} />
      {!byCat.length && <Empty icon={<Tags />} title="Cadastre seu primeiro serviço" action={<button className="btn btn-primary" onClick={() => setEdit('novo')}>Novo serviço</button>}>Ex.: Passeio 60 min por R$ 45, ou Diária de hospedagem por R$ 90.</Empty>}
      <div className="space-y-6">
        {byCat.map(({ c, items }) => (
          <section key={c.id}>
            <h2 className="mb-2 flex items-center gap-2 font-bold"><CategoryIcon id={c.id} size={18} className="text-brand" />{c.label}</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {items.map((s) => (
                <li key={s.id} className={cx('flex flex-wrap items-center gap-3 p-4', !s.active && 'opacity-55')}>
                  <div className="min-w-0 flex-1"><b>{s.name}</b>{!s.active && <span className="chip ml-2">pausado</span>}<p className="truncate text-sm text-muted">{s.description}</p>
                    <p className="text-xs text-muted">{s.durationMin} min · {s.species.map((x) => (x === 'cao' ? 'cães' : 'gatos')).join(' e ')} · porte {s.sizes.map((z) => SIZE_SHORT[z].toLowerCase()).join(', ')}</p></div>
                  <div className="text-right"><b className="font-display text-lg tabular">{formatBRL(s.priceCents)}</b><div className="text-xs text-muted">/{UNIT_LABEL[s.unit]} · você recebe ~{formatBRL(s.priceCents - commissionCents(s.priceCents))}</div></div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEdit(s)} aria-label={`Editar ${s.name}`}><Pencil size={16} /></button>
                  <button className="btn btn-ghost btn-sm text-danger" aria-label={`Excluir ${s.name}`} onClick={async () => { try { await repo.deleteService(s.id); toast('Serviço excluído'); } catch (e) { toast(errorMessage(e), 'erro'); } }}><Trash2 size={16} /></button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {edit && <ServiceForm svc={edit === 'novo' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ServiceForm({ svc, onClose }: { svc?: Service; onClose: () => void }) {
  const repo = useRepo(); const toast = useToast();
  const [f, setF] = useState({ category: svc?.category ?? ('passeio' as CategoryId), name: svc?.name ?? '', description: svc?.description ?? '', price: svc ? fromCents(svc.priceCents) : '', unit: svc?.unit ?? ('servico' as PriceUnit), durationMin: svc?.durationMin ?? 60, species: svc?.species ?? (['cao'] as Species[]), sizes: svc?.sizes ?? (['mini', 'pequeno', 'medio', 'grande', 'gigante'] as PetSize[]), active: svc?.active ?? true });
  const [err, setErr] = useState<unknown>(null);
  const cents = toCents(f.price || '0');
  return (
    <Modal open onClose={onClose} title={svc ? 'Editar serviço' : 'Novo serviço'} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={async () => { setErr(null); try { if (!f.species.length) throw new Error('Escolha ao menos uma espécie.'); if (!Number.isFinite(cents) || cents <= 0) throw new Error('Informe um preço válido.'); await repo.saveService({ id: svc?.id, category: f.category, name: f.name.trim(), description: f.description.trim(), priceCents: cents, unit: f.unit, durationMin: f.durationMin, species: f.species, sizes: f.sizes, active: f.active }); toast('Serviço salvo'); onClose(); } catch (e) { setErr(e); } }}>Salvar</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label" htmlFor="s-cat">Categoria</label><select id="s-cat" className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as CategoryId })}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="s-name">Nome</label><input id="s-name" className="input" maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Passeio 60 min" /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="s-desc">Descrição</label><textarea id="s-desc" className="input min-h-20" maxLength={400} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div><label className="label" htmlFor="s-price">Preço (R$)</label><input id="s-price" className="input tabular" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^\d,.]/g, '') })} placeholder="45,00" /></div>
        <div><label className="label" htmlFor="s-unit">Cobrado por</label><select id="s-unit" className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as PriceUnit })}>{Object.entries(UNIT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div><label className="label" htmlFor="s-dur">Duração (min)</label><input id="s-dur" type="number" min={10} max={1440} className="input" value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) })} /></div>
        <div><span className="label">Espécies</span><div className="flex gap-1.5">{(['cao', 'gato'] as Species[]).map((s) => <button type="button" key={s} onClick={() => setF({ ...f, species: f.species.includes(s) ? f.species.filter((x) => x !== s) : [...f.species, s] })} className={cx('chip px-3 py-1.5', f.species.includes(s) && 'bg-brand text-brand-ink')}>{s === 'cao' ? 'Cães' : 'Gatos'}</button>)}</div></div>
        <div className="sm:col-span-2"><span className="label">Portes atendidos</span><div className="flex flex-wrap gap-1.5">{(Object.keys(SIZE_SHORT) as PetSize[]).map((s) => <button type="button" key={s} onClick={() => setF({ ...f, sizes: f.sizes.includes(s) ? f.sizes.filter((x) => x !== s) : [...f.sizes, s] })} className={cx('chip px-3 py-1.5', f.sizes.includes(s) && 'bg-brand text-brand-ink')}>{SIZE_SHORT[s]}</button>)}</div></div>
        <div className="sm:col-span-2"><Toggle id="s-active" checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Disponível para agendamento" description="Desligue para pausar sem perder o histórico." /></div>
        {cents > 0 && <p className="rounded-xl bg-surface-2 p-3 text-sm sm:col-span-2">Tutor paga <b>{formatBRL(cents)}</b> · comissão estimada da plataforma (12%) <b>{formatBRL(commissionCents(cents))}</b> · você recebe <b>{formatBRL(cents - commissionCents(cents))}</b></p>}
        {err ? <div className="sm:col-span-2"><ErrorBox error={errorMessage(err)} /></div> : null}
      </div>
    </Modal>
  );
}

export function PackagesPage() {
  const pk = useQuery((r) => r.listPackages(), []);
  const sales = useQuery((r) => r.listPackageSales(), []);
  const svcs = useQuery((r) => r.listServices(), []);
  const repo = useRepo(); const toast = useToast();
  const [edit, setEdit] = useState<ServicePackage | 'novo' | null>(null);
  if (pk.loading) return <Spinner />;
  const active = (sales.data ?? []).filter((s) => s.status === 'ativo');
  const revenue = (sales.data ?? []).reduce((a, s) => a + s.priceCents, 0);
  return (
    <div>
      <PageHead title="Pacotes" sub="Venda sessões antecipadas com desconto. O saldo de cada cliente baixa sozinho a cada agendamento." actions={<button className="btn btn-primary btn-sm" onClick={() => setEdit('novo')}><Plus size={16} />Novo pacote</button>} />
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="card p-4"><div className="text-sm text-muted">Pacotes à venda</div><div className="font-display text-2xl font-extrabold tabular">{pk.data?.filter((k) => k.active).length}</div></div>
        <div className="card p-4"><div className="text-sm text-muted">Clientes com saldo</div><div className="font-display text-2xl font-extrabold tabular">{active.length}</div></div>
        <div className="card p-4"><div className="text-sm text-muted">Vendido (histórico)</div><div className="font-display text-2xl font-extrabold tabular">{formatBRL(revenue)}</div></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {pk.data?.map((k) => {
          const svc = svcs.data?.find((s) => s.id === k.serviceId);
          return (
            <div key={k.id} className={cx('card flex flex-col p-5', !k.active && 'opacity-60')}>
              <div className="flex items-start gap-2"><Package className="text-brand" /><b className="flex-1">{k.name}</b>{k.popular && <span className="chip bg-ball text-ball-ink">destaque</span>}</div>
              <p className="mt-1 text-sm text-muted">{k.description}</p>
              <div className="mt-3 flex items-baseline gap-2"><span className="font-display text-2xl font-extrabold tabular">{formatBRL(k.priceCents)}</span><s className="text-sm text-muted">{formatBRL(k.fullPriceCents)}</s><span className="chip ml-auto text-ok">−{Math.round((1 - k.priceCents / k.fullPriceCents) * 100)}%</span></div>
              <div className="text-xs text-muted">{k.sessions}× {svc?.name ?? 'serviço'} · validade {k.validityDays} dias · {k.soldCount} vendidos</div>
              <div className="mt-3 flex gap-2"><button className="btn btn-outline btn-sm flex-1" onClick={() => setEdit(k)}><Pencil size={14} />Editar</button><button className="btn btn-ghost btn-sm text-danger" aria-label="Excluir pacote" onClick={async () => { try { await repo.deletePackage(k.id); toast('Pacote excluído'); } catch (e) { toast(errorMessage(e), 'erro'); } }}><Trash2 size={15} /></button></div>
            </div>
          );
        })}
      </div>
      <h2 className="mb-3 mt-8 text-lg font-bold">Saldos dos clientes</h2>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="p-3">Cliente</th><th className="p-3">Pacote</th><th className="p-3">Saldo</th><th className="p-3">Validade</th><th className="p-3 text-right">Valor</th></tr></thead>
          <tbody>
            {sales.data?.map((s) => (
              <tr key={s.id} className="border-b border-line last:border-0">
                <td className="p-3 font-semibold">{s.customer.name}</td><td className="p-3">{s.pkg.name}</td>
                <td className="p-3"><div className="flex items-center gap-2"><div className="h-2 w-20 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-brand" style={{ width: `${(s.sessionsUsed / s.sessionsTotal) * 100}%` }} /></div><span className="tabular">{s.sessionsTotal - s.sessionsUsed}/{s.sessionsTotal}</span></div></td>
                <td className={cx('p-3', s.status !== 'ativo' && 'text-muted')}>{s.status === 'ativo' ? relTime(s.expiresAt) : s.status}</td>
                <td className="p-3 text-right tabular">{formatBRL(s.priceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && <PackageForm pkg={edit === 'novo' ? undefined : edit} services={svcs.data ?? []} onClose={() => setEdit(null)} />}
    </div>
  );
}

function PackageForm({ pkg, services, onClose }: { pkg?: ServicePackage; services: Service[]; onClose: () => void }) {
  const repo = useRepo(); const toast = useToast();
  const [f, setF] = useState({ serviceId: pkg?.serviceId ?? services[0]?.id ?? '', name: pkg?.name ?? '', description: pkg?.description ?? '', sessions: pkg?.sessions ?? 10, price: pkg ? fromCents(pkg.priceCents) : '', validityDays: pkg?.validityDays ?? 60, active: pkg?.active ?? true, popular: pkg?.popular ?? false });
  const [err, setErr] = useState<unknown>(null);
  const svc = services.find((s) => s.id === f.serviceId);
  const full = (svc?.priceCents ?? 0) * f.sessions; const cents = toCents(f.price || '0');
  return (
    <Modal open onClose={onClose} title={pkg ? 'Editar pacote' : 'Novo pacote'} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={async () => { setErr(null); try { await repo.savePackage({ id: pkg?.id, serviceId: f.serviceId, name: f.name.trim(), description: f.description.trim(), sessions: f.sessions, priceCents: cents, validityDays: f.validityDays, active: f.active, popular: f.popular }); toast('Pacote salvo'); onClose(); } catch (e) { setErr(e); } }}>Salvar</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label" htmlFor="p-svc">Serviço incluído</label><select id="p-svc" className="input" value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value })}>{services.map((s) => <option key={s.id} value={s.id}>{s.name} ({formatBRL(s.priceCents)})</option>)}</select></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="p-name">Nome do pacote</label><input id="p-name" className="input" maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="10 passeios de 60 min" /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="p-desc">Descrição</label><input id="p-desc" className="input" maxLength={200} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div><label className="label" htmlFor="p-ses">Sessões</label><input id="p-ses" type="number" min={2} max={60} className="input" value={f.sessions} onChange={(e) => setF({ ...f, sessions: Number(e.target.value) })} /></div>
        <div><label className="label" htmlFor="p-val">Validade (dias)</label><input id="p-val" type="number" min={7} max={365} className="input" value={f.validityDays} onChange={(e) => setF({ ...f, validityDays: Number(e.target.value) })} /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="p-price">Preço do pacote (R$)</label><input id="p-price" className="input tabular" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^\d,.]/g, '') })} />
          <p className="mt-1 text-xs text-muted">Avulso: {formatBRL(full)}{cents > 0 && full > 0 ? ` · desconto de ${Math.round((1 - cents / full) * 100)}%` : ''} · sugestão 15% off: {formatBRL(Math.round(full * 0.85))}</p></div>
        <div className="sm:col-span-2"><Toggle id="p-act" checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="À venda" /><Toggle id="p-pop" checked={f.popular} onChange={(v) => setF({ ...f, popular: v })} label="Destacar como “mais vendido”" /></div>
        {err ? <div className="sm:col-span-2"><ErrorBox error={errorMessage(err)} /></div> : null}
      </div>
    </Modal>
  );
}
