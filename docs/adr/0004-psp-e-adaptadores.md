# ADR-0004 — PSP atrás de adaptadores; nenhum PSP contratado

**Status:** aceita (interfaces) · **PSP:** pendente de comparação e contrato

- `BillingProvider` (fluxo A: assinatura/anúncio, beneficiário = empresa) e `MarketplacePaymentProvider` (fluxo B: reserva, recebedor/split) são interfaces separadas em `packages/providers`.
- Só existe o **sandbox determinístico**: não move dinheiro, gera código Pix identificado como não pagável e assina webhooks com HMAC-SHA256.
- Webhook: assinatura sobre o corpo bruto, comparação em tempo constante, persistência deduplicada `(provider, event_id)` antes de processar, resposta 200 após persistência, falhas reprocessadas por worker, mapeamento **explícito** de status do PSP.
- Comparação de PSPs (Pix, cartão, assinatura, recebedor marketplace, split, KYC, reembolso, webhooks, antifraude, sandbox) segue o roteiro de `docs/runbooks/pagamentos-e-conciliacao.md`. Asaas é candidato documentado, **não contratado**. Taxas, prazos e parcelamento não são assumidos.
- Split no recebimento não significa dinheiro retido até a conclusão; se o contrato não suportar repasse condicionado, redesenhar o fluxo antes de anunciar qualquer "proteção" (sem *escrow* informal).
