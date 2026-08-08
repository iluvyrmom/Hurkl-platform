export type PaymentMethod = "card" | "cash";

export type PaymentStatus =
  | "pending" // checkout session created, not yet paid
  | "paid"
  | "refunded"
  | "partially_refunded"
  | "failed";

/**
 * One row per payment attempt for a job. `idempotencyKey` is unique —
 * retrying "charge this job" never creates a second live checkout session
 * or double-charges; it returns the existing pending/paid record instead.
 * Status transitions from `pending` to `paid`/`failed` are only ever made
 * by the Stripe webhook handler (webhook-authoritative), never by the
 * client redirect back from Checkout — a customer closing the tab on the
 * success page must not be trusted as proof of payment.
 */
export interface PaymentTransaction {
  id: string;
  businessId: string;
  jobId: string;
  provider: string;
  method: PaymentMethod;
  providerSessionId: string | null;
  providerPaymentIntentId: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  refundedAmount: number;
  idempotencyKey: string;
  recordedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}
