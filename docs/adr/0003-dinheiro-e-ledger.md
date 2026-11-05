# ADR-0003 — Dinheiro em centavos e ledger de partidas dobradas

**Status:** aceita · **Data:** 2026-10-08

- Todo valor monetário é `integer` em centavos, moeda BRL com `CHECK`. Teste automático falha se alguma coluna `*_cents` não for inteira.
- Comissão em *basis points* com arredondamento half-up (`percentOf`); o prestador recebe `total − comissão`, então a soma sempre fecha. O percentual de cada reserva é **copiado** para `bookings.commission_bps` (mudar a taxa não altera reservas existentes).
- Ledger imutável: transações e linhas não aceitam UPDATE/DELETE; correção só por lançamento reversor. Balanceamento (Σdébitos = Σcréditos) é verificado no COMMIT por *constraint trigger* diferido. `origin_key` único torna cada lançamento idempotente por operação externa.
- Pagamento sem vaga (`paid_unallocated`) é registrado como passivo (`unallocated_payments`), nunca como receita.
- Reconhecimento de receita e tratamento fiscal exigem validação do contador (fora do código).
- O exemplo da especificação (R$ 200,00 → 12% → R$ 24,00 / R$ 176,00; absorção ilustrativa de 3% → R$ 18,00) está coberto por teste e **não** é contrato de liquidação.
