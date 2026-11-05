# Aceite do incremento 1 contra a especificação (§23)

Legenda: ✅ coberto por teste automatizado · 🟡 parcial · ⬜ pendente. "Banco" = Postgres real (PGlite) com as migrations de produção.

| # | Requisito da spec | Estado | Evidência / lacuna |
|---|---|---|---|
| 1 | A não lê dados de B; prestador A não acessa organização B; `anon` só vê publicado | ✅ (banco) · 🟡 (API) | `database/tests/rls.test.ts`. Rotas autenticadas ainda não existem, então a camada de API não foi exercitada. |
| 2 | Busca troca UF/cidade; "todos" respeita espécies ativas; patrocinado incompatível não aparece; suspenso nunca aparece | ✅ | `apps/api/test`, `rls.test.ts`. Patrocínio ainda não existe (lista vazia). |
| 3 | Cadastro privado não vaza em resposta, EXIF, URL, HTML, schema.org, logs, cache | 🟡 | Varredura profunda de chaves/padrões nas respostas e teste de colunas de PII; sem UI/HTML/EXIF/CDN ainda. |
| 4 | Callback adulterado não ativa; repetido ativa uma vez; fora de ordem não regride; PSP confirmado reconcilia falha local | ✅ | `api.test.ts` (assinatura, dedupe, retry), `flow.test.ts` (assinatura e reserva, fora de ordem, valor divergente). |
| 5 | Último slot/capacidade → uma reserva; pagamento tardio sem vaga → exceção | ✅ sequencial · ⬜ concorrência real | Exclusão por `btree_gist` + trava de linha; concorrência multiconexão é B-002. |
| 6 | Pix expirado não é pago; manual × automático; reembolso/chargeback invalidam direitos | 🟡 | Expiração e evento tardio ignorado ✅. Pix Automático, reembolso e chargeback ⬜ (MVP B). |
| 7 | Troca bancária bloqueada por MFA/titularidade; destinatário do plano é conta da plataforma | ⬜ | Depende de recebedores e autenticação (B-006). |
| 8 | Lead sem autorização não é abordado mesmo premium; opt-out após enfileirar; limites globais | 🟡 | Regras puras testadas (`evaluateLeadSend`); falta fila de envio que as reavalie. |
| 9 | Clique no WhatsApp não é venda; bloqueio impede abordagem; link malicioso recusado | 🟡 | Bloqueio ✅; `external_site_url` só aceita `https://` ✅; sem UI/eventos ainda. |
| 10 | Avaliação sem contratação recusada; nota não muda por Premium; externa separada | ✅ | `flow.test.ts` (avaliação). Métrica agrega só `reserva_paga`. |
| 11 | Ticket e denúncia geram protocolo; urgência escalona; suspensão trata reservas ativas e recurso | 🟡 | Protocolo e ocultação do denunciante ✅; escalonamento real e suspensão com reservas ativas ⬜. |
| 12 | Ledger balanceia, reversão preserva original, split não excede líquido, reconciliação detecta divergência | ✅ exceto reconciliação | `domain.test.ts`, `integrity.test.ts`; conciliação diária é B-005. |
| 13 | Jornadas desktop/mobile com teclado, leitor de tela, contraste, offline | ⬜ | Não há UI neste incremento (existe o protótipo estático em `outputs/`). |
| 14 | Cancelamento obedece snapshot; valores, reembolso, repasse e comprovantes consistentes | 🟡 | Snapshot de política e comissão gravado na reserva; fluxo de cancelamento ⬜. |
| 15 | Apps tratam compras das lojas | ⬜ | V1. |

**Limites de honestidade:** nada aqui toca dinheiro real, PSP real, identidade real ou produção. Ambiente de teste é Postgres em WASM, não um servidor. Os testes de isolamento provam o banco; a API de produção só tem rotas públicas. No modo QAS (`docs/qas.md`) as rotas `/v1/me/*` e a interface `/qas` exercitam o fluxo completo nos dois papéis, com personas de teste (não é autenticação); isso também exercitou a camada de API sobre as funções do banco (a homologação achou a lacuna corrigida pela migration 0009).
