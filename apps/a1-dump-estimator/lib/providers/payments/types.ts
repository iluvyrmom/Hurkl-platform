export type PaymentMethod = "card" | "cash";

export interface PaymentIntentResult {
  provider: string;
  paymentIntentId: string;
  clientSecret: string | null;
  amount: number;
  status: "requires_payment" | "processing" | "succeeded" | "failed";
}

/**
 * Abstraction over "collect payment for a job" — digital-first, cash
 * optional, no payment logic duplicated elsewhere (per project
 * requirement). Stripe today; interface stays stable if a second
 * processor is ever added.
 */
export interface PaymentProvider {
  readonly name: string;
  createPaymentIntent(jobId: string, amount: number): Promise<PaymentIntentResult>;
  recordCashPayment(jobId: string, amount: number): Promise<PaymentIntentResult>;
}
