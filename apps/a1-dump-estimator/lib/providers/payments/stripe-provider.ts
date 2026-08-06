import { ProviderNotConfiguredError } from "../errors";
import type { PaymentIntentResult, PaymentProvider } from "./types";

/**
 * Stripe-backed implementation. Requires STRIPE_SECRET_KEY.
 *
 * IMPORTANT: not executed against a live Stripe account in this
 * environment — no paid infrastructure was activated to build Phase 1.
 * Uses Stripe's REST API directly (no SDK dependency added yet) following
 * the documented PaymentIntents flow; verify against current Stripe API
 * docs and test in Stripe test mode before any real charge.
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

  async createPaymentIntent(jobId: string, amount: number): Promise<PaymentIntentResult> {
    const body = new URLSearchParams({
      amount: String(Math.round(amount * 100)),
      currency: "usd",
      "metadata[jobId]": jobId,
    });

    const response = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Stripe request failed (${response.status}): ${await response.text()}`);
    }

    const intent = await response.json();
    return {
      provider: this.name,
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      amount,
      status: intent.status === "succeeded" ? "succeeded" : "requires_payment",
    };
  }

  async recordCashPayment(jobId: string, amount: number): Promise<PaymentIntentResult> {
    // Cash never touches Stripe — this just gives cash payments the same
    // typed shape as a card payment so the rest of the app doesn't branch
    // on payment method.
    return {
      provider: this.name,
      paymentIntentId: `cash_${jobId}_${Date.now()}`,
      clientSecret: null,
      amount,
      status: "succeeded",
    };
  }
}
