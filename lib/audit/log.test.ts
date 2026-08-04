import { describe, expect, it, vi } from "vitest";
import { type AuditLogWriter, recordAuditLogEntry } from "./log";

function fakeWriter(result: { error: { message: string } | null }) {
  const insert = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ insert });
  return { client: { from } as unknown as AuditLogWriter, insert, from };
}

describe("recordAuditLogEntry", () => {
  it("inserts a row shaped for the audit_log table", async () => {
    const { client, insert, from } = fakeWriter({ error: null });

    await recordAuditLogEntry(client, {
      companyId: "company-1",
      actorUserId: "user-1",
      action: "sent_invoice",
      autonomyTier: "tier_1_automatic",
      policyReference: "invoice_auto_send_policy",
      subjectType: "invoice",
      subjectId: "invoice-1",
      metadata: { amountCents: 16500 },
    });

    expect(from).toHaveBeenCalledWith("audit_log");
    expect(insert).toHaveBeenCalledWith({
      company_id: "company-1",
      actor_user_id: "user-1",
      action: "sent_invoice",
      autonomy_tier: "tier_1_automatic",
      policy_reference: "invoice_auto_send_policy",
      subject_type: "invoice",
      subject_id: "invoice-1",
      metadata: { amountCents: 16500 },
    });
  });

  it("defaults optional fields to null/empty rather than omitting them", async () => {
    const { client, insert } = fakeWriter({ error: null });

    await recordAuditLogEntry(client, {
      companyId: "company-1",
      action: "created_lead",
      autonomyTier: "tier_1_automatic",
    });

    expect(insert).toHaveBeenCalledWith({
      company_id: "company-1",
      actor_user_id: null,
      action: "created_lead",
      autonomy_tier: "tier_1_automatic",
      policy_reference: null,
      subject_type: null,
      subject_id: null,
      metadata: {},
    });
  });

  it("throws when the insert fails, rather than silently swallowing the error", async () => {
    const { client } = fakeWriter({ error: { message: "connection refused" } });

    await expect(
      recordAuditLogEntry(client, {
        companyId: "company-1",
        action: "created_lead",
        autonomyTier: "tier_1_automatic",
      }),
    ).rejects.toThrow(/connection refused/);
  });
});
