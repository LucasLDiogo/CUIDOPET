# ADR-0002 — API com Fastify; autenticação ainda em aberto

**Status:** API aceita; **autenticação pendente de decisão** · **Data:** 2026-10-08

## Decisão
Fastify 5 + Zod 4 (validação de entrada e de saída), erros `application/problem+json` com `code`, `field` e `correlation_id`, OpenAPI gerado dos mesmos schemas (`npm run openapi`). NestJS foi considerado; Fastify reduz cerimônia e combina com monólito pequeno. Reavaliar se a equipe crescer.

## Autenticação (pendente)
Opções: (a) Supabase Auth + RLS por `auth.uid()`; (b) provedor próprio/Better Auth com `SET LOCAL app.user_id`. O banco já isola por `app.uid()` (variável de sessão definida **pelo servidor**), então qualquer opção encaixa: basta o API resolver o usuário e abrir a transação com `SET LOCAL ROLE cuidope_app`. Decidir antes do incremento 2, considerando: MFA para admin/financeiro, reautenticação bancária, sessões revogáveis, custo e residência de dados.

## Consequências
Rotas autenticadas (`/v1/me/*`, `/v1/requests`, `/v1/quotes/:id/accept` …) ficam planejadas em `docs/api/endpoints.md`; as funções SQL que elas chamarão já existem e estão testadas.
