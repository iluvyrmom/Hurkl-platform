import { describe, expect, it } from "vitest";
import {
  customerExplicitlyRequestedOwnerContact,
  recordOwnerEscalation,
  requiresOwnerApproval,
  type EscalationWriter,
} from "./escalation";

describe("customerExplicitlyRequestedOwnerContact", () => {
  it("detects an explicit request for the owner's phone number", () => {
    expect(customerExplicitlyRequestedOwnerContact("Can I get the owner's phone number?")).toBe(
      true,
    );
  });

  it("detects a request to speak to a real person", () => {
    expect(customerExplicitlyRequestedOwnerContact("I'd like to talk to a human please")).toBe(
      true,
    );
  });

  it("does not fire on an ordinary question", () => {
    expect(customerExplicitlyRequestedOwnerContact("What time can you come tomorrow?")).toBe(false);
  });
});

describe("requiresOwnerApproval", () => {
  it("detects a genuine owner-approval scenario (damage claim)", () => {
    expect(requiresOwnerApproval("Your movers damaged my dresser and I want a refund")).toBe(true);
  });

  it("does not fire on a routine pricing question", () => {
    expect(requiresOwnerApproval("How much would a 2-bedroom move cost?")).toBe(false);
  });
});

describe("recordOwnerEscalation", () => {
  function fakeWriter(): { writer: EscalationWriter; inserted: Record<string, unknown>[] } {
    const inserted: Record<string, unknown>[] = [];
    const writer: EscalationWriter = {
      from: () => ({
        insert: (row) => {
          inserted.push(row);
          return Promise.resolve({ error: null });
        },
      }),
    };
    return { writer, inserted };
  }

  it("writes a real, durable escalation row", async () => {
    const { writer, inserted } = fakeWriter();
    await recordOwnerEscalation(writer, {
      companyId: "company-1",
      conversationId: "conv-1",
      reason: "owner_review_requested",
      customerSummary: "Customer reported damage",
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      company_id: "company-1",
      conversation_id: "conv-1",
      reason: "owner_review_requested",
      customer_summary: "Customer reported damage",
    });
  });

  it("throws on a real write failure rather than silently dropping the escalation", async () => {
    const writer: EscalationWriter = {
      from: () => ({
        insert: () => Promise.resolve({ error: { message: "db unavailable" } }),
      }),
    };
    await expect(
      recordOwnerEscalation(writer, {
        companyId: "company-1",
        conversationId: "conv-1",
        reason: "owner_review_requested",
        customerSummary: "x",
      }),
    ).rejects.toThrow("db unavailable");
  });
});
