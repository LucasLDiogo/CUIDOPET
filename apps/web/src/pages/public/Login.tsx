import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { HandHeart, Mail, PawPrint } from 'lucide-react';
import { BACKEND, errorMessage, useRepo } from '../../lib/repo';
import { ErrorBox, Logo, useToast } from '../../components/ui';

export function LoginPage() {
  const repo = useRepo(); const nav = useNavigate(); const [sp] = useSearchParams(); const toast = useToast();
  const [email, setEmail] = useState(''); const [msg, setMsg] = useState(''); const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const next = sp.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null; // evita redirecionamento aberto
  const demo = async (role: 'tutor' | 'prestador') => {
    setBusy(true); setErr(null);
    try { await repo.signInDemo(role); toast(role === 'tutor' ? 'Bem-vinda, Ana!' : 'Bem-vinda, Carla!'); nav(safeNext ?? (role === 'tutor' ? '/conta' : '/painel')); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const byEmail = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null); setMsg('');
    try { const r = await repo.signInWithEmail(email.trim()); setMsg(r.message); } catch (x) { setErr(x); } finally { setBusy(false); }
  };
  return (
    <div className="gutter mx-auto grid max-w-5xl gap-10 py-12 lg:grid-cols-2">
      <div>
        <Logo />
        <h1 className="mt-6 text-4xl font-extrabold">Entrar</h1>
        <p className="mt-2 text-muted">Uma conta só para agendar como tutor ou gerenciar seu negócio como prestador.</p>
        {(BACKEND === 'demo' || import.meta.env.VITE_DEMO_LOGIN === 'true') && (
          <div className="mt-6 space-y-3">
            <div className="eyebrow">Acesso de demonstração</div>
            <button disabled={busy} onClick={() => demo('tutor')} className="card flex w-full items-center gap-4 p-4 text-left transition hover:border-brand">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ball text-ball-ink"><PawPrint /></span>
              <span><b className="block">Entrar como tutora (Ana)</b><span className="text-sm text-muted">Tem o Thor (golden) e a Mia (gata). Agendamentos, pacotes e avaliações.</span></span>
            </button>
            <button disabled={busy} onClick={() => demo('prestador')} className="card flex w-full items-center gap-4 p-4 text-left transition hover:border-brand">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand text-brand-ink"><HandHeart /></span>
              <span><b className="block">Entrar como prestadora (Carla Pet House)</b><span className="text-sm text-muted">Painel com agenda, CRM do WhatsApp, pacotes, clientes e avaliações.</span></span>
            </button>
          </div>
        )}
      </div>
      <form onSubmit={byEmail} className="card h-fit space-y-4 p-6">
        <h2 className="text-xl font-bold">Entrar com e-mail</h2>
        <p className="text-sm text-muted">Enviamos um link de acesso. Sem senha para lembrar.</p>
        <div><label className="label" htmlFor="l-email">E-mail</label><input id="l-email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com.br" /></div>
        <button className="btn btn-primary w-full" disabled={busy}><Mail size={16} />Enviar link de acesso</button>
        {msg && <p role="status" className="rounded-xl bg-surface-2 p-3 text-sm">{msg}</p>}
        {err ? <ErrorBox error={errorMessage(err)} /> : null}
        <p className="text-xs text-muted">Ao continuar você concorda com os <Link to="/termos" className="underline">Termos</Link> e a <Link to="/privacidade" className="underline">Política de Privacidade</Link>.</p>
        <p className="border-t border-line pt-4 text-sm">Quer divulgar seus serviços? <Link to="/anunciar" className="font-semibold text-brand">Cadastre seu negócio</Link></p>
      </form>
    </div>
  );
}
