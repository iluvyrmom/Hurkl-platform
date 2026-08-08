import type {
  CashPaymentResult,
  CheckoutSessionResult,
  CreateCheckoutParams,
  PaymentProvider,
  RefundResult,
} from "./types";

/** No money moves. Default until STRIPE_SECRET_KEY is configured. */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  async createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSessionResult> {
    return {
      provider: this.name,
      sessionId: `mock_session_${params.jobId}_${Date.now()}`,
      checkoutUrl: null,
    };
  }

  async refund(providerPaymentIntentId: string, amount: number): Promise<RefundResult> {
    return {
      provider: this.name,
      refundId: `mock_refund_${providerPaymentIntentId}_${Date.now()}`,
      amount,
      status: "succeeded",
    };
  }

  async recordCashPayment(_jobId: string, amount: number): Promise<CashPaymentResult> {
    return { provider: this.name, amount };
  }
}
