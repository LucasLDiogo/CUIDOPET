# Endpoints (spec §21) — status

Legenda: ✅ HTTP implementado e testado · 🗄️ regra implementada no banco (função SQL testada), falta rota autenticada · ⬜ planejado.
Contrato máquina-legível: `docs/api/openapi.json` (gerado; cobre os ✅).

**Rotas `/v1/me/*` (modo QAS):** existem apenas com `CUIDOPE_ENV=qas`, identificam o usuário pelo cabeçalho de teste `X-QAS-Persona` (não é autenticação) e **não fazem parte do OpenAPI público**. Cobrem pets, pedidos, propostas, aceite, Pix sandbox, reservas, avaliações e painel do prestador, chamando as funções `app.*` do banco. Ver `docs/qas.md` e a pendência B-012.

| Endpoint | Status | Observação |
|---|---|---|
| GET /v1/health | ✅ | |
| GET /v1/regions | ✅ | extra: selects UF→cidade→bairro |
| GET /v1/search/providers | ✅ | UF, `city_ibge_id`, serviço, espécie, datas, porte, bairro, cursor |
| GET /v1/providers/:slug | ✅ | somente projeção pública |
| GET /v1/listings/:id/availability | ✅ | booleano; não expõe agenda |
| POST /v1/webhooks/:provider | ✅ | sandbox; HMAC, inbox idempotente, retry |
| POST /v1/me/provider-draft | 🗄️ | `provider_profiles` (colunas liberadas) + `app.submit_profile` |
| POST /v1/me/verifications | ⬜ | verificador hospedado |
| POST /v1/me/listings | 🗄️ | RLS + limite do plano no banco |
| PUT /v1/me/availability | 🗄️ | tabelas e RLS prontas |
| POST /v1/me/pets | 🗄️ | RLS por tutor; plano de cuidado em `private` |
| POST /v1/requests | 🗄️ | `app.create_request` (bloqueio, auto-contratação, pets do tutor) |
| POST /v1/requests/:id/quotes | 🗄️ | `app.send_quote` (total derivado, versões) |
| POST /v1/quotes/:id/accept | 🗄️ | `app.accept_quote` (Idempotency-Key, hold, pedido) |
| POST /v1/orders/:id/checkout | ⬜ | usa `MarketplacePaymentProvider` + `app.register_payment` |
| GET /v1/orders/:id/status | ⬜ | estado vem do servidor, nunca da query string |
| POST /v1/bookings/:id/checkin · complete · cancel | 🗄️ parcial | `app.set_booking_status`; evidências e política de cancelamento pendentes |
| POST /v1/bookings/:id/reviews | 🗄️ | regras no gatilho `guard_review` |
| POST /v1/conversations/:id/messages | 🗄️ | RLS: participante, remetente fixo, bloqueio |
| POST/DELETE /v1/consents | 🗄️ | inserção e revogação por RLS |
| POST /v1/leads/:id/proposal | ⬜ | regras em `evaluateLeadSend`; falta fila |
| POST /v1/subscriptions/checkout · cancel | ⬜ | confirmação de pagamento já ativa o plano |
| POST /v1/payout-accounts/onboarding | ⬜ | MVP B |
| GET /v1/me/metrics | ⬜ | |
| POST /v1/tickets · /v1/reports · /v1/users/:id/block | 🗄️ | inserção direta sob RLS, protocolo imediato |
| POST /v1/privacy-requests | ⬜ | |
| POST /v1/admin/refunds/:id/approve | ⬜ | dupla aprovação |
