import { describe, expect, it } from "vitest";
import { CRITICAL_REVIEW_FALLBACK_REPLY } from "./critical-review";
import { resolveDiscountAuthority } from "./discount-authority";
import { reviewWork } from "./critic";

const codes = (v: ReturnType<typeof reviewWork>) => v.issues.map((i) => i.code);

describe("reviewWork", () => {
  it("passes a normal customer reply", () => {
    const v = reviewWork({
      kind: "customer_reply",
      text: "Happy to help you plan your move for Tuesday.",
    });
    expect(v.verdict).toBe("PASS");
    expect(v.issues).toHaveLength(0);
  });

  it("blocks empty output", () => {
    const v = reviewWork({ kind: "owner_message", text: "   " });
    expect(v.verdict).toBe("BLOCK");
    expect(codes(v)).toContain("empty_output");
  });

  describe("reuses the live customer-reply rules", () => {
    it("blocks an invented dollar discount and returns the fallback reply", () => {
      const v = reviewWork({ kind: "customer_reply", text: "I can do $75 off the flat rate." });
      expect(v.verdict).toBe("BLOCK");
      expect(codes(v)).toContain("unverified_dollar_discount_claim");
      expect(v.fallbackReply).toBe(CRITICAL_REVIEW_FALLBACK_REPLY);
    });

    it("allows a percent discount inside authority and blocks one outside it", () => {
      const ctx = { discountAuthority: resolveDiscountAuthority(5) };
      expect(
        reviewWork({ kind: "customer_reply", text: "I can offer 3% off.", context: ctx }).verdict,
      ).toBe("PASS");
      const over = reviewWork({
        kind: "customer_reply",
        text: "I can offer 10% off.",
        context: ctx,
      });
      expect(over.verdict).toBe("BLOCK");
      expect(codes(over)).toContain("discount_percent_exceeds_authority");
    });

    it("defaults to zero discount authority when none is supplied", () => {
      const v = reviewWork({ kind: "customer_reply", text: "I can offer 2% off." });
      expect(codes(v)).toContain("discount_percent_exceeds_authority");
    });

    it("does not give a fallback reply for non-customer output", () => {
      const v = reviewWork({ kind: "owner_message", text: "I have sent the quote." });
      expect(v.verdict).toBe("BLOCK");
      expect(v.fallbackReply).toBeUndefined();
    });
  });

  describe("internals", () => {
    it("blocks mentions of agents, prompts and AI vendors to customers and owners", () => {
      for (const text of [
        "Let me ask our HAL specialist.",
        "My sub-agent checked it.",
        "That's in my system prompt.",
        "I'm built on Claude.",
        "Powered by Anthropic.",
      ]) {
        expect(codes(reviewWork({ kind: "customer_reply", text }))).toContain("internals_exposed");
        expect(codes(reviewWork({ kind: "owner_message", text }))).toContain("internals_exposed");
      }
    });

    it("does not flag a customer named Hal", () => {
      const v = reviewWork({ kind: "customer_reply", text: "Thanks Hal, see you Tuesday." });
      expect(v.verdict).toBe("PASS");
    });

    it("allows internal terms in internal specialist reports", () => {
      const v = reviewWork({
        kind: "specialist_report",
        text: "The HAL specialist found two options.",
      });
      expect(codes(v)).not.toContain("internals_exposed");
    });
  });

  describe("completion claims", () => {
    it("blocks 'done' claims that nothing confirms", () => {
      for (const text of [
        "I've sent the confirmation email.",
        "Your appointment is confirmed for Friday.",
        "I've booked your move.",
        "Your deposit has been received.",
      ]) {
        const v = reviewWork({ kind: "customer_reply", text });
        expect(v.verdict).toBe("BLOCK");
        expect(codes(v).some((c) => c.startsWith("unverified_completion_claim"))).toBe(true);
      }
    });

    it("allows the claim once the action is verified", () => {
      const v = reviewWork({
        kind: "customer_reply",
        text: "Your appointment is confirmed for Friday.",
        context: { verifiedActions: ["booking_confirmed"] },
      });
      expect(v.verdict).toBe("PASS");
    });

    it("a verified action does not cover a different claim", () => {
      const v = reviewWork({
        kind: "customer_reply",
        text: "Your deposit has been received.",
        context: { verifiedActions: ["booking_confirmed"] },
      });
      expect(codes(v)).toContain("unverified_completion_claim:payment_received");
    });

    it("does not flag plans or offers", () => {
      const v = reviewWork({
        kind: "customer_reply",
        text: "I can schedule that for you once I have your address.",
      });
      expect(v.verdict).toBe("PASS");
    });

    it("blocks an unverified deploy claim in a work handoff", () => {
      const v = reviewWork({
        kind: "work_handoff",
        text: "Deployed the new page.",
        evidence: ["screenshot.png"],
      });
      expect(codes(v)).toContain("unverified_completion_claim:deployed");
    });
  });

  describe("prices", () => {
    it("reports the price check as skipped when no verified prices are supplied", () => {
      const v = reviewWork({ kind: "customer_reply", text: "It's $50 an hour." });
      expect(v.checksSkipped).toContain("price_verification");
      expect(v.verdict).toBe("PASS");
    });

    it("blocks amounts missing from the verified list", () => {
      const v = reviewWork({
        kind: "customer_reply",
        text: "It's $50 an hour, or $400 for the day.",
        context: { verifiedDollarAmounts: [50, 350] },
      });
      expect(v.verdict).toBe("BLOCK");
      expect(codes(v)).toContain("unverified_price_claim");
      expect(v.issues.find((i) => i.code === "unverified_price_claim")?.detail).toContain("$400");
      expect(v.checksSkipped).not.toContain("price_verification");
    });

    it("accepts verified amounts including thousands separators and cents", () => {
      const v = reviewWork({
        kind: "owner_message",
        text: "The flat day is $1,000 and the fee is $12.50.",
        context: { verifiedDollarAmounts: [1000, 12.5] },
      });
      expect(v.verdict).toBe("PASS");
    });
  });

  describe("promises and placeholders", () => {
    it("asks for a fix on guarantees", () => {
      const v = reviewWork({ kind: "customer_reply", text: "We guarantee nothing will break." });
      expect(v.verdict).toBe("FIX");
      expect(codes(v)).toContain("unauthorized_promise");
    });

    it("asks for a fix on placeholder text", () => {
      for (const text of ["Hi [your name], welcome.", "Hello {{first_name}}", "TODO write this"]) {
        expect(reviewWork({ kind: "owner_message", text }).verdict).toBe("FIX");
      }
    });
  });

  describe("work handoffs", () => {
    it("blocks a handoff with no evidence", () => {
      const v = reviewWork({ kind: "work_handoff", text: "All done, works great." });
      expect(v.verdict).toBe("BLOCK");
      expect(codes(v)).toContain("done_without_proof");
    });

    it("treats blank evidence entries as no evidence", () => {
      const v = reviewWork({ kind: "work_handoff", text: "Finished.", evidence: ["", "  "] });
      expect(codes(v)).toContain("done_without_proof");
    });

    it("passes a handoff with real evidence", () => {
      const v = reviewWork({
        kind: "work_handoff",
        text: "Built the booking page; tests pass.",
        evidence: ["preview: https://example.test/preview", "vitest: 42 passed"],
      });
      expect(v.verdict).toBe("PASS");
    });
  });

  it("BLOCK outranks FIX when both are present", () => {
    const v = reviewWork({
      kind: "customer_reply",
      text: "We guarantee it. I've booked your move.",
    });
    expect(codes(v)).toContain("unauthorized_promise");
    expect(v.verdict).toBe("BLOCK");
  });
});
