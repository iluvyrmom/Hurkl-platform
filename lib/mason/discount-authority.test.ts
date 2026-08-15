import { describe, expect, it } from "vitest";
import {
  DISCRETIONARY_DISCOUNT_HARD_CEILING_PERCENT,
  DISCRETIONARY_DISCOUNT_TYPICAL_PERCENT,
  computeDiscountAmountCents,
  isWithinDiscountAuthority,
  resolveDiscountAuthority,
} from "./discount-authority";

describe("DISCRETIONARY_DISCOUNT_TYPICAL_PERCENT", () => {
  it("is the founder-specified 'typically useful to close a qualified job' figure, and stays at or below the hard ceiling", () => {
    expect(DISCRETIONARY_DISCOUNT_TYPICAL_PERCENT).toBe(3);
    expect(DISCRETIONARY_DISCOUNT_TYPICAL_PERCENT).toBeLessThanOrEqual(
      DISCRETIONARY_DISCOUNT_HARD_CEILING_PERCENT,
    );
  });
});

describe("resolveDiscountAuthority", () => {
  it("defaults to zero discretion when no owner rule is configured", () => {
    expect(resolveDiscountAuthority(null).maxDiscretionaryPercent).toBe(0);
    expect(resolveDiscountAuthority(undefined).maxDiscretionaryPercent).toBe(0);
  });

  it("passes through a configured value at or below the hard ceiling", () => {
    expect(resolveDiscountAuthority(5).maxDiscretionaryPercent).toBe(5);
    expect(resolveDiscountAuthority(3).maxDiscretionaryPercent).toBe(3);
    expect(resolveDiscountAuthority(0).maxDiscretionaryPercent).toBe(0);
  });

  it("clamps a configured value above the hard ceiling down to it — no owner rule can exceed 5% without a code change", () => {
    expect(resolveDiscountAuthority(50).maxDiscretionaryPercent).toBe(
      DISCRETIONARY_DISCOUNT_HARD_CEILING_PERCENT,
    );
  });

  it("clamps a negative configured value up to zero", () => {
    expect(resolveDiscountAuthority(-10).maxDiscretionaryPercent).toBe(0);
  });
});

describe("isWithinDiscountAuthority", () => {
  const authority = resolveDiscountAuthority(5);

  it("Mason cannot exceed the configured ceiling", () => {
    expect(isWithinDiscountAuthority(5, authority)).toBe(true);
    expect(isWithinDiscountAuthority(5.01, authority)).toBe(false);
    expect(isWithinDiscountAuthority(6, authority)).toBe(false);
  });

  it("rejects a negative percent", () => {
    expect(isWithinDiscountAuthority(-1, authority)).toBe(false);
  });

  it("a company with no configured authority has none", () => {
    const none = resolveDiscountAuthority(null);
    expect(isWithinDiscountAuthority(1, none)).toBe(false);
    expect(isWithinDiscountAuthority(0, none)).toBe(true);
  });
});

describe("computeDiscountAmountCents", () => {
  it("computes a real dollar figure from a real price and percentage — the only way a discount amount may be derived", () => {
    // $500 at 3% = $15, matching the founder's own worked example.
    expect(computeDiscountAmountCents(50000, 3)).toBe(1500);
  });

  it("rounds to the nearest cent", () => {
    expect(computeDiscountAmountCents(10000, 3)).toBe(300);
    expect(computeDiscountAmountCents(9999, 5)).toBe(500); // 499.95 -> 500
  });

  it("a 0% discount is zero dollars", () => {
    expect(computeDiscountAmountCents(50000, 0)).toBe(0);
  });
});
