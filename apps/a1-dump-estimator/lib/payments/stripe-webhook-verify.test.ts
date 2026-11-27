import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyStripeSignature } from "./stripe-webhook-verify";

const SECRET = "whsec_test_secret";

function signPayload(payload: string, timestamp: number, secret: string): string {
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

describe("verifyStripeSignature", () => {
  it("accepts a correctly signed, recent payload", () => {
    const payload = JSON.stringify({ type: "checkout.session.completed" });
    const header = signPayload(payload, Math.floor(Date.now() / 1000), SECRET);
    expect(verifyStripeSignature(payload, header, SECRET)).toBe(true);
  });

  it("rejects a payload signed with the wrong secret", () => {
    const payload = JSON.stringify({ type: "checkout.session.completed" });
    const header = signPayload(payload, Math.floor(Date.now() / 1000), "whsec_wrong_secret");
    expect(verifyStripeSignature(payload, header, SECRET)).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const payload = JSON.stringify({ type: "checkout.session.completed" });
    const header = signPayload(payload, Math.floor(Date.now() / 1000), SECRET);
    const tamperedPayload = JSON.stringify({ type: "checkout.session.completed", amount: 999999 });
    expect(verifyStripeSignature(tamperedPayload, header, SECRET)).toBe(false);
  });

  it("rejects a stale (replayed) timestamp outside the tolerance window", () => {
    const payload = JSON.stringify({ type: "checkout.session.completed" });
    const staleTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour old
    const header = signPayload(payload, staleTimestamp, SECRET);
    expect(verifyStripeSignature(payload, header, SECRET)).toBe(false);
  });

  it("rejects a malformed signature header", () => {
    expect(verifyStripeSignature("{}", "not-a-valid-header", SECRET)).toBe(false);
  });
});
