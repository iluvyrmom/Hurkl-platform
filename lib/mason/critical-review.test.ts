import { describe, expect, it } from "vitest";
import { reviewMasonReply } from "./critical-review";
import { resolveDiscountAuthority } from "./discount-authority";

describe("reviewMasonReply", () => {
  const fivePercentAuthority = resolveDiscountAuthority(5);
  const noAuthority = resolveDiscountAuthority(null);

  it("catches the exact reported production failure: an invented flat dollar discount", () => {
    const result = reviewMasonReply(
      "I don't have information on a veteran discount, but I can offer a $75 discount off the flat rate.",
      fivePercentAuthority,
    );
    expect(result.ok).toBe(false);
    expect(result.violations).toContain("unverified_dollar_discount_claim");
  });

  it("rejects any bare dollar discount claim, even a small one, because no verified price ever reaches Mason today", () => {
    const result = reviewMasonReply("I can knock $10 off for you.", fivePercentAuthority);
    expect(result.ok).toBe(false);
    expect(result.violations).toContain("unverified_dollar_discount_claim");
  });

  it("allows a percentage discount claim within authority", () => {
    const result = reviewMasonReply(
      "I can offer a 3% discount on this booking.",
      fivePercentAuthority,
    );
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("rejects a percentage discount claim above the configured ceiling", () => {
    const result = reviewMasonReply(
      "I can offer a 10% discount on this booking.",
      fivePercentAuthority,
    );
    expect(result.ok).toBe(false);
    expect(result.violations).toContain("discount_percent_exceeds_authority");
  });

  it("Mason cannot exceed 5% even when a company rule somehow claims more (defense in depth against the authority object itself)", () => {
    const result = reviewMasonReply("I can offer a 6% discount.", fivePercentAuthority);
    expect(result.ok).toBe(false);
    expect(result.violations).toContain("discount_percent_exceeds_authority");
  });

  it("rejects any percentage discount at all when the company has no discretionary authority", () => {
    const result = reviewMasonReply("I can offer a 2% discount.", noAuthority);
    expect(result.ok).toBe(false);
    expect(result.violations).toContain("discount_percent_exceeds_authority");
  });

  it("passes a normal reply with no discount claim", () => {
    const result = reviewMasonReply(
      "Sure, I can help schedule your move for next Tuesday.",
      fivePercentAuthority,
    );
    expect(result.ok).toBe(true);
  });

  it("still catches identity-rule violations (the pre-existing, previously-unwired check)", () => {
    const result = reviewMasonReply(
      "I am an AI language model and cannot help with that.",
      fivePercentAuthority,
    );
    expect(result.ok).toBe(false);
    expect(result.violations).toContain("identity_rule_violation");
  });
});
