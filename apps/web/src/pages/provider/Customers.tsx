import { useState } from 'react';
import { Link } from 'react-router';
import { MessageCircle, Search } from 'lucide-react';
import { useQuery } from '../../lib/repo';
import { PageHead } from '../../components/ProviderLayout';
import { Avatar, PetAvatar, Segmented, Spinner } from '../../components/ui';
import { cx, formatBRL, formatPhone, relTime } from '../../lib/format';

export function CustomersPage() {
  const { data, loading } = useQuery((r) => r.listCustomers(), []);
  const [q, setQ] = useState(''); const [seg, setSeg] = useState<'todos' | 'pacote' | 'sumidos' | 'top'>('todos');
  if (loading) return <Spinner />;
  const now = Date.now();
  let rows = (data ?? []).filter((r) => !q || `${r.customer.name} ${r.pets.map((p) => p.name).join(' ')} ${r.customer.neighborhood}`.toLowerCase().includes(q.toLowerCase()));
  if (seg === 'pacote') rows = rows.filter((r) => r.activePackages.length);
  if (seg === 'sumidos') rows = rows.filter((r) => r.lastVisit && now - Date.parse(r.lastVisit) > 30 * 86400000);
  if (seg === 'top') rows = rows.slice(0, 10);
  return (
    <div>
      <PageHead title="Clientes" sub={`${data?.length ?? 0} tutores atendidos ou em conversa`} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input pl-9" placeholder="Nome do tutor, pet ou bairro" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar cliente" /></div>
        <Segmented value={seg} onChange={setSeg} options={[{ value: 'todos', label: 'Todos' }, { value: 'pacote', label: 'Com pacote' }, { value: 'sumidos', label: 'Sumidos' }, { value: 'top', label: 'Top 10' }]} />
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="p-3">Tutor</th><th className="p-3">Pets</th><th className="p-3">Agend.</th><th className="p-3">Última visita</th><th className="p-3">Pacote</th><th className="p-3 text-right">Total</th><th className="p-3" /></tr></thead>
          <tbody>
            {rows.map((r) => {
              const away = r.lastVisit ? (now - Date.parse(r.lastVisit)) / 86400000 : 0;
              return (
                <tr key={r.customer.id} className="border-b border-line last:border-0">
                  <td className="p-3"><div className="flex items-center gap-2"><Avatar name={r.customer.name} seed={r.customer.name.length * 3} size={34} /><div><b>{r.customer.name}</b><div className="text-xs tabular text-muted">{formatPhone(r.customer.phone)} · {r.customer.neighborhood}</div></div></div></td>
                  <td className="p-3"><div className="flex items-center gap-1">{r.pets.map((p) => <span key={p.id} className="inline-flex items-center gap-1"><PetAvatar species={p.species} seed={p.avatarSeed} size={24} />{p.name}</span>)}</div></td>
                  <td className="p-3 tabular">{r.bookings}</td>
                  <td className={cx('p-3', away > 30 && 'font-semibold text-warn')}>{r.lastVisit ? relTime(r.lastVisit) : '—'}</td>
                  <td className="p-3">{r.activePackages[0] ? <span className="chip bg-ball/50">{r.activePackages[0].sessionsTotal - r.activePackages[0].sessionsUsed} restantes</span> : <span className="text-muted">—</span>}</td>
                  <td className="p-3 text-right font-semibold tabular">{formatBRL(r.totalSpentCents)}</td>
                  <td className="p-3 text-right"><Link to={`/painel/whatsapp?cliente=${r.customer.id}`} className="btn btn-ghost btn-sm text-wa" aria-label={`Conversar com ${r.customer.name}`}><MessageCircle size={16} /></Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">Dados pessoais visíveis apenas para você e sua equipe. Exportação e exclusão a pedido do tutor seguem a LGPD.</p>
    </div>
  );
}
