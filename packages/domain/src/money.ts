/** Dinheiro sempre em centavos inteiros (BRL). Nunca usar float para valores. */
export type Cents = number;
export const CURRENCY = 'BRL' as const;

export function assertCents(value: unknown, label = 'valor'): asserts value is Cents {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new RangeError(`${label} deve ser inteiro em centavos`);
  }
}

export function assertNonNegativeCents(value: unknown, label = 'valor'): asserts value is Cents {
  assertCents(value, label);
  if ((value as number) < 0) throw new RangeError(`${label} não pode ser negativo`);
}

/** Percentual em basis points (12% = 1200). Arredonda meio para cima (half-up). */
export function percentOf(amount: Cents, bps: number): Cents {
  assertNonNegativeCents(amount, 'amount');
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new RangeError('bps deve estar entre 0 e 10000');
  return Math.floor((amount * bps + 5_000) / 10_000);
}

export interface CommissionSplit {
  totalCents: Cents;
  commissionCents: Cents;
  providerShareCents: Cents;
  commissionBps: number;
}

/** Comissão da plataforma sobre reserva paga; prestador recebe o restante (antes de outras deduções). */
export function splitCommission(totalCents: Cents, commissionBps: number): CommissionSplit {
  const commissionCents = percentOf(totalCents, commissionBps);
  return { totalCents, commissionCents, providerShareCents: totalCents - commissionCents, commissionBps };
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function formatBRL(cents: Cents): string {
  assertCents(cents);
  return brl.format(cents / 100).replace(/ /g, ' ');
}
