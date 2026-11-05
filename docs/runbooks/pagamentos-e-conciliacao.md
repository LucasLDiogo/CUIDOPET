# Runbook — pagamentos, conciliação e requisitos de produção do PSP

> Este incremento só tem o **sandbox**. Nada abaixo foi contratado.

## Antes de ligar um PSP real (checklist)
1. Empresa (CNPJ), responsável e conta merchant do PSP sob controle da **empresa proprietária** (não do fornecedor de desenvolvimento).
2. Comparar ao menos dois PSPs em: Pix dinâmico, cartão tokenizado/hospedado, assinatura, recebedor marketplace, split, onboarding/KYC, reembolso (Pix e cartão), webhooks (assinatura, reentrega, ordem), antifraude, sandbox, repasse condicionado.
3. Confirmar por escrito: quem paga a tarifa em reembolso, saldo insuficiente, chargeback; prazos de liquidação; limites de Pix; suporte de Pix Automático (autorização própria).
4. Segredos no cofre do servidor; webhook com assinatura/token documentado (não apenas IP); `external_reference` = id do pedido interno (nunca nome/CPF).
5. Contador valida reconhecimento de receita e emissão fiscal; jurídico valida termos e papel da plataforma.

## Conciliação diária (a implementar — B-005)
Comparar pedidos locais × cobranças × recebimentos × reembolsos × repasses; divergência abre item em fila financeira. Hoje existem as peças: `payments.external_id` único, `webhook_inbox` com tentativas/erro, ledger com `origin_key`.

## Operação de exceções já suportadas
- **`paid_unallocated`**: pagamento confirmado sem vaga → ticket de prioridade alta, ledger em `unallocated_payments`. Ação: oferecer alternativa **com aprovação do tutor** ou reembolsar (reembolso entra com MVP B).
- **Webhook pendente** (`webhook_inbox.processed_at is null`): worker reprocessa até 5 vezes; excedentes exigem operador.
- **Hold vencido**: `app.expire_holds()` cancela reserva não paga e libera a vaga (executar a cada minuto no worker).
