import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SandboxProvider } from '../src/index.ts';

const p = new SandboxProvider('segredo-de-teste-1234567890');

test('assinatura HMAC: válida passa; adulterada, ausente e malformada falham', () => {
  const body = JSON.stringify({ event_id: 'e1', type: 'PAYMENT_CONFIRMED', payment_id: 'p1' });
  const sig = p.sign(body);
  assert.ok(p.verifyWebhook(body, sig));
  assert.ok(!p.verifyWebhook(body + ' ', sig));
  assert.ok(!p.verifyWebhook(body, undefined));
  assert.ok(!p.verifyWebhook(body, 'zz'));
  assert.ok(!p.verifyWebhook(body, sig.replace(/.$/, sig.endsWith('0') ? '1' : '0')));
  assert.ok(!new SandboxProvider('outro-segredo-de-teste-123').verifyWebhook(body, sig));
});
test('segredo curto é recusado; cobrança exige centavos inteiros positivos', async () => {
  assert.throws(() => new SandboxProvider('curto'));
  await assert.rejects(() => p.createBookingPixCharge({ orderId: 'o', amountCents: 10.5, expiresAt: new Date() }));
  const c = await p.createBookingPixCharge({ orderId: 'o', amountCents: 2400, expiresAt: new Date() });
  assert.match(c.copyPaste, /^SANDBOX-PIX-NAO-PAGAVEL-sbx_/);       // identificado como não pagável
});
test('status do PSP é mapeado explicitamente; desconhecido não mapeia', () => {
  assert.equal(p.mapStatus('CONFIRMED'), 'confirmed');
  assert.equal(p.mapStatus('NOVO_STATUS'), undefined);
});
