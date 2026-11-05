import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as d from '../src/index.ts';

test('money: comissão 12% sobre R$200 = R$24 / prestador R$176 (exemplo da spec §14)', () => {
  const s = d.splitCommission(20_000, 1200);
  assert.equal(s.commissionCents, 2_400);
  assert.equal(s.providerShareCents, 17_600);
});
test('money: arredondamento half-up e soma sempre fecha', () => {
  for (const total of [1, 99, 1_001, 12_345, 9_999_99]) {
    const s = d.splitCommission(total, 1250);
    assert.equal(s.commissionCents + s.providerShareCents, total);
  }
  assert.equal(d.percentOf(5, 1000), 1); // 0,5 → 1
});
test('money: rejeita float, negativo e bps inválido', () => {
  assert.throws(() => d.assertCents(10.5));
  assert.throws(() => d.assertNonNegativeCents(-1));
  assert.throws(() => d.percentOf(100, 10_001));
});
test('money: formatBRL', () => assert.equal(d.formatBRL(3990), 'R$ 39,90'));

test('máquinas: reserva só confirma a partir de awaiting_payment; completed é terminal', () => {
  assert.ok(d.canTransition(d.bookingMachine, 'awaiting_payment', 'confirmed'));
  assert.ok(!d.canTransition(d.bookingMachine, 'awaiting_payment', 'in_progress'));
  assert.ok(!d.canTransition(d.bookingMachine, 'cancelled', 'confirmed'));
  assert.ok(d.isTerminal(d.bookingMachine, 'completed'));
  assert.throws(() => d.assertTransition(d.bookingMachine, 'completed', 'cancelled'), d.InvalidTransitionError);
});
test('máquinas: todo estado alvo existe como chave (consistência das tabelas)', () => {
  for (const m of [d.profileMachine, d.verificationMachine, d.requestMachine, d.quoteMachine, d.bookingMachine, d.paymentMachine, d.payoutMachine, d.subscriptionMachine, d.disputeMachine, d.adMachine, d.consentMachine]) {
    for (const [from, tos] of Object.entries(m.transitions)) for (const to of tos as string[]) {
      assert.ok(to in m.transitions, `${m.name}: ${from} → ${to} aponta para estado inexistente`);
    }
  }
});
test('máquinas: pagamento chargeback/refunded não regridem', () => {
  assert.ok(!d.canTransition(d.paymentMachine, 'refunded', 'confirmed'));
  assert.ok(!d.canTransition(d.paymentMachine, 'chargeback', 'settled'));
  assert.ok(d.canTransition(d.paymentMachine, 'confirmed', 'chargeback'));
});
test('máquinas: assinatura past_due → suspended não apaga (cancelled é terminal separado)', () => {
  assert.ok(d.canTransition(d.subscriptionMachine, 'past_due', 'suspended'));
  assert.ok(d.canTransition(d.subscriptionMachine, 'suspended', 'active'));
});
test('mapa PSP é explícito; status desconhecido não mapeia', () => {
  assert.equal(d.pspPaymentStatusMap.sandbox.CONFIRMED, 'confirmed');
  assert.equal((d.pspPaymentStatusMap.sandbox as Record<string, string>)['ALGO_NOVO'], undefined);
});

test('ledger: pagamento confirmado balanceia e reproduz o exemplo da spec', () => {
  const tx = d.bookingPaymentConfirmed('p1', 20_000, 1200);
  d.assertBalanced(tx);
  const get = (a: string) => tx.entries.find((e) => e.account === a)!;
  assert.equal(get('psp_cash').debitCents, 20_000);
  assert.equal(get('provider_payable').creditCents, 17_600);
  assert.equal(get('commission_revenue').creditCents, 2_400);
});
test('ledger: taxa PSP absorvida 3% (R$6) deixa R$18 de comissão líquida', () => {
  const fee = d.pspFeeCharged('p1', d.percentOf(20_000, 300));
  assert.equal(fee.entries[0].debitCents, 600);
  assert.equal(2_400 - 600, 1_800);
});
test('ledger: desbalanceado e linha dupla são rejeitados', () => {
  assert.throws(() => d.assertBalanced({ originKey: 'x', description: '', entries: [
    { account: 'psp_cash', debitCents: 100, creditCents: 0 }, { account: 'provider_payable', debitCents: 0, creditCents: 90 }] }), d.UnbalancedLedgerError);
  assert.throws(() => d.assertBalanced({ originKey: 'x', description: '', entries: [{ account: 'psp_cash', debitCents: 1, creditCents: 1 }] }));
});
test('ledger: reversão inverte tudo e preserva a original', () => {
  const orig = d.bookingPaymentConfirmed('p1', 20_000, 1200);
  const snapshot = JSON.stringify(orig);
  const rev = d.reverse(orig, 'payment:p1:reversal');
  assert.equal(JSON.stringify(orig), snapshot);
  assert.equal(rev.reverses, orig.originKey);
  assert.equal(rev.entries[0].creditCents, 20_000);
});
test('ledger: reembolso parcial ajusta comissão proporcional e balanceia', () => {
  const tx = d.partialRefund('p1', 'r1', 20_000, 5_000, 1200);
  d.assertBalanced(tx);
  assert.equal(tx.entries.find((e) => e.account === 'commission_revenue')!.debitCents, 600);
  assert.throws(() => d.partialRefund('p1', 'r1', 20_000, 25_000, 1200));
});
test('ledger: assinatura gera receita de assinatura', () => {
  const tx = d.platformProductPaid('p2', 'subscription', 3_990);
  assert.equal(tx.entries.find((e) => e.account === 'subscription_revenue')!.creditCents, 3_990);
});

