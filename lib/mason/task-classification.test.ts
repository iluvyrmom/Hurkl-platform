import { describe, expect, it } from "vitest";
import { classifyMessageTaskType } from "./task-classification";

describe("classifyMessageTaskType", () => {
  it("defaults an ordinary short message to the cheap tier", () => {
    expect(classifyMessageTaskType("hey Mason, what's up?")).toBe("faq_answer");
  });

  it("escalates on an explicit complexity signal word", () => {
    expect(classifyMessageTaskType("what's your recommendation on pricing strategy?")).toBe(
      "complex_business_strategy",
    );
  });

  it("escalates a long message even without a signal word", () => {
    expect(classifyMessageTaskType("x".repeat(300))).toBe("complex_business_strategy");
  });
});
