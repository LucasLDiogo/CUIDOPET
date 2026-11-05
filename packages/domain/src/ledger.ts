import { assertNonNegativeCents, percentOf, splitCommission, type Cents } from './money.ts';

export type LedgerAccount =
  | 'psp_cash'              // ativo: saldo no PSP
  | 'provider_payable'      // passivo: obrigação com prestador
  | 'commission_revenue'    // receita de comissão
  | 'subscription_revenue'  // receita de assinatura
  | 'advertising_revenue'   // receita de anúncio
  | 'psp_fees'              // despesa: taxas PSP
  | 'refunds'               // reembolsos
  | 'disputes';             // disputas/chargebacks

export interface LedgerEntry { account: LedgerAccount; debitCents: Cents; creditCents: Cents; }
export interface LedgerTransaction { originKey: string; description: string; entries: LedgerEntry[]; reverses?: string; }

export class UnbalancedLedgerError extends Error {
  readonly code = 'unbalanced_ledger';
  constructor(debit: number, credit: number) { super(`Transação desbalanceada: débitos=${debit} créditos=${credit}`); }
}

export function assertBalanced(tx: LedgerTransaction): void {
  let d = 0, c = 0;
  for (const e of tx.entries) {
    assertNonNegativeCents(e.debitCents); assertNonNegativeCents(e.creditCents);
    if ((e.debitCents > 0) === (e.creditCents > 0)) throw new RangeError('cada linha deve ter débito OU crédito');
    d += e.debitCents; c += e.creditCents;
  }
  if (d !== c || d === 0) throw new UnbalancedLedgerError(d, c);
}

/** Pagamento de reserva confirmado: caixa PSP ↔ obrigação com prestador + comissão. */
export function bookingPaymentConfirmed(paymentId: string, totalCents: Cents, commissionBps: number): LedgerTransaction {
  const s = splitCommission(totalCents, commissionBps);
  const tx: LedgerTransaction = {
    originKey: `payment:${paymentId}:confirmed`, description: 'Pagamento de reserva confirmado',
    entries: [
      { account: 'psp_cash', debitCents: s.totalCents, creditCents: 0 },
      { account: 'provider_payable', debitCents: 0, creditCents: s.providerShareCents },
      ...(s.commissionCents > 0 ? [{ account: 'commission_revenue' as const, debitCents: 0, creditCents: s.commissionCents }] : []),
    ],
  };
  assertBalanced(tx); return tx;
}

export function pspFeeCharged(paymentId: string, feeCents: Cents): LedgerTransaction {
  const tx: LedgerTransaction = { originKey: `payment:${paymentId}:psp_fee`, description: 'Taxa do PSP', entries: [
    { account: 'psp_fees', debitCents: feeCents, creditCents: 0 },
    { account: 'psp_cash', debitCents: 0, creditCents: feeCents },
  ] };
  assertBalanced(tx); return tx;
}

/** Assinatura/anúncio pagos à plataforma. */
export function platformProductPaid(paymentId: string, purpose: 'subscription' | 'advertising', totalCents: Cents): LedgerTransaction {
  const tx: LedgerTransaction = { originKey: `payment:${paymentId}:confirmed`, description: `Recebimento de ${purpose}`, entries: [
    { account: 'psp_cash', debitCents: totalCents, creditCents: 0 },
    { account: purpose === 'subscription' ? 'subscription_revenue' : 'advertising_revenue', debitCents: 0, creditCents: totalCents },
  ] };
  assertBalanced(tx); return tx;
}

/** Lançamento reversor (spec §14): transações são imutáveis; correção por reversão. */
export function reverse(original: LedgerTransaction, reversalKey: string): LedgerTransaction {
  const tx: LedgerTransaction = {
    originKey: reversalKey, description: `Reversão de ${original.originKey}`, reverses: original.originKey,
    entries: original.entries.map((e) => ({ account: e.account, debitCents: e.creditCents, creditCents: e.debitCents })),
  };
  assertBalanced(tx); return tx;
}

/** Reembolso proporcional: devolve parcela do total, ajustando comissão e obrigação ao prestador. */
export function partialRefund(paymentId: string, refundId: string, totalCents: Cents, refundCents: Cents, commissionBps: number): LedgerTransaction {
  if (refundCents <= 0 || refundCents > totalCents) throw new RangeError('reembolso inválido');
  const commission = percentOf(refundCents, commissionBps);
  const tx: LedgerTransaction = { originKey: `refund:${refundId}`, description: `Reembolso do pagamento ${paymentId}`, entries: [
    { account: 'provider_payable', debitCents: refundCents - commission, creditCents: 0 },
    ...(commission > 0 ? [{ account: 'commission_revenue' as const, debitCents: commission, creditCents: 0 }] : []),
    { account: 'psp_cash', debitCents: 0, creditCents: refundCents },
  ] };
  assertBalanced(tx); return tx;
}
