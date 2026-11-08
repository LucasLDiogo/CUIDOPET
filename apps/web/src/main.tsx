import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { createRepository } from './lib/repo';
import { Splash } from './components/Splash';
import type { Repository } from './data/repository';

try { const t = localStorage.getItem('cuidope.theme'); if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; } catch { /* sem storage */ }

function Boot() {
  const [repo, setRepo] = useState<Repository | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [splash, setSplash] = useState(true);
  useEffect(() => { createRepository().then(setRepo).catch((e: Error) => setError(e)); }, []);
  const done = useCallback(() => setSplash(false), []);
  if (error) {
    return (
      <div style={{ padding: 32, fontFamily: 'system-ui', maxWidth: 560, margin: '10vh auto' }}>
        <h1 style={{ fontSize: 22 }}>Não foi possível iniciar o Cuidopê</h1>
        <p>{error.message}</p>
        <p style={{ color: '#56608A' }}>Confira as variáveis em <code>.env.local</code> (veja <code>.env.example</code>) ou use <code>VITE_DATA_BACKEND=demo</code>.</p>
      </div>
    );
  }
  return (
    <>
      {repo && <App repo={repo} />}
      {splash && <Splash ready={!!repo} onDone={done} />}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Boot /></StrictMode>);
