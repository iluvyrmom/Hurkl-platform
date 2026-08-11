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

  it("does not escalate a long but ordinary message that has no complexity signal", () => {
    const longOrdinaryMessage =
      "Hi Mason, just wanted to give you the full details for our move: we're a family of four moving from a 3-bedroom house " +
      "to a townhouse across town, we have a piano, a washer and dryer, several large bookshelves, and about 40 boxes already " +
      "packed. We'd like to schedule for a weekend if at all possible and would appreciate a call back to confirm the time.";
    expect(longOrdinaryMessage.length).toBeGreaterThan(280);
    expect(classifyMessageTaskType(longOrdinaryMessage)).toBe("faq_answer");
  });

  it("still escalates a long message that also contains a complexity signal word", () => {
    const longComplexMessage = "x".repeat(300) + " can you recommend a strategy for this?";
    expect(classifyMessageTaskType(longComplexMessage)).toBe("complex_business_strategy");
  });
});
