/** Limites de abordagem comercial (spec §10). Todos reavaliados no momento do envio. */
export const LEAD_LIMITS = Object.freeze({ validityDays: 7, globalWindowHours: 72, maxProvidersPerComparison: 3, reminderAfterHours: 72, maxReminders: 1 });

export interface LeadContext {
  now: Date;
  consent: { status: 'active' | 'revoked' | 'expired'; expiresAt: Date; providerId: string; listingId: string };
  target: { providerId: string; listingId: string };
  providerHasEntitlement: boolean;
  tutorBlockedProvider: boolean;
  tutorOptedOutCommercial: boolean;
  campaignsKillSwitch: boolean;
  lastCommercialNotificationAt?: Date; // por tutor, qualquer prestador
  initialSentAt?: Date; remindersSent: number; conversationReplied: boolean;
  providersContactedInComparison: number;
}
export type LeadDecision = { allow: true; kind: 'initial' | 'reminder' } | { allow: false; reason: string };

export function evaluateLeadSend(c: LeadContext): LeadDecision {
  if (c.campaignsKillSwitch) return { allow: false, reason: 'kill_switch' };
  if (c.consent.status !== 'active') return { allow: false, reason: 'consent_not_active' };
  if (c.consent.expiresAt.getTime() <= c.now.getTime()) return { allow: false, reason: 'consent_expired' };
  if (c.consent.providerId !== c.target.providerId || c.consent.listingId !== c.target.listingId) return { allow: false, reason: 'consent_scope_mismatch' };
  if (c.tutorBlockedProvider) return { allow: false, reason: 'blocked' };
  if (c.tutorOptedOutCommercial) return { allow: false, reason: 'opt_out' };
  if (!c.providerHasEntitlement) return { allow: false, reason: 'no_entitlement' }; // premium habilita capacidade, nunca consentimento
  if (c.conversationReplied) return { allow: false, reason: 'conversation_already_open' };
  const hours = (a?: Date) => (a ? (c.now.getTime() - a.getTime()) / 3_600_000 : Infinity);
  if (!c.initialSentAt) {
    if (c.providersContactedInComparison >= LEAD_LIMITS.maxProvidersPerComparison) return { allow: false, reason: 'comparison_limit' };
    if (hours(c.lastCommercialNotificationAt) < LEAD_LIMITS.globalWindowHours) return { allow: false, reason: 'global_72h_cap' };
    return { allow: true, kind: 'initial' };
  }
  if (c.remindersSent >= LEAD_LIMITS.maxReminders) return { allow: false, reason: 'flow_closed' };
  if (hours(c.initialSentAt) < LEAD_LIMITS.reminderAfterHours) return { allow: false, reason: 'reminder_too_early' };
  if (hours(c.lastCommercialNotificationAt) < LEAD_LIMITS.globalWindowHours) return { allow: false, reason: 'global_72h_cap' };
  return { allow: true, kind: 'reminder' };
}
