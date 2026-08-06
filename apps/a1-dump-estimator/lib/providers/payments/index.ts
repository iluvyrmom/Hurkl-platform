import type { PaymentProvider } from "./types";
import { MockPaymentProvider } from "./mock-provider";
import { StripePaymentProvider } from "./stripe-provider";

export type { PaymentProvider, PaymentIntentResult, PaymentMethod } from "./types";

export function getPaymentProvider(): PaymentProvider {
  if (process.env.STRIPE_SECRET_KEY) {
    return new StripePaymentProvider();
  }
  return new MockPaymentProvider();
}
