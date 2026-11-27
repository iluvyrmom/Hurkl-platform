import { NextResponse, type NextRequest } from "next/server";
import { verifyStripeSignature } from "@/lib/payments/stripe-webhook-verify";
import { applyStripeWebhookEvent } from "@/lib/payments/service";

// Needs Node's crypto module (timingSafeEqual) and a raw, unparsed body for
// signature verification — must run on the Node runtime, not Edge.
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook not configured" }, { status: 500 });
  }

  const signatureHeader = request.headers.get("stripe-signature");
  if (!signatureHeader) {
    return NextResponse.json({ error: "Missing Stripe-Signature header" }, { status: 400 });
  }

  // Raw text, not request.json() — signature verification requires the
  // exact bytes Stripe signed, before any parsing.
  const rawBody = await request.text();

  if (!verifyStripeSignature(rawBody, signatureHeader, webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { type: string; data: { object: unknown } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  await applyStripeWebhookEvent(event as Parameters<typeof applyStripeWebhookEvent>[0]);

  return NextResponse.json({ received: true });
}
