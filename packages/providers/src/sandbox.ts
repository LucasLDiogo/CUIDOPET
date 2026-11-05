import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { BillingProvider, MarketplacePaymentProvider, PixCharge } from './types.ts';
import { pspPaymentStatusMap } from '../../domain/src/index.ts';

/**
 * Simulador DETERMINÍSTICO de PSP para desenvolvimento/testes. Não move dinheiro e não representa taxas,
 * prazos ou regras de nenhum PSP real. Credenciais reais exigem contrato (ver docs/runbooks/psp.md).
 */
export class SandboxProvider implements MarketplacePaymentProvider, BillingProvider {
  readonly name = 'sandbox';
  private readonly secret: string;
  constructor(secret: string) {
    if (!secret || secret.length < 16) throw new Error('segredo do webhook sandbox deve ter ao menos 16 caracteres');
    this.secret = secret;
  }

  async createBookingPixCharge(i: { orderId: string; amountCents: number; expiresAt: Date }): Promise<PixCharge> {
    return this.charge(i);
  }
  async createPlatformPixCharge(i: { orderId: string; amountCents: number; expiresAt: Date }): Promise<PixCharge> {
    return this.charge(i);
  }
  private charge(i: { orderId: string; amountCents: number; expiresAt: Date }): PixCharge {
    if (!Number.isSafeInteger(i.amountCents) || i.amountCents <= 0) throw new RangeError('amountCents inválido');
    const externalId = `sbx_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    return { externalId, copyPaste: `SANDBOX-PIX-NAO-PAGAVEL-${externalId}`, expiresAt: i.expiresAt, amountCents: i.amountCents };
  }

  sign(rawBody: Buffer | string): string {
    return createHmac('sha256', this.secret).update(rawBody).digest('hex');
  }

  verifyWebhook(rawBody: Buffer | string, signatureHeader: string | undefined): boolean {
    if (!signatureHeader || !/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
    const expected = Buffer.from(this.sign(rawBody), 'hex');
    const got = Buffer.from(signatureHeader, 'hex');
    return expected.length === got.length && timingSafeEqual(expected, got);
  }

  /** Mapeamento explícito do status do PSP → estado interno; desconhecido ⇒ undefined (revisão manual). */
  mapStatus(pspStatus: string | undefined) {
    return pspStatus ? (pspPaymentStatusMap.sandbox as Record<string, string>)[pspStatus] : undefined;
  }
}
