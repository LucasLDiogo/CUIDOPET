# Pendências técnicas (referenciadas nas ADRs)

| ID | Pendência | Por quê |
|---|---|---|
| B-001 | Adaptador PostgreSQL de servidor (`pg`/pool) e ambiente de staging | Hoje o API usa PGlite (dev). Produção é recusada de propósito. |
| B-002 | Teste de concorrência com várias conexões reais (último slot, hold vs. pagamento tardio) | PGlite tem conexão única. |
| B-003 | Migration PostGIS (raio/polígono) | Extensão indisponível no ambiente de teste atual. |
| B-004 | Cifragem de envelope para nome civil/documento + HMAC de CPF | Colunas existem; chave/KMS ainda não. |
| B-005 | Conciliação diária e fila financeira | Depende do PSP escolhido. |
| B-006 | Autenticação (ADR-0002), MFA admin/financeiro e rotas `/v1/me/*` | Decisão pendente. |
| B-007 | Rate limit por IP/conta/operação e proteção distribuída | Não implementado. |
| B-008 | Regras semanais/buffers de `availability_rules` na reserva | Hoje só capacidade e exceções. |
| B-009 | Exploração controlada de novos prestadores no ranking | Requer infraestrutura de experimento. |
| B-010 | Observabilidade (fila, webhook atrasado, divergência) e backup/restauração testados | |
| B-011 | Web (Next.js/PWA), admin e worker | Próximos incrementos. |
| B-012 | Trocar a persona do QAS (`X-QAS-Persona`) por autenticação real nas rotas `/v1/me/*` e mover essas rotas para o contrato OpenAPI público | A persona NÃO é autenticação; o modo QAS é recusado em produção. Depende de B-006. |
| B-013 | Prestador gerenciar anúncios, preços e agenda pela interface; repasse real; chat tutor↔prestador; cancelamento com reembolso | O QAS cobre só pedido → proposta → pagamento sandbox → reserva → avaliação. |
| B-014 | Validar que o período do pedido começa no futuro (API e `app.create_request`) | Hoje só a ordem início < fim é validada; datas passadas são aceitas, então o QAS depende de o testador usar datas futuras. |
