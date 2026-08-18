import { describe, expect, it } from "vitest";
import { needsSpecialReceiptReview } from "./types";

describe("needsSpecialReceiptReview", () => {
  it("flags handwritten receipts", () => {
    expect(needsSpecialReceiptReview({ receiptFormat: "handwritten" })).toBe(true);
  });

  it("flags unsupported receipts", () => {
    expect(needsSpecialReceiptReview({ receiptFormat: "unsupported" })).toBe(true);
  });

  it("does not flag printed receipts", () => {
    expect(needsSpecialReceiptReview({ receiptFormat: "printed" })).toBe(false);
  });

  it("does not flag unknown-format receipts (e.g. the mock provider)", () => {
    expect(needsSpecialReceiptReview({ receiptFormat: "unknown" })).toBe(false);
  });
});
