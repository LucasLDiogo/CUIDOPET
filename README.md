# Cuidopê — marketplace de cuidado pet + SaaS para prestadores

## Novo: site e app completos (`apps/web`)
Interface de produto pronta para demonstração e para ligar no backend:
- **Público:** busca por serviço/cidade/bairro/espécie/porte, lista e mapa, perfis com avaliações verificadas, pacotes e agendamento em 4 etapas com confirmação pelo WhatsApp.
- **Tutor:** agendamentos com linha do tempo e espelho do WhatsApp (Confirmar · Remarcar · Cancelar), pets, pacotes com saldo, favoritos, avaliação.
- **Prestador:** painel com KPIs, agenda semanal, **CRM do WhatsApp** (caixa por status, SLA, modelos aprovados, funil), serviços, pacotes, clientes, avaliações, perfil público e automações.
- **Backends:** `demo` (no navegador), **Supabase** (`supabase/`: migração com RLS, seed, Edge Functions do WhatsApp, 93 testes SQL) ou **Firebase** (`firestore.rules`, `storage.rules`, `firebase.json`).
- **Segurança:** `SECURITY.md` (ameaças, matriz RLS, LGPD, cabeçalhos). **UX:** `docs/ux-jornadas.md`.

Rodar: duplo clique em `ABRIR-DEMO-CUIDOPE.cmd` (Windows) ou `cd apps/web && npm install && npm run dev`. Publicar: veja `apps/web/README.md`.

---

## Incremento 1 (API e banco de domínio)
Incremento 1 da especificação `Cuidope_Prompt_Completo` (7/out/2026): **fundação, banco, regras de domínio e leitura pública**. Veja `docs/aceite-incremento-1.md` para o que está coberto.

### O que funciona de ponta a ponta
- **Busca pública** `GET /v1/search/providers` (UF → cidade IBGE → serviço → espécie, datas/porte/bairro), perfil público, regiões e disponibilidade.
- **Fluxo transacional no banco** (testado em Postgres real): solicitação → proposta versionada → aceite idempotente → *hold* de capacidade → pagamento confirmado por webhook assinado → reserva confirmada + ledger; pagamento tardio sem vaga vira exceção com ticket; expiração de hold; avaliações de reserva paga.
- **Segurança em camadas**: papéis, RLS, grants por coluna, projeções públicas, estados guardados por gatilho, ledger imutável.
- **Sandbox de PSP** determinístico (não move dinheiro).
- **Modo QAS** (homologação): interface em `/qas` para testar como tutor e como prestador, com personas de teste. Roteiro em `docs/qas.md`.

### O que NÃO existe ainda nesse incremento
Autenticação real (o QAS usa personas de teste), admin, worker em processo próprio, PSP real, verificação de identidade real, PostGIS, concorrência multiconexão validada, produção. Lista em `docs/pendencias-tecnicas.md` e `docs/backlog.md`.

### Rodar localmente
Requer Node ≥ 22.18. **Windows:** duplo clique em `TESTAR-CUIDOPE.cmd` (menu: QAS, teste rápido, todos os testes, zerar dados).
```bash
npm install
npm test                 # domínio, contratos, PSP sandbox, banco, API (~3 min)
npm run typecheck
npm run dev              # API em http://127.0.0.1:3333/v1/health com dados de DEMONSTRAÇÃO
npm run qas              # MODO QAS em http://127.0.0.1:3333/qas
npm run openapi
npm run backlog
```

### Estrutura
```
apps/web             site + app (React/Vite) — NOVO
supabase/            migração Supabase, seed, Edge Functions WhatsApp, testes RLS — NOVO
firestore.rules …    regras Firebase — NOVO
packages/domain      regras puras: dinheiro, estados, ledger, ranking, leads, planos, flags
packages/contracts   schemas Zod + OpenAPI
packages/providers   interfaces de PSP + sandbox
database/            migrations 0001–0009 (API do incremento 1), seed de demo, testes
apps/api             Fastify (rotas públicas + webhook; `/v1/me/*` só no modo QAS)
apps/web-qas         interface de homologação, servida em /qas
docs/                ADRs, backlog, endpoints, runbooks, aceite, UX
```

### Decisões
ADRs em `docs/adr/`. Os dados de demonstração (Ana, Carla, Diego…) são **fictícios e marcados `is_demo`**. O servidor recusa `CUIDOPE_ENV=production`.
