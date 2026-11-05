import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Repository } from '../data/repository';
import { AppError } from '../data/repository';
import type { Session } from '../domain/types';
import { createDemoRepository } from '../data/demoAdapter';

export type Backend = 'demo' | 'supabase' | 'firebase';
export const BACKEND: Backend = ((import.meta.env.VITE_DATA_BACKEND as string | undefined) ?? 'demo') as Backend;

export async function createRepository(): Promise<Repository> {
  // no build "single" (link de demonstração) só existe o adaptador demo; os SDKs nem entram no pacote
  if (import.meta.env.MODE !== 'single') {
    if (BACKEND === 'supabase') return (await import('../data/supabaseAdapter')).createSupabaseRepository();
    if (BACKEND === 'firebase') return (await import('../data/firebaseAdapter')).createFirebaseRepository();
  }
  return createDemoRepository();
}

const RepoCtx = createContext<Repository | null>(null);
const SessionCtx = createContext<{ session: Session | null; ready: boolean; refresh: () => Promise<void> }>({ session: null, ready: false, refresh: async () => {} });

export function RepoProvider({ repo, children }: { repo: Repository; children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => { try { setSession(await repo.getSession()); } finally { setReady(true); } }, [repo]);
  useEffect(() => { refresh(); return repo.subscribe(() => { repo.getSession().then(setSession).catch(() => {}); }); }, [repo, refresh]);
  return (
    <RepoCtx.Provider value={repo}>
      <SessionCtx.Provider value={{ session, ready, refresh }}>{children}</SessionCtx.Provider>
    </RepoCtx.Provider>
  );
}

export function useRepo() { const r = useContext(RepoCtx); if (!r) throw new Error('RepoProvider ausente'); return r; }
export function useSession() { return useContext(SessionCtx); }

/** Busca assíncrona que recarrega sozinha quando o repositório avisa de mudanças. */
export function useQuery<T>(fn: (repo: Repository) => Promise<T>, deps: unknown[] = [], opts: { live?: boolean } = { live: true }) {
  const repo = useRepo();
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn); fnRef.current = fn;
  useEffect(() => {
    if (opts.live === false) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = repo.subscribe(() => { clearTimeout(t); t = setTimeout(() => setTick((x) => x + 1), 60); });
    return () => { clearTimeout(t); off(); };
  }, [repo, opts.live]);
  useEffect(() => {
    let alive = true;
    fnRef.current(repo).then((d) => { if (alive) { setData(d); setError(null); } }).catch((e: Error) => { if (alive) setError(e); }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, tick, ...deps]);
  return { data, error, loading: loading && data === undefined, reload: () => setTick((x) => x + 1) };
}

export function errorMessage(e: unknown) {
  if (e instanceof AppError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return 'Algo deu errado. Tente de novo em instantes.';
}
