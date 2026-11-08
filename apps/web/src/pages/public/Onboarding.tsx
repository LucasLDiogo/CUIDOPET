import { useState } from 'react';
import { useNavigate } from 'react-router';
import { BadgeCheck, CalendarCheck, Check, MessageCircle, Package, Star, Users } from 'lucide-react';
import { errorMessage, useRepo } from '../../lib/repo';
import { CATEGORIES, CITIES } from '../../data/demo/catalog';
import { CategoryIcon } from '../../components/CategoryIcon';
import { ErrorBox, useToast } from '../../components/ui';
import { cx } from '../../lib/format';
import type { CategoryId, PlanCode, Provider } from '../../domain/types';
import { IMG } from '../../lib/media';

const PLANS: { code: PlanCode; name: string; price: string; items: string[]; hi?: boolean }[] = [
  { code: 'essencial', name: 'Essencial', price: 'Grátis', items: ['Perfil público com avaliações', 'Até 2 serviços', 'Pedidos de agendamento', 'Botão do WhatsApp no perfil'] },
  { code: 'profissional', name: 'Profissional', price: 'R$ 39,90/mês', hi: true, items: ['Tudo do Essencial', 'Até 10 serviços e pacotes', 'CRM do WhatsApp com confirmação automática', 'Lembretes e pedido de avaliação', 'Relatórios do painel'] },
  { code: 'pro', name: 'Pro Regional', price: 'R$ 79,90/mês', items: ['Tudo do Profissional', 'Selo Destaque na sua cidade (sem alterar a nota)', 'Alerta de clientes sumidos e vagas livres', 'Equipe com vários atendentes'] },
];

