import { describe, expect, it } from "vitest";
import { MockAIModelProvider } from "./ai-model-provider";
import { MockEmailProvider } from "./email-provider";
import { MockPaymentProvider } from "./payment-provider";

describe("MockAIModelProvider", () => {
  it("makes no network calls and returns a deterministic response, recording the request", async () => {
    const provider = new MockAIModelProvider();
    const response = await provider.complete({
      tier: "low_cost",
      systemPrompt: "You are Mason.",
      userMessage: "What are your hours?",
    });
    expect(response.tier).toBe("low_cost");
    expect(response.text).toContain("What are your hours?");
    expect(provider.requests).toHaveLength(1);
  });
});

describe("MockEmailProvider", () => {
  it("records sent emails", async () => {
    const provider = new MockEmailProvider();
    await provider.send({ to: "customer@example.com", subject: "Invoice", bodyText: "..." });
    expect(provider.sentMessages).toHaveLength(1);
    expect(provider.sentMessages[0].to).toBe("customer@example.com");
  });
});

describe("MockPaymentProvider", () => {
  it("creates a mock payment link and records the request", async () => {
    const provider = new MockPaymentProvider();
    const link = await provider.createPaymentLink({
      invoiceId: "invoice-1",
      amountCents: 10000,
      description: "Moving job",
    });
    expect(link.url).toContain("invoice-1");
    expect(provider.createdLinks).toHaveLength(1);
  });
});
