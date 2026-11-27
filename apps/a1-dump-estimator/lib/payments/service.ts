import { getPaymentProvider } from "@/lib/providers/payments";
import { getPaymentRepository } from "@/lib/repository/payment-repository";
import { getJobRepository } from "@/lib/repository/job-repository";
import type { PaymentStatus, PaymentTransaction } from "@/lib/domain/payment";

export async function listPaymentsForJob(jobId: string): Promise<PaymentTransaction[]> {
  return getPaymentRepository().listForJob(jobId);
}

export interface CreateCheckoutForJobParams {
  jobId: string;
  businessId: string;
  amount: number;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Creates a fresh Stripe Checkout session for a job and records a
 * `pending` payment row. Each call creates a new session (no attempt to
 * reuse/expire a prior one in Phase 1) — double-submission from the UI is
 * prevented by disabling the "Charge Card" button while a request is in
 * flight, not by this function refusing a second call. The
 * per-call idempotency key still protects against the same click being
 * retried at the network layer from creating two live sessions.
 */
export async function createCheckoutForJob(
  params: CreateCheckoutForJobParams,
): Promise<{ checkoutUrl: string | null; payment: PaymentTransaction }> {
  const provider = getPaymentProvider();
  const idempotencyKey = `job:${params.jobId}:checkout:${Date.now()}`;

  const session = await provider.createCheckoutSession({
    jobId: params.jobId,
    amount: params.amount,
    customerEmail: params.customerEmail,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
    idempotencyKey,
  });

  const payment = await getPaymentRepository().create({
    businessId: params.businessId,
    jobId: params.jobId,
    provider: provider.name,
    method: "card",
    providerSessionId: session.sessionId,
    providerPaymentIntentId: null,
    amount: params.amount,
    currency: "usd",
    status: "pending",
    refundedAmount: 0,
    idempotencyKey,
    recordedByUserId: null,
  });

  return { checkoutUrl: session.checkoutUrl, payment };
}

export interface RecordCashPaymentParams {
  jobId: string;
  businessId: string;
  amount: number;
  recordedByUserId: string | null;
}

/** Owner-recorded fallback — confirmed in person, so no webhook wait is needed; status is 'paid' immediately. */
export async function recordCashPaymentForJob(
  params: RecordCashPaymentParams,
): Promise<PaymentTransaction> {
  const provider = getPaymentProvider();
  await provider.recordCashPayment(params.jobId, params.amount);

  const payment = await getPaymentRepository().create({
    businessId: params.businessId,
    jobId: params.jobId,
    provider: provider.name,
    method: "cash",
    providerSessionId: null,
    providerPaymentIntentId: null,
    amount: params.amount,
    currency: "usd",
    status: "paid",
    refundedAmount: 0,
    idempotencyKey: `job:${params.jobId}:cash:${Date.now()}`,
    recordedByUserId: params.recordedByUserId,
  });

  await getJobRepository().updatePaymentStatus(params.jobId, "paid");
  return payment;
}

function statusAfterRefund(payment: PaymentTransaction, totalRefunded: number): PaymentStatus {
  return totalRefunded >= payment.amount ? "refunded" : "partially_refunded";
}

/** Refund-ready: card refunds go through Stripe's Refunds API; cash refunds are recorded only (the owner already handled the physical cash). */
export async function refundPayment(paymentId: string, amount: number): Promise<PaymentTransaction> {
  const repo = getPaymentRepository();
  const payment = await repo.get(paymentId);
  if (!payment) throw new Error(`Payment ${paymentId} not found`);
  if (payment.status !== "paid" && payment.status !== "partially_refunded") {
    throw new Error(`Payment ${paymentId} is not in a refundable state (${payment.status})`);
  }

  if (payment.method === "card") {
    if (!payment.providerPaymentIntentId) {
      throw new Error("Payment has no provider payment intent yet — it may not be confirmed paid.");
    }
    await getPaymentProvider().refund(payment.providerPaymentIntentId, amount);
  }

  const totalRefunded = payment.refundedAmount + amount;
  const updated = await repo.update(paymentId, {
    refundedAmount: totalRefunded,
    status: statusAfterRefund(payment, totalRefunded),
  });
  await getJobRepository().updatePaymentStatus(updated.jobId, updated.status);
  return updated;
}

interface StripeEvent {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: { object: any };
}

/**
 * Webhook-authoritative payment confirmation — the ONLY code path allowed
 * to move a payment from 'pending' to 'paid'/'failed'. Called exclusively
 * from app/api/stripe/webhook/route.ts after signature verification. Uses
 * the admin (service-role) repositories since a webhook request carries no
 * business-member session for RLS to authorize against.
 */
export async function applyStripeWebhookEvent(event: StripeEvent): Promise<void> {
  const paymentRepo = getPaymentRepository(true);
  const jobRepo = getJobRepository(true);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const payment = await paymentRepo.getBySessionId(session.id);
      if (!payment || payment.status !== "pending") return; // Unknown or already-processed session — idempotent no-op.
      const updated = await paymentRepo.update(payment.id, {
        status: "paid",
        providerPaymentIntentId: session.payment_intent ?? null,
      });
      await jobRepo.updatePaymentStatus(updated.jobId, "paid");
      return;
    }
    case "checkout.session.expired": {
      const session = event.data.object;
      const payment = await paymentRepo.getBySessionId(session.id);
      if (!payment || payment.status !== "pending") return;
      await paymentRepo.update(payment.id, { status: "failed" });
      return;
    }
    case "charge.refunded": {
      const charge = event.data.object;
      const payment = await paymentRepo.getByPaymentIntentId(charge.payment_intent);
      if (!payment) return;
      const totalRefundedFromStripe = charge.amount_refunded / 100;
      if (totalRefundedFromStripe <= payment.refundedAmount) return; // Already applied — idempotent no-op.
      const updated = await paymentRepo.update(payment.id, {
        refundedAmount: totalRefundedFromStripe,
        status: statusAfterRefund(payment, totalRefundedFromStripe),
      });
      await jobRepo.updatePaymentStatus(updated.jobId, updated.status);
      return;
    }
    default:
      // Every other event type is intentionally ignored, not silently
      // mishandled — Stripe sends far more event types than this app acts on.
      return;
  }
}
