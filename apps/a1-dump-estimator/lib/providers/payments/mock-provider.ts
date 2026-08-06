import type { PaymentIntentResult, PaymentProvider } from "./types";

/** Records an intent in memory only — no money moves. Default until Stripe keys are configured. */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  async createPaymentIntent(jobId: string, amount: number): Promise<PaymentIntentResult> {
    return {
      provider: this.name,
      paymentIntentId: `mock_pi_${jobId}_${Date.now()}`,
      clientSecret: null,
      amount,
      status: "requires_payment",
    };
  }

  async recordCashPayment(jobId: string, amount: number): Promise<PaymentIntentResult> {
    return {
      provider: this.name,
      paymentIntentId: `mock_cash_${jobId}_${Date.now()}`,
      clientSecret: null,
      amount,
      status: "succeeded",
    };
  }
}
