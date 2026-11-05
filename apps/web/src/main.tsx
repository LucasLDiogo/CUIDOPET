import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { createRepository } from './lib/repo';

try { const t = localStorage.getItem('cuidope.theme'); if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; } catch { /* sem storage */ }

const root = createRoot(document.getElementById('root')!);
createRepository()
  .then((repo) => root.render(<StrictMode><App repo={repo} /></StrictMode>))
  .catch((e: Error) => {
    root.render(
      <div style={{ padding: 32, fontFamily: 'system-ui', maxWidth: 560, margin: '10vh auto' }}>
        <h1 style={{ fontSize: 22 }}>Não foi possível iniciar o Cuidopê</h1>
        <p>{e.message}</p>
        <p style={{ color: '#56685f' }}>Confira as variáveis em <code>.env.local</code> (veja <code>.env.example</code>) ou use <code>VITE_DATA_BACKEND=demo</code>.</p>
      </div>,
    );
  });
