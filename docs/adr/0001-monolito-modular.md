# ADR-0001 — Monólito modular em TypeScript

**Status:** aceita (incremento 1) · **Data:** 2026-10-08

## Contexto
A especificação pede marketplace + SaaS com equipe pequena (1–2 devs full stack). Microserviços por módulo multiplicariam operação, observabilidade e consistência distribuída sem benefício no piloto.

## Decisão
Monólito modular: `packages/domain` (regras puras, sem I/O), `packages/contracts` (schemas Zod/OpenAPI), `packages/providers` (adaptadores de PSP), `database/` (migrations + testes), `apps/api`. O PostgreSQL é a fonte de verdade; transações garantem invariantes críticas (capacidade, ledger, estados).

## Consequências
- Um deploy, um banco, testes de integração baratos.
- Fronteiras de módulo são disciplina de importação: `domain` não importa nada de `apps/` nem de I/O.
- `apps/web`, `apps/admin`, `apps/worker` entram como pastas irmãs quando houver código (incrementos 2–3).
- Workspaces npm só serão adotados quando existir um segundo app consumindo os pacotes; hoje importações relativas evitam fricção e mantêm o type-stripping do Node funcionando (ele não processa arquivos dentro de `node_modules`).

## Alternativas rejeitadas
Microserviços; BaaS com lógica no cliente (fere "dinheiro e segurança mudam só pelo backend").
