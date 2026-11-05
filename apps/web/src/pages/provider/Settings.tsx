import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, ExternalLink, KeyRound, Lock, Plus, ShieldCheck, X } from 'lucide-react';
import { errorMessage, useQuery, useRepo } from '../../lib/repo';
import { PageHead } from '../../components/ProviderLayout';
import { ErrorBox, Spinner, Toggle, useToast } from '../../components/ui';
import { CITIES, POLICY_LABEL, SIZE_SHORT } from '../../data/demo/catalog';
import { formatPhone } from '../../domain/rules';
import { cx } from '../../lib/format';
import type { OpeningHour, PetSize, Provider, ProviderSettings, Species } from '../../domain/types';

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function ProfileSettings() {
  const me = useQuery((r) => r.getMyProvider(), [], { live: false });
  const repo = useRepo(); const toast = useToast();
  const [f, setF] = useState<Provider | null>(null); const [err, setErr] = useState<unknown>(null); const [am, setAm] = useState('');
  useEffect(() => { if (me.data) setF(me.data); }, [me.data]);
  if (!f) return <Spinner />;
  const city = CITIES.find((c) => c.id === f.cityId);
  const setHour = (day: number, patch: Partial<OpeningHour> | null) => {
    const others = f.openingHours.filter((h) => h.day !== day);
    const cur = f.openingHours.find((h) => h.day === day) ?? { day: day as OpeningHour['day'], open: '08:00', close: '18:00' };
    setF({ ...f, openingHours: patch === null ? others : [...others, { ...cur, ...patch }].sort((a, b) => a.day - b.day) });
  };
  const save = async () => {
    setErr(null);
    try { await repo.updateMyProvider({ name: f.name, tagline: f.tagline, bio: f.bio, neighborhood: f.neighborhood, amenities: f.amenities, openingHours: f.openingHours, whatsappOptIn: f.whatsappOptIn, cancellationPolicy: f.cancellationPolicy, species: f.species, sizes: f.sizes }); toast('Perfil atualizado'); }
    catch (e) { setErr(e); }
  };
  return (
    <div>
      <PageHead title="Perfil público" sub="É o que o tutor vê antes de agendar." actions={<><Link to={`/p/${f.slug}`} className="btn btn-outline btn-sm"><ExternalLink size={15} />Ver como tutor</Link><button className="btn btn-primary btn-sm" onClick={save}>Salvar alterações</button></>} />
      {err ? <div className="mb-4"><ErrorBox error={errorMessage(err)} /></div> : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card space-y-3 p-5">
          <h2 className="font-bold">Apresentação</h2>
          <div><label className="label" htmlFor="pp-name">Nome público</label><input id="pp-name" className="input" maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><label className="label" htmlFor="pp-tag">Frase de destaque</label><input id="pp-tag" className="input" maxLength={90} value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} /></div>
          <div><label className="label" htmlFor="pp-bio">Sobre você / seu espaço</label><textarea id="pp-bio" className="input min-h-36" maxLength={1200} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /><div className="text-right text-xs text-muted">{f.bio.length}/1200 · não inclua telefone ou endereço aqui</div></div>
          <div className="grid grid-cols-2 gap-3">
            <div><span className="label">Cidade</span><div className="input bg-surface-2">{city?.name}/{city?.uf}</div></div>
            <div><label className="label" htmlFor="pp-hood">Bairro (aparece na busca)</label><select id="pp-hood" className="input" value={f.neighborhood} onChange={(e) => setF({ ...f, neighborhood: e.target.value })}>{city?.neighborhoods.map((n) => <option key={n}>{n}</option>)}</select></div>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted"><Lock size={12} />O endereço exato nunca é publicado. Na busca usamos só o bairro.</p>
        </section>
        <section className="card space-y-4 p-5">
          <h2 className="font-bold">Quem você atende</h2>
          <div className="flex gap-1.5">{(['cao', 'gato'] as Species[]).map((s) => <button key={s} onClick={() => setF({ ...f, species: f.species.includes(s) ? f.species.filter((x) => x !== s) : [...f.species, s] })} className={cx('chip px-3 py-1.5', f.species.includes(s) && 'bg-brand text-brand-ink')}>{s === 'cao' ? 'Cães' : 'Gatos'}</button>)}</div>
          <div className="flex flex-wrap gap-1.5">{(Object.keys(SIZE_SHORT) as PetSize[]).map((s) => <button key={s} onClick={() => setF({ ...f, sizes: f.sizes.includes(s) ? f.sizes.filter((x) => x !== s) : [...f.sizes, s] })} className={cx('chip px-3 py-1.5', f.sizes.includes(s) && 'bg-brand text-brand-ink')}>{SIZE_SHORT[s]}</button>)}</div>
          <div><label className="label" htmlFor="pp-pol">Política de cancelamento</label><select id="pp-pol" className="input" value={f.cancellationPolicy} onChange={(e) => setF({ ...f, cancellationPolicy: e.target.value as Provider['cancellationPolicy'] })}>{Object.entries(POLICY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <Toggle id="pp-wa" checked={f.whatsappOptIn} onChange={(v) => setF({ ...f, whatsappOptIn: v })} label="Mostrar meu WhatsApp no perfil" description="Se desligado, o tutor fala com você só pelo agendamento (recomendado para quem prefere filtrar curiosos)." />
          <div>
            <span className="label">Diferenciais</span>
            <div className="flex flex-wrap gap-1.5">{f.amenities.map((a) => <button key={a} className="chip hover:bg-surface-3" onClick={() => setF({ ...f, amenities: f.amenities.filter((x) => x !== a) })}>{a}<X size={11} /></button>)}</div>
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (am.trim()) { setF({ ...f, amenities: [...f.amenities, am.trim().slice(0, 40)] }); setAm(''); } }}><input className="input text-sm" value={am} onChange={(e) => setAm(e.target.value)} placeholder="Ex.: Quintal telado" aria-label="Novo diferencial" /><button className="btn btn-outline btn-sm"><Plus size={15} /></button></form>
          </div>
        </section>
        <section className="card p-5 xl:col-span-2">
          <h2 className="font-bold">Horário de atendimento</h2>
          <p className="text-sm text-muted">Define os horários que aparecem para agendamento.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {DAYS.map((d, i) => {
              const h = f.openingHours.find((x) => x.day === i);
              return (
                <div key={d} className={cx('rounded-xl border border-line p-3', !h && 'opacity-60')}>
                  <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={!!h} onChange={(e) => setHour(i, e.target.checked ? {} : null)} />{d}</label>
                  {h && <div className="mt-2 flex items-center gap-1"><input type="time" className="input py-1 text-sm" value={h.open} onChange={(e) => setHour(i, { open: e.target.value })} aria-label={`${d} abre`} /><span>–</span><input type="time" className="input py-1 text-sm" value={h.close} onChange={(e) => setHour(i, { close: e.target.value })} aria-label={`${d} fecha`} /></div>}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

export function WhatsAppSettings() {
  const s = useQuery((r) => r.getSettings(), [], { live: false });
  const tpls = useQuery((r) => r.listTemplates(), []);
  const repo = useRepo(); const toast = useToast();
  const [f, setF] = useState<ProviderSettings | null>(null); const [err, setErr] = useState<unknown>(null);
  useEffect(() => { if (s.data) setF(s.data); }, [s.data]);
  if (!f) return <Spinner />;
  const save = async (patch: Partial<ProviderSettings>) => { const next = { ...f, ...patch }; setF(next); setErr(null); try { await repo.saveSettings(patch); toast('Configuração salva'); } catch (e) { setErr(e); } };
  return (
    <div>
      <PageHead title="Automação do WhatsApp" sub="O que sai sozinho para o tutor e em que momento." />
      {err ? <div className="mb-4"><ErrorBox error={errorMessage(err)} /></div> : null}
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <section className="card divide-y divide-line px-5">
            <Toggle id="a-conf" checked={f.autoConfirmationRequest} onChange={(v) => save({ autoConfirmationRequest: v })} label="Pedir confirmação ao aceitar um pedido" description="Envia o modelo “confirmacao_agendamento” com os botões Confirmar · Remarcar · Cancelar. A vaga fica reservada até a resposta." />
            <Toggle id="a-24" checked={f.reminder24h} onChange={(v) => save({ reminder24h: v })} label="Lembrete 24 h antes" description="Reduz faltas. Se o tutor responder “Preciso remarcar”, a conversa volta para Aguardando atendimento." />
            <Toggle id="a-2h" checked={f.reminder2h} onChange={(v) => save({ reminder2h: v })} label="Lembrete 2 h antes" />
            <Toggle id="a-rev" checked={f.postServiceReview} onChange={(v) => save({ postServiceReview: v })} label="Pedir avaliação ao concluir" description="Só tutores com atendimento concluído conseguem avaliar." />
            <Toggle id="a-out" checked={f.autoReplyOutsideHours} onChange={(v) => save({ autoReplyOutsideHours: v })} label="Resposta automática fora do horário" description="Avisa que você responde no próximo horário de atendimento." />
            <Toggle id="a-inst" checked={f.instantBooking} onChange={(v) => save({ instantBooking: v })} label="Agenda instantânea" description="Pedidos em horário livre são confirmados sem sua aprovação." />
            <div className="grid gap-3 py-4 sm:grid-cols-2">
              <div><label className="label" htmlFor="a-sla">Prazo de 1ª resposta (SLA)</label><select id="a-sla" className="input" value={f.firstResponseSlaMin} onChange={(e) => save({ firstResponseSlaMin: Number(e.target.value) })}>{[5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m} minutos</option>)}</select></div>
              <div><label className="label" htmlFor="a-react">Cliente “sumido” depois de</label><select id="a-react" className="input" value={f.reactivationDays} onChange={(e) => save({ reactivationDays: Number(e.target.value) })}>{[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} dias sem visita</option>)}</select></div>
            </div>
          </section>
          <section className="card p-5">
            <h2 className="font-bold">Modelos de mensagem</h2>
            <p className="text-sm text-muted">Fora da janela de 24 h, o WhatsApp só permite modelos aprovados pela Meta. Ofertas (“marketing”) só vão para quem aceitou.</p>
            <ul className="mt-3 divide-y divide-line">
              {tpls.data?.map((t) => (
                <li key={t.id} className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1"><b className="text-sm">{t.title}</b> <code className="text-xs text-muted">{t.name}</code><p className="mt-0.5 text-sm text-muted">{t.body}</p></div>
                  <span className={cx('chip', t.approved ? 'text-ok' : 'text-warn')}>{t.approved ? 'Aprovado' : 'Em análise'}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="font-bold">Conexão</h2>
            <div className={cx('mt-3 flex items-center gap-3 rounded-2xl p-3', f.waConnected ? 'bg-[color-mix(in_oklab,var(--ok)_12%,transparent)]' : 'bg-surface-2')}>
              <CheckCircle2 className={f.waConnected ? 'text-ok' : 'text-muted'} />
              <div><b>{f.waConnected ? 'Número conectado' : 'Não conectado'}</b><div className="text-sm tabular text-muted">{f.waNumber ? formatPhone(f.waNumber) : 'sem número'}</div></div>
            </div>
            <div className="mt-3"><label className="label" htmlFor="a-num">Número do WhatsApp Business</label><input id="a-num" className="input" defaultValue={f.waNumber ? formatPhone(f.waNumber) : ''} onBlur={(e) => e.target.value && save({ waNumber: e.target.value })} /></div>
            <div className="mt-3"><label className="label" htmlFor="a-prov">Provedor</label>
              <select id="a-prov" className="input" value={f.waProvider} onChange={(e) => save({ waProvider: e.target.value as ProviderSettings['waProvider'], waConnected: e.target.value !== 'desconectado' })}>
                <option value="cloud_api">WhatsApp Cloud API (oficial Meta) — recomendado</option>
                <option value="z_api">Z-API (parceiro BR)</option>
                <option value="evolution">Evolution API (não oficial — só testes)</option>
                <option value="desconectado">Desconectado</option>
              </select>
            </div>
            {f.waProvider === 'evolution' && <p className="mt-2 rounded-xl bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] p-2 text-xs text-danger">Conexões não oficiais podem ter o número banido. Use só para testes.</p>}
          </section>
          <section className="card space-y-2 p-5 text-sm">
            <h2 className="flex items-center gap-2 font-bold"><ShieldCheck size={18} className="text-brand" />Como a integração é protegida</h2>
            <p className="flex gap-2"><KeyRound size={15} className="mt-0.5 shrink-0 text-muted" />O token da Meta fica só no servidor (Supabase Edge Function), nunca no navegador.</p>
            <p className="flex gap-2"><KeyRound size={15} className="mt-0.5 shrink-0 text-muted" />Mensagens recebidas só são aceitas com assinatura válida (X-Hub-Signature-256) e são deduplicadas.</p>
            <p className="flex gap-2"><KeyRound size={15} className="mt-0.5 shrink-0 text-muted" />O tutor autoriza o WhatsApp no agendamento; ofertas exigem um aceite separado e “parar” cancela na hora.</p>
            <p className="text-xs text-muted">Passo a passo técnico em <code>docs/backend-supabase-firebase.md</code>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