test('ranking: pesos somam 1 e score fica em [0,1]', () => {
  const sum = Object.values(d.RANKING_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  const s = d.score({ fit: 1, availability: 1, ratingAvg: 5, ratingCount: 200, responseRate: 1, distanceKm: 0, radiusKm: 10, completeness: 1 });
  assert.ok(s.total > 0.9 && s.total <= 1);
});
test('ranking: 1 avaliação 5★ não supera 50 avaliações 4,8★ (bayesiana)', () => {
  assert.ok(d.bayesianRating(5, 1) < d.bayesianRating(4.8, 50));
});
test('ranking: sem avaliações usa prior, nunca 5 estrelas inventadas', () => {
  assert.equal(d.bayesianRating(null, 0), 4.2);
});
test('ranking: cancelamentos reduzem reputação; distância sem localização é neutra', () => {
  assert.ok(d.reputationScore(4.8, 40, 0.4) < d.reputationScore(4.8, 40, 0));
  assert.equal(d.distanceScore(null, 10), 0.5);
});
test('ranking: whyAppeared usa só fatores públicos', () => {
  assert.match(d.whyAppeared({ fit: 1, availability: 0.2, reputation: 0.9, response: 0, distance: 0, completeness: 0 }), /combina com sua busca e boa reputação/);
});

test('booking: hold 15 min e limitado pelo vencimento do Pix', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  assert.equal(d.holdExpiry(now).toISOString(), '2026-10-08T12:15:00.000Z');
  assert.equal(d.holdExpiry(now, new Date('2026-10-08T12:10:00Z')).toISOString(), '2026-10-08T12:10:00.000Z');
});
test('booking: pagamento tardio sem vaga vira paid_unallocated com incidente', () => {
  assert.deepEqual(d.decideOnPayment({ holdActive: true, capacityStillAvailable: false }), { action: 'confirm' });
  const late = d.decideOnPayment({ holdActive: false, capacityStillAvailable: false });
  assert.equal(late.action, 'paid_unallocated');
});
test('avaliação: regras de elegibilidade', () => {
  const base = { bookingStatus: 'completed', reviewerId: 't', tutorId: 't', providerOwnerId: 'p', alreadyReviewed: false, completedAt: new Date('2026-10-01'), now: new Date('2026-10-08'), paidThroughPlatform: true };
  assert.deepEqual(d.reviewEligibility(base), { ok: true, badge: 'reserva_paga' });
  assert.equal((d.reviewEligibility({ ...base, bookingStatus: 'in_progress' }) as any).reason, 'not_completed');
  assert.equal((d.reviewEligibility({ ...base, alreadyReviewed: true }) as any).reason, 'duplicate');
  assert.equal((d.reviewEligibility({ ...base, reviewerId: 'p', tutorId: 'p' }) as any).reason, 'self_review');
  assert.equal((d.reviewEligibility({ ...base, now: new Date('2026-10-20') }) as any).reason, 'window_closed');
  assert.equal((d.reviewEligibility({ ...base, paidThroughPlatform: false }) as any).reason, 'not_paid');
});

const lead = (o: Partial<d.LeadContext> = {}): d.LeadContext => ({
  now: new Date('2026-10-08T12:00:00Z'),
  consent: { status: 'active', expiresAt: new Date('2026-10-14T12:00:00Z'), providerId: 'p1', listingId: 'l1' },
  target: { providerId: 'p1', listingId: 'l1' }, providerHasEntitlement: true, tutorBlockedProvider: false,
  tutorOptedOutCommercial: false, campaignsKillSwitch: false, remindersSent: 0, conversationReplied: false, providersContactedInComparison: 0, ...o });
