export interface PaymentLinkRequest {
  invoiceId: string;
  amountCents: number;
  description: string;
}

export interface PaymentLinkResult {
  url: string;
  expiresAt: string;
}

/**
 * Provider-independent interface for invoice payment links (Skill 5).
 * No real payment processor is connected — mock only, per explicit
 * founder decision. Real activation requires real credentials and is a
 * Tier-2/paid-infrastructure decision (SECURITY.md §4, CLAUDE.md's cost
 * policy), never assumed from this interface's existence.
 */
export interface PaymentProvider {
  createPaymentLink(request: PaymentLinkRequest): Promise<PaymentLinkResult>;
}

export class MockPaymentProvider implements PaymentProvider {
  public readonly createdLinks: PaymentLinkRequest[] = [];

  async createPaymentLink(request: PaymentLinkRequest): Promise<PaymentLinkResult> {
    this.createdLinks.push(request);
    return {
      url: `https://mock-payments.invalid/pay/${request.invoiceId}`,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
    };
  }
}
