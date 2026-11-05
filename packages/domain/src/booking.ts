export const HOLD_TTL_MS = 15 * 60_000;

/** TTL do hold: 15 min, limitado pela expiração do Pix quando houver (spec §14). */
export function holdExpiry(now: Date, pixExpiresAt?: Date, ttlMs = HOLD_TTL_MS): Date {
  const byTtl = now.getTime() + ttlMs;
  return new Date(pixExpiresAt ? Math.min(byTtl, pixExpiresAt.getTime()) : byTtl);
}

export type LatePaymentDecision =
  | { action: 'confirm' }
  | { action: 'paid_unallocated'; openIncident: true; options: ['alternative_with_approval', 'refund'] };

/** Pagamento recebido depois do hold: só confirma se a capacidade AINDA estiver alocada ao pedido. */
export function decideOnPayment(args: { holdActive: boolean; capacityStillAvailable: boolean }): LatePaymentDecision {
  if (args.holdActive || args.capacityStillAvailable) return { action: 'confirm' };
  return { action: 'paid_unallocated', openIncident: true, options: ['alternative_with_approval', 'refund'] };
}

export interface ReviewEligibilityInput {
  bookingStatus: string; reviewerId: string; tutorId: string; providerOwnerId: string;
  alreadyReviewed: boolean; completedAt?: Date; now: Date; windowDays?: number; paidThroughPlatform: boolean;
}
export type ReviewEligibility = { ok: true; badge: 'reserva_paga' } | { ok: false; reason: 'not_completed' | 'not_tutor' | 'self_review' | 'duplicate' | 'window_closed' | 'not_paid' };

/** Avaliação principal: contratação confirmada, finalizada, uma por reserva, janela de 14 dias (spec §16). */
export function reviewEligibility(i: ReviewEligibilityInput): ReviewEligibility {
  if (i.reviewerId === i.providerOwnerId) return { ok: false, reason: 'self_review' };
  if (i.reviewerId !== i.tutorId) return { ok: false, reason: 'not_tutor' };
  if (i.bookingStatus !== 'completed' || !i.completedAt) return { ok: false, reason: 'not_completed' };
  if (!i.paidThroughPlatform) return { ok: false, reason: 'not_paid' };
  if (i.alreadyReviewed) return { ok: false, reason: 'duplicate' };
  const days = (i.now.getTime() - i.completedAt.getTime()) / 86_400_000;
  if (days > (i.windowDays ?? 14)) return { ok: false, reason: 'window_closed' };
  return { ok: true, badge: 'reserva_paga' };
}
