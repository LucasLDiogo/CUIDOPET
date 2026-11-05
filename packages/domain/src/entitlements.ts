export type PlanCode = 'essencial' | 'profissional' | 'pro_regional';
export interface Plan { code: PlanCode; priceCents: number; maxListings: number; detailedAnalytics: boolean; authorizedProposals: boolean; regionalBoostCredits: number; dataExport: boolean }

/** Hipóteses de preço (spec §12) — validar no piloto. Entitlements resolvidos no servidor. */
export const PLANS: Readonly<Record<PlanCode, Plan>> = Object.freeze({
  essencial: { code: 'essencial', priceCents: 0, maxListings: 2, detailedAnalytics: false, authorizedProposals: false, regionalBoostCredits: 0, dataExport: false },
  profissional: { code: 'profissional', priceCents: 3990, maxListings: 10, detailedAnalytics: true, authorizedProposals: true, regionalBoostCredits: 0, dataExport: false },
  pro_regional: { code: 'pro_regional', priceCents: 7990, maxListings: 10, detailedAnalytics: true, authorizedProposals: true, regionalBoostCredits: 4, dataExport: true },
});

export type SubscriptionStatus = 'pending' | 'active' | 'past_due' | 'suspended' | 'cancel_at_period_end' | 'cancelled';

/** Plano efetivo: past_due dentro da tolerância mantém benefícios; suspenso/cancelado cai para Essencial. */
export function effectivePlan(plan: PlanCode, status: SubscriptionStatus | null, opts?: { periodEnd?: Date; now?: Date; graceDaysLeft?: number }): Plan {
  const now = opts?.now ?? new Date();
  switch (status) {
    case 'active': return PLANS[plan];
    case 'cancel_at_period_end': return opts?.periodEnd && opts.periodEnd > now ? PLANS[plan] : PLANS.essencial;
    case 'past_due': return (opts?.graceDaysLeft ?? 0) > 0 ? PLANS[plan] : PLANS.essencial;
    default: return PLANS.essencial;
  }
}
export const canCreateListing = (plan: Plan, currentCount: number) => currentCount < plan.maxListings;
