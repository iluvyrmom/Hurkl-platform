import { ProviderNotConfiguredError } from "../errors";
import type {
  CashPaymentResult,
  CheckoutSessionResult,
  CreateCheckoutParams,
  PaymentProvider,
  RefundResult,
} from "./types";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

/**
 * Stripe-backed implementation. Requires STRIPE_SECRET_KEY.
 *
 * IMPORTANT: not executed against a live Stripe account in this
 * environment — this session had no Stripe credentials for A-1's account
 * (no Stripe MCP connector, no API key). Uses Stripe's documented Checkout
 * Sessions and Refunds REST APIs directly (no SDK dependency added), with
 * every state-changing POST carrying an Idempotency-Key header per Stripe's
 * documented idempotency pattern. Test in Stripe test mode with a real key
 * before any live charge — see README "What's real vs. stubbed."
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe";

  private readonly secretKey: string;

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new ProviderNotConfiguredError("StripePaymentProvider", ["STRIPE_SECRET_KEY"]);
    }
    this.secretKey = secretKey;
  }

  private async post(
    path: string,
    body: URLSearchParams,
    idempotencyKey?: string,
  ): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

    const response = await fetch(`${STRIPE_API_BASE}${path}`, { method: "POST", headers, body });
    if (!response.ok) {
      throw new Error(`Stripe request to ${path} failed (${response.status}): ${await response.text()}`);
    }
    return response.json();
  }

  async createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSessionResult> {
    const body = new URLSearchParams({
      mode: "payment",
      "line_items[0][price_data][currency]": params.currency ?? "usd",
      "line_items[0][price_data][product_data][name]": `Job payment (${params.jobId})`,
      "line_items[0][price_data][unit_amount]": String(Math.round(params.amount * 100)),
      "line_items[0][quantity]": "1",
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      "metadata[jobId]": params.jobId,
    });
    if (params.customerEmail) body.set("customer_email", params.customerEmail);

    const session = await this.post("/checkout/sessions", body, params.idempotencyKey);
    return {
      provider: this.name,
      sessionId: session.id as string,
      checkoutUrl: (session.url as string | null) ?? null,
    };
  }

  async refund(providerPaymentIntentId: string, amount: number): Promise<RefundResult> {
    const body = new URLSearchParams({
      payment_intent: providerPaymentIntentId,
      amount: String(Math.round(amount * 100)),
    });
    const refund = await this.post(
      "/refunds",
      body,
      `refund_${providerPaymentIntentId}_${Math.round(amount * 100)}`,
    );
    return {
      provider: this.name,
      refundId: refund.id as string,
      amount,
      status: refund.status as string,
    };
  }

  async recordCashPayment(_jobId: string, amount: number): Promise<CashPaymentResult> {
    // Cash never touches Stripe.
    return { provider: this.name, amount };
  }
}