export function Onboarding() {
  const repo = useRepo(); const nav = useNavigate(); const toast = useToast();
  const [f, setF] = useState({ name: '', kind: 'autonomo' as Provider['kind'], categories: [] as CategoryId[], cityId: 'passo-fundo-rs', neighborhood: 'Centro', phone: '', email: '', plan: 'profissional' as PlanCode, accept: false });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null);
  const city = CITIES.find((c) => c.id === f.cityId)!;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await repo.registerProvider(f); toast('Cadastro criado! Complete seu perfil e cadastre os serviços.'); nav('/painel/servicos'); }
    catch (x) { setErr(x); } finally { setBusy(false); }
  };
  return (
    <div>
      <section className="gutter relative overflow-hidden bg-[#1838cc] text-white">
        <div className="dots pointer-events-none absolute inset-0 opacity-20" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-7xl gap-8 py-12 lg:grid-cols-2 lg:py-16">
          <div>
            {IMG.prestador && <img src={IMG.prestador} alt="" className="mb-6 h-40 w-full rounded-[28px] object-cover shadow-lift sm:h-56" />}
            <span className="chip bg-ball text-ball-ink">Para passeadores, pet sitters, pet houses e pet shops</span>
            <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">Mais clientes, menos tempo respondendo WhatsApp</h1>
            <p className="mt-4 max-w-lg text-lg opacity-90">Seu perfil aparece para tutores do seu bairro. Os pedidos chegam organizados e a confirmação sai sozinha no WhatsApp.</p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {[[CalendarCheck, 'Agenda com capacidade por serviço'], [MessageCircle, 'CRM do WhatsApp com status'], [Package, 'Pacotes com saldo por cliente'], [Star, 'Avaliações verificadas'], [Users, 'Ficha de clientes e pets'], [BadgeCheck, 'Selo de identidade verificada']].map(([I, t]) => {
                const Icon = I as typeof Star; return <li key={t as string} className="flex items-center gap-2"><Icon size={18} className="text-ball" />{t as string}</li>;
              })}
            </ul>
          </div>
          <form onSubmit={submit} className="card space-y-4 p-6 text-ink shadow-card">
            <h2 className="text-xl font-bold">Comece em 2 minutos</h2>
            <div><label className="label" htmlFor="o-name">Nome do negócio ou seu nome profissional</label><input id="o-name" className="input" required minLength={2} maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Patas Felizes Pet House" /></div>
            <div className="flex gap-2">{([['autonomo', 'Autônomo(a)'], ['empresa', 'Empresa / loja']] as const).map(([k, l]) => <button type="button" key={k} onClick={() => setF({ ...f, kind: k })} className={cx('chip flex-1 justify-center py-2 text-sm', f.kind === k ? 'bg-brand text-brand-ink' : '')}>{l}</button>)}</div>
            <fieldset><legend className="label">O que você oferece?</legend>
              <div className="grid grid-cols-2 gap-1.5">
                {CATEGORIES.map((c) => { const on = f.categories.includes(c.id); return (
                  <button type="button" key={c.id} aria-pressed={on} onClick={() => setF({ ...f, categories: on ? f.categories.filter((x) => x !== c.id) : [...f.categories, c.id] })} className={cx('flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm', on ? 'border-brand bg-[color-mix(in_oklab,var(--brand)_10%,transparent)] font-semibold' : 'border-line')}>
                    <CategoryIcon id={c.id} size={16} className="text-brand" />{c.label}{on && <Check size={14} className="ml-auto text-brand" />}
                  </button>); })}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label" htmlFor="o-city">Cidade</label><select id="o-city" className="input" value={f.cityId} onChange={(e) => setF({ ...f, cityId: e.target.value, neighborhood: CITIES.find((c) => c.id === e.target.value)!.neighborhoods[0] })}>{CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}/{c.uf}</option>)}</select></div>
              <div><label className="label" htmlFor="o-hood">Bairro</label><select id="o-hood" className="input" value={f.neighborhood} onChange={(e) => setF({ ...f, neighborhood: e.target.value })}>{city.neighborhoods.map((n) => <option key={n}>{n}</option>)}</select></div>
              <div><label className="label" htmlFor="o-phone">WhatsApp do negócio</label><input id="o-phone" className="input" required inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="(54) 99999-0000" /></div>
              <div><label className="label" htmlFor="o-email">E-mail</label><input id="o-email" className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            </div>
            <label className="flex gap-2 text-sm"><input type="checkbox" required className="mt-0.5 h-4 w-4 accent-[var(--brand)]" checked={f.accept} onChange={(e) => setF({ ...f, accept: e.target.checked })} />Declaro ter 18 anos ou mais e aceito os Termos do prestador. Meu perfil passa por revisão antes de aparecer na busca.</label>
            {err ? <ErrorBox error={errorMessage(err)} /> : null}
            <button className="btn btn-ball w-full" disabled={busy || !f.accept}>{busy ? 'Criando…' : 'Criar meu perfil'}</button>
          </form>
        </div>
      </section>
      <section id="planos" className="gutter mx-auto max-w-7xl py-14">
        <h2 className="text-3xl font-extrabold">Planos</h2>
        <p className="mt-1 text-muted">Sem fidelidade. A nota e a posição por avaliação não dependem do plano.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => (
            <button type="button" key={p.code} onClick={() => setF({ ...f, plan: p.code })} className={cx('card relative p-6 text-left', f.plan === p.code ? 'border-brand ring-2 ring-brand' : '')}>
              {p.hi && <span className="chip absolute -top-2.5 left-5 bg-ball text-ball-ink">Mais escolhido</span>}
              <div className="text-lg font-bold">{p.name}</div>
              <div className="mt-1 font-display text-3xl font-extrabold">{p.price}</div>
              <ul className="mt-4 space-y-2 text-sm">{p.items.map((i) => <li key={i} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-brand" />{i}</li>)}</ul>
              <div className={cx('mt-5 text-sm font-semibold', f.plan === p.code ? 'text-brand' : 'text-muted')}>{f.plan === p.code ? 'Selecionado' : 'Selecionar'}</div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">Valores ilustrativos da demonstração. Cobrança real depende de contrato com o meio de pagamento.</p>
      </section>
    </div>
  );
}