test('leads: premium sem consentimento NUNCA abre abordagem', () => {
  assert.deepEqual(d.evaluateLeadSend(lead({ consent: { status: 'revoked', expiresAt: new Date('2026-10-14'), providerId: 'p1', listingId: 'l1' } })), { allow: false, reason: 'consent_not_active' });
});
test('leads: consentimento de outro prestador/serviço não vale', () => {
  assert.equal((d.evaluateLeadSend(lead({ target: { providerId: 'p2', listingId: 'l1' } })) as any).reason, 'consent_scope_mismatch');
});
test('leads: expirado, bloqueio, opt-out e kill switch impedem envio (reavaliado no envio)', () => {
  assert.equal((d.evaluateLeadSend(lead({ now: new Date('2026-10-15T00:00:00Z') })) as any).reason, 'consent_expired');
  assert.equal((d.evaluateLeadSend(lead({ tutorBlockedProvider: true })) as any).reason, 'blocked');
  assert.equal((d.evaluateLeadSend(lead({ tutorOptedOutCommercial: true })) as any).reason, 'opt_out');
  assert.equal((d.evaluateLeadSend(lead({ campaignsKillSwitch: true })) as any).reason, 'kill_switch');
});
test('leads: teto global de 72h entre prestadores e limite de 3 na comparação', () => {
  assert.equal((d.evaluateLeadSend(lead({ lastCommercialNotificationAt: new Date('2026-10-07T12:00:00Z') })) as any).reason, 'global_72h_cap');
  assert.equal((d.evaluateLeadSend(lead({ providersContactedInComparison: 3 })) as any).reason, 'comparison_limit');
  assert.deepEqual(d.evaluateLeadSend(lead()), { allow: true, kind: 'initial' });
});
test('leads: um lembrete após 72h, depois silêncio encerra', () => {
  const sent = new Date('2026-10-05T11:00:00Z');
  assert.deepEqual(d.evaluateLeadSend(lead({ initialSentAt: sent, lastCommercialNotificationAt: sent })), { allow: true, kind: 'reminder' });
  assert.equal((d.evaluateLeadSend(lead({ initialSentAt: sent, remindersSent: 1 })) as any).reason, 'flow_closed');
  assert.equal((d.evaluateLeadSend(lead({ initialSentAt: new Date('2026-10-07T12:00:00Z') })) as any).reason, 'reminder_too_early');
  assert.equal((d.evaluateLeadSend(lead({ conversationReplied: true })) as any).reason, 'conversation_already_open');
});

test('entitlements: limites do plano e queda para Essencial', () => {
  assert.equal(d.PLANS.essencial.maxListings, 2);
  assert.ok(!d.canCreateListing(d.PLANS.essencial, 2));
  assert.equal(d.effectivePlan('profissional', 'suspended').code, 'essencial');
  assert.equal(d.effectivePlan('profissional', 'past_due', { graceDaysLeft: 3 }).code, 'profissional');
  assert.equal(d.effectivePlan('profissional', 'past_due', { graceDaysLeft: 0 }).code, 'essencial');
  const now = new Date('2026-10-08');
  assert.equal(d.effectivePlan('pro_regional', 'cancel_at_period_end', { periodEnd: new Date('2026-10-20'), now }).code, 'pro_regional');
  assert.equal(d.effectivePlan('pro_regional', 'cancel_at_period_end', { periodEnd: new Date('2026-10-01'), now }).code, 'essencial');
});

test('flags: chaves únicas, dependências existentes, sem ciclos; IA e fase B desligadas por padrão', () => {
  const keys = new Set(d.FEATURES.map((f) => f.key));
  assert.equal(keys.size, d.FEATURES.length);
  for (const f of d.FEATURES) {
    for (const dep of f.dependsOn) assert.ok(keys.has(dep), `${f.key} depende de flag inexistente ${dep}`);
    assert.ok(f.owner && f.acceptance.length > 20 && f.opCost, `${f.key} sem dono/critério/custo`);
  }
  const visiting = new Set<string>(), done = new Set<string>();
  const walk = (k: string) => {
    if (done.has(k)) return; if (visiting.has(k)) throw new Error(`ciclo em ${k}`);
    visiting.add(k); d.featureByKey(k)!.dependsOn.forEach(walk); visiting.delete(k); done.add(k);
  };
  keys.forEach(walk);
  assert.equal(d.featureByKey('ai_assistant')!.defaultOn, false);
  for (const f of d.FEATURES.filter((x) => x.phase === 'MVP_B' || x.phase === 'V1' || x.phase === 'V2')) assert.equal(f.defaultOn, false, f.key);
});
