import { useState } from 'react';
import { MessageSquareReply } from 'lucide-react';
import { errorMessage, useQuery, useRepo } from '../../lib/repo';
import { PageHead } from '../../components/ProviderLayout';
import { Avatar, Segmented, Spinner, Stars, useToast } from '../../components/ui';
import { relTime } from '../../lib/format';

export function ReviewsPage() {
  const { data, loading } = useQuery((r) => r.listProviderReviews(), []);
  const me = useQuery((r) => r.getMyProvider(), []);
  const repo = useRepo(); const toast = useToast();
  const [seg, setSeg] = useState<'sem' | 'todas' | 'baixas'>('sem');
  const [draft, setDraft] = useState<Record<string, string>>({});
  if (loading) return <Spinner />;
  const all = data ?? [];
  const list = all.filter((r) => seg === 'todas' || (seg === 'sem' ? !r.reply : r.rating <= 3));
  return (
    <div>
      <PageHead title="Avaliações" sub="Responda publicamente — tutores leem as respostas antes de contratar." />
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2"><span className="font-display text-4xl font-extrabold tabular">{me.data?.rating?.toFixed(2).replace('.', ',') ?? '—'}</span><div><Stars value={me.data?.rating ?? 0} /><div className="text-xs text-muted">{all.length} avaliações</div></div></div>
        <Segmented value={seg} onChange={setSeg} options={[{ value: 'sem', label: `Sem resposta (${all.filter((r) => !r.reply).length})` }, { value: 'baixas', label: '3★ ou menos' }, { value: 'todas', label: 'Todas' }]} />
      </div>
      <ul className="space-y-3">
        {list.slice(0, 40).map((r) => (
          <li key={r.id} className="card p-4">
            <div className="flex items-start gap-3">
              <Avatar name={r.authorName} seed={r.authorName.length * 5} size={38} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><b>{r.authorName}</b><Stars value={r.rating} /><span className="text-xs text-muted">{r.petName} · {r.serviceName} · {relTime(r.createdAt)}</span></div>
                <p className="mt-1">{r.text}</p>
                <div className="mt-1 flex gap-3 text-xs text-muted"><span>Pontualidade {r.aspects.pontualidade}</span><span>Cuidado {r.aspects.cuidado}</span><span>Comunicação {r.aspects.comunicacao}</span></div>
                {r.reply ? <div className="mt-3 rounded-xl border-l-4 border-brand bg-surface-2 px-3 py-2 text-sm"><b className="text-xs">Sua resposta · {relTime(r.reply.createdAt)}</b><br />{r.reply.text}</div> : (
                  <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); try { await repo.replyReview(r.id, draft[r.id] ?? ''); toast('Resposta publicada'); } catch (x) { toast(errorMessage(x), 'erro'); } }}>
                    <input className="input text-sm" maxLength={600} placeholder={`Responder a ${r.authorName.split(' ')[0]}…`} value={draft[r.id] ?? ''} onChange={(e) => setDraft({ ...draft, [r.id]: e.target.value })} aria-label="Resposta" />
                    <button className="btn btn-primary btn-sm"><MessageSquareReply size={15} />Publicar</button>
                  </form>
                )}
              </div>
            </div>
          </li>
        ))}
        {!list.length && <li className="py-10 text-center text-muted">Tudo respondido por aqui. 👏</li>}
      </ul>
    </div>
  );
}
