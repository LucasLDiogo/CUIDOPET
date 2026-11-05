import { define } from './state-machine.ts';

/** Estados independentes: premium, verified, paid e completed NÃO são equivalentes (spec §15). */

export const profileMachine = define('profile',
  'draft' as 'draft' | 'submitted' | 'reviewing' | 'published' | 'needs_changes' | 'rejected' | 'suspended' | 'archived',
  {
    draft: ['submitted', 'archived'],
    submitted: ['reviewing', 'draft'],
    reviewing: ['published', 'needs_changes', 'rejected'],
    needs_changes: ['submitted', 'archived'],
    published: ['suspended', 'needs_changes', 'archived'],
    suspended: ['reviewing', 'archived'],
    rejected: ['draft', 'archived'],
    archived: [],
  });
export type ProfileStatus = typeof profileMachine.initial | 'submitted' | 'reviewing' | 'published' | 'needs_changes' | 'rejected' | 'suspended' | 'archived';

export const verificationMachine = define('verification',
  'not_started' as 'not_started' | 'pending' | 'needs_information' | 'approved' | 'expired' | 'rejected' | 'revoked',
  {
    not_started: ['pending'],
    pending: ['needs_information', 'approved', 'rejected'],
    needs_information: ['pending', 'rejected'],
    approved: ['expired', 'revoked'],
    expired: ['pending'],
    rejected: ['pending'],
    revoked: [],
  });

export const requestMachine = define('request',
  'open' as 'open' | 'discussing' | 'quoted' | 'accepted' | 'declined' | 'expired' | 'cancelled',
  {
    open: ['discussing', 'quoted', 'declined', 'expired', 'cancelled'],
    discussing: ['quoted', 'declined', 'expired', 'cancelled'],
    quoted: ['accepted', 'discussing', 'declined', 'expired', 'cancelled'],
    accepted: [],
    declined: [],
    expired: [],
    cancelled: [],
  });

export const quoteMachine = define('quote',
  'draft' as 'draft' | 'sent' | 'accepted' | 'revised' | 'expired' | 'rejected',
  {
    draft: ['sent'],
    sent: ['accepted', 'revised', 'expired', 'rejected'],
    accepted: [],
    revised: [],
    expired: [],
    rejected: [],
  });

export const bookingMachine = define('booking',
  'awaiting_payment' as 'awaiting_payment' | 'confirmed' | 'ready' | 'in_progress' | 'completed' | 'cancelled' | 'no_show' | 'interrupted',
  {
    awaiting_payment: ['confirmed', 'cancelled'],
    confirmed: ['ready', 'cancelled', 'no_show'],
    ready: ['in_progress', 'cancelled', 'no_show'],
    in_progress: ['completed', 'interrupted'],
    interrupted: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
    no_show: [],
  });

export const paymentMachine = define('payment',
  'created' as 'created' | 'pending' | 'confirmed' | 'settled' | 'failed' | 'expired' | 'refund_pending' | 'partially_refunded' | 'refunded' | 'chargeback',
  {
    created: ['pending', 'failed', 'expired'],
    pending: ['confirmed', 'failed', 'expired'],
    confirmed: ['settled', 'refund_pending', 'chargeback'],
    settled: ['refund_pending', 'chargeback'],
    refund_pending: ['partially_refunded', 'refunded', 'confirmed', 'settled'],
    partially_refunded: ['refund_pending', 'chargeback'],
    refunded: [],
    failed: [],
    expired: [],
    chargeback: [],
  });

export const payoutMachine = define('payout',
  'not_eligible' as 'not_eligible' | 'pending_release' | 'available' | 'transfer_pending' | 'paid' | 'blocked' | 'failed' | 'reversed',
  {
    not_eligible: ['pending_release', 'blocked'],
    pending_release: ['available', 'blocked'],
    available: ['transfer_pending', 'blocked'],
    transfer_pending: ['paid', 'failed'],
    paid: ['reversed'],
    failed: ['transfer_pending', 'blocked'],
    blocked: ['pending_release', 'available'],
    reversed: [],
  });

export const subscriptionMachine = define('subscription',
  'pending' as 'pending' | 'active' | 'past_due' | 'suspended' | 'cancel_at_period_end' | 'cancelled',
  {
    pending: ['active', 'cancelled'],
    active: ['past_due', 'cancel_at_period_end', 'cancelled'],
    past_due: ['active', 'suspended', 'cancelled'],
    suspended: ['active', 'cancelled'],
    cancel_at_period_end: ['active', 'cancelled'],
    cancelled: [],
  });

export const disputeMachine = define('dispute',
  'open' as 'open' | 'evidence_requested' | 'reviewing' | 'decided' | 'executing' | 'closed' | 'appealed',
  {
    open: ['evidence_requested', 'reviewing'],
    evidence_requested: ['reviewing'],
    reviewing: ['decided', 'evidence_requested'],
    decided: ['executing', 'appealed'],
    executing: ['closed'],
    appealed: ['reviewing'],
    closed: [],
  });

export const adMachine = define('ad',
  'draft' as 'draft' | 'reviewing' | 'approved' | 'scheduled' | 'active' | 'paused' | 'ended' | 'rejected',
  {
    draft: ['reviewing'],
    reviewing: ['approved', 'rejected'],
    approved: ['scheduled'],
    scheduled: ['active', 'paused'],
    active: ['paused', 'ended'],
    paused: ['active', 'ended'],
    ended: [],
    rejected: ['draft'],
  });

export const consentMachine = define('consent',
  'active' as 'active' | 'revoked' | 'expired',
  { active: ['revoked', 'expired'], revoked: [], expired: [] });

/**
 * Mapeamento EXPLÍCITO de status do PSP para o estado interno (spec §15: nunca por comparação
 * de texto no frontend). Status desconhecido → undefined → evento vai para revisão manual.
 */
export const pspPaymentStatusMap = Object.freeze({
  sandbox: {
    PENDING: 'pending', RECEIVED: 'confirmed', CONFIRMED: 'confirmed', OVERDUE: 'expired',
    REFUND_REQUESTED: 'refund_pending', REFUNDED: 'refunded', CHARGEBACK_REQUESTED: 'chargeback', FAILED: 'failed',
  },
} as const);
