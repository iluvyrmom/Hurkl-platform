import { createHmac, timingSafeEqual } from "node:crypto";

/** How old a webhook timestamp can be before it's rejected as a possible replay, per Stripe's documented tolerance. */
const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * Verifies a Stripe webhook signature per Stripe's documented algorithm
 * (https://stripe.com/docs/webhooks#verify-manually), implemented directly
 * against Node's crypto module rather than the `stripe` SDK, consistent
 * with this app's no-SDK provider pattern. Not executed against a real
 * Stripe webhook in this environment — verify against a live test-mode
 * webhook before relying on it.
 *
 * The `Stripe-Signature` header looks like: `t=<timestamp>,v1=<hex-hmac>`.
 * The signed payload is `${timestamp}.${rawBody}`, HMAC-SHA256'd with the
 * webhook signing secret. Comparison is constant-time to avoid a timing
 * side-channel, and the timestamp is checked against a tolerance window to
 * reject replayed requests.
 */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
): boolean {
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    }),
  );

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > toleranceSeconds) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSignature = createHmac("sha256", webhookSecret).update(signedPayload).digest("hex");

  const expected = Buffer.from(expectedSignature, "hex");
  const actual = Buffer.from(signature, "hex");
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}
