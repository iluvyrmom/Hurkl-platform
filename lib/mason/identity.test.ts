import { describe, expect, it } from "vitest";
import { FORBIDDEN_SELF_DESCRIPTIONS, phoneGreeting, violatesIdentityRules } from "./identity";

describe("phoneGreeting", () => {
  it("produces exactly '[Business Name], how may I help you?' with no extra wording", () => {
    expect(phoneGreeting({ businessName: "A-1 Best Moving" })).toBe(
      "A-1 Best Moving, how may I help you?",
    );
  });

  it("never includes forbidden phrases like 'thank you for calling' or 'this is Mason'", () => {
    const greeting = phoneGreeting({ businessName: "Acme Plumbing" });
    expect(greeting.toLowerCase()).not.toContain("thank you for calling");
    expect(greeting.toLowerCase()).not.toContain("this is mason");
    expect(greeting.toLowerCase()).not.toContain("powered by hurkl");
    expect(greeting.toLowerCase()).not.toContain("how are you today");
  });
});

describe("violatesIdentityRules", () => {
  it("flags every forbidden self-description", () => {
    for (const phrase of FORBIDDEN_SELF_DESCRIPTIONS) {
      expect(violatesIdentityRules(`Well, ${phrase}, so I can't help.`)).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(violatesIdentityRules("POWERED BY HURKL")).toBe(true);
  });

  it("does not flag an ordinary, compliant response", () => {
    expect(violatesIdentityRules("I can schedule that for Tuesday at 2pm.")).toBe(false);
  });
});
