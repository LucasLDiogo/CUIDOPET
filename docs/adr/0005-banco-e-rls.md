# ADR-0005 — PostgreSQL, RLS e separação público/privado

**Status:** aceita · **Data:** 2026-10-08

## Camadas de proteção
1. **Schemas:** `public` (negócio), `private` (contatos, identidade, planos de cuidado, contato profissional), `app` (funções internas). `cuidope_anon` nunca acessa `private`.
2. **Papéis:** `cuidope_anon` (visitante), `cuidope_app` (usuário autenticado), `cuidope_service` (worker/webhooks). O papel e `app.user_id` são definidos pelo servidor por transação (`SET LOCAL`).
3. **Grants por coluna:** o cliente não escreve `status`, `is_demo`, métricas, papéis, assinaturas, ledger, outbox, pagamentos.
4. **RLS por tabela** (deny by default) + **projeções públicas** (`v_public_providers/listings/reviews`) como única superfície de leitura anônima.
5. **Funções `SECURITY DEFINER`** com `search_path` fixo e `EXECUTE` restrito; checam usuário/organização explicitamente.
6. **Gatilhos de integridade** independentes do caminho de escrita: transições de estado (`state_transitions`, com teste de *drift* contra `packages/domain`), regras de avaliação, limite de ofertas por plano, ledger imutável/balanceado.

## Capacidade
`reserve_capacity` trava a linha do recurso (`FOR UPDATE`), expira holds vencidos e soma conservadoramente as alocações sobrepostas (nunca vende demais, pode recusar mais do que o necessário em estadias aninhadas). Recursos de capacidade 1 têm ainda uma restrição de exclusão (`btree_gist`) como defesa em profundidade.

## Limites conhecidos
- Os testes rodam em PGlite (PostgreSQL 18 em WASM, conexão única). **Concorrência real entre conexões** precisa ser validada em PostgreSQL de servidor (backlog B-002).
- **PostGIS** não está nas migrations: região/raio usam centroides aproximados (2 casas). Migration PostGIS entra quando houver ambiente com a extensão (B-003).
- Cifragem de `full_name_enc/document_enc` é responsabilidade da aplicação (envelope + KMS); ainda não implementada (B-004).
- RLS não substitui autorização na API nem controle de arquivos/buckets.
