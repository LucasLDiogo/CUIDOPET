/** Contratos de integração. O domínio nunca chama o PSP diretamente (spec §19). */
export interface PixCharge { externalId: string; copyPaste: string; expiresAt: Date; amountCents: number }

export interface MarketplacePaymentProvider {
  readonly name: string;
  /** Cobrança de reserva (fluxo B). Valor sempre em centavos. */
  createBookingPixCharge(input: { orderId: string; amountCents: number; expiresAt: Date }): Promise<PixCharge>;
  verifyWebhook(rawBody: Buffer | string, signatureHeader: string | undefined): boolean;
}

export interface BillingProvider {
  readonly name: string;
  /** Cobrança de assinatura/anúncio da PLATAFORMA (fluxo A): beneficiário é conta da empresa, nunca do prestador. */
  createPlatformPixCharge(input: { orderId: string; amountCents: number; expiresAt: Date }): Promise<PixCharge>;
}
