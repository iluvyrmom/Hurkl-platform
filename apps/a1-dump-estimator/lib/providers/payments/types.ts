export interface CreateCheckoutParams {
  jobId: string;
  amount: number; // dollars
  currency?: string;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
  /** Passed through as an idempotency key on the underlying API call — retrying never creates a second live session. */
  idempotencyKey: string;
}

export interface CheckoutSessionResult {
  provider: string;
  sessionId: string;
  /** Hosted payment page URL to text/email to the customer. Null for the mock provider — nothing to pay yet. */
  checkoutUrl: string | null;
}

export interface RefundResult {
  provider: string;
  refundId: string;
  amount: number;
  status: string;
}

export interface CashPaymentResult {
  provider: string;
  amount: number;
}

/**
 * Abstraction over "collect payment for a job" — digital-first via a
 * hosted Checkout session, cash as an owner-recorded fallback. Stripe
 * today; interface stays stable if a second processor is ever added.
 * Payment *status* is never decided here — see lib/payments/service.ts and
 * the webhook handler, which are the only writers of PaymentTransaction.status.
 */
export interface PaymentProvider {
  readonly name: string;
  createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSessionResult>;
  refund(providerPaymentIntentId: string, amount: number): Promise<RefundResult>;
  recordCashPayment(jobId: string, amount: number): Promise<CashPaymentResult>;
}
