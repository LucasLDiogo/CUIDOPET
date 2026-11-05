# Cuidopê — site e app (apps/web)

Marketplace de cuidado pet: busca pública com avaliações, perfil do prestador, agendamento em 4 etapas,
área do tutor, painel do prestador com agenda, **CRM do WhatsApp** (status, SLA, modelos, funil), pacotes com saldo,
clientes, avaliações e automações. React 19 + Vite + TypeScript + Tailwind 4. Funciona como PWA no celular.

## Rodar
```bash
cd apps/web
npm install
npm run dev          # http://localhost:5173  (modo demo, dados fictícios no navegador)
npm run build        # gera dist/ para hospedar
npm run build:single # gera dist-single/index.html (um arquivo só, para enviar ou hospedar em qualquer lugar)
npm run typecheck
npm run preview & BASE=http://localhost:4173 npm run test:e2e   # 23 verificações ponta a ponta
```
No Windows dá para usar `ABRIR-DEMO-CUIDOPE.cmd` na raiz do projeto.

## Escolher o backend
`VITE_DATA_BACKEND` em `.env.local` (copie de `.env.example`):
| valor | o que acontece |
|---|---|
| `demo` (padrão) | tudo no navegador, com 26 prestadores, 1.300+ avaliações, agenda e conversas geradas; faixa “Ver como Tutor / Prestador” no topo |
| `supabase` | Postgres + Auth + Realtime + Edge Functions do WhatsApp. Migração, RLS, seed e testes em `../../supabase/` |
| `firebase` | Firestore + Auth. Regras em `../../firestore.rules` |

Guia completo: `../../docs/backend-supabase-firebase.md`. Segurança e LGPD: `../../SECURITY.md`. Jornadas e personas: `../../docs/ux-jornadas.md`.

## Publicar (gerar o link)
- **GitHub Pages**: suba o repositório no GitHub e ative Pages → “GitHub Actions”. O workflow `.github/workflows/web.yml` testa e publica a cada push na `main`.
- **Vercel**: importe o repositório, *Root Directory* = `apps/web` (usa `vercel.json`, já com cabeçalhos de segurança).
- **Netlify / Cloudflare Pages**: diretório `apps/web`, build `npm run build`, saída `dist` (cabeçalhos em `public/_headers`).
- **Firebase Hosting**: `npm run build` e depois, na raiz, `firebase deploy --only hosting` (usa `firebase.json`).

As rotas usam `#/` (hash), então funciona em qualquer hospedagem estática sem configurar reescrita.

## Estrutura
```
src/domain     tipos e regras puras (status, preço, comissão, ranking, horários)
src/data       Repository (contrato) + adaptadores demo / Supabase / Firebase + gerador da demo
src/components layout, painel, cards, mapa esquemático, UI base
src/pages      public/ (início, busca, perfil, agendar, entrar, anunciar, termos) · tutor/ · provider/
e2e/smoke.mjs  teste ponta a ponta (desktop + celular)
```
