import { describe, expect, it } from "vitest";
import {
  LeadValidationError,
  getCompanyPublicProfile,
  submitLead,
  validateLeadSubmission,
  type CompanyProfileReader,
  type LeadSubmitter,
} from "./leads";

const VALID = {
  companySlug: "a1-best-moving",
  name: "Jane Prospect",
  phone: "555-123-4567",
};

describe("validateLeadSubmission", () => {
  it("accepts a minimal valid submission", () => {
    expect(() => validateLeadSubmission(VALID)).not.toThrow();
  });

  it("accepts email-only contact info", () => {
    expect(() =>
      validateLeadSubmission({ ...VALID, phone: undefined, email: "jane@example.com" }),
    ).not.toThrow();
  });

  it("rejects a missing companySlug", () => {
    expect(() => validateLeadSubmission({ ...VALID, companySlug: "" })).toThrow(
      LeadValidationError,
    );
  });

  it("rejects a missing name", () => {
    expect(() => validateLeadSubmission({ ...VALID, name: "  " })).toThrow(LeadValidationError);
  });

  it("rejects a name that's too long", () => {
    expect(() => validateLeadSubmission({ ...VALID, name: "x".repeat(201) })).toThrow(/too long/i);
  });

  it("rejects when neither phone nor email is given", () => {
    expect(() => validateLeadSubmission({ ...VALID, phone: undefined })).toThrow(
      /phone or email is required/i,
    );
  });

  it("rejects an implausible email", () => {
    expect(() =>
      validateLeadSubmission({ ...VALID, phone: undefined, email: "not-an-email" }),
    ).toThrow(/email does not look valid/i);
  });

  it("rejects an overly long free-text field", () => {
    expect(() => validateLeadSubmission({ ...VALID, notes: "x".repeat(2001) })).toThrow(
      /too long/i,
    );
  });
});

describe("submitLead", () => {
  it("validates before calling the RPC", async () => {
    const client: LeadSubmitter = { rpc: async () => ({ data: null, error: null }) };
    await expect(submitLead(client, { ...VALID, name: "" })).rejects.toThrow(LeadValidationError);
  });

  it("calls submit_lead with snake_case args and returns the new lead id", async () => {
    const seenCalls: { fn: string; args: Record<string, unknown> }[] = [];
    const client: LeadSubmitter = {
      rpc: async (fn, args) => {
        seenCalls.push({ fn, args });
        return { data: "lead-123", error: null };
      },
    };

    const id = await submitLead(client, VALID);

    expect(id).toBe("lead-123");
    expect(seenCalls).toHaveLength(1);
    expect(seenCalls[0].fn).toBe("submit_lead");
    expect(seenCalls[0].args).toMatchObject({
      p_company_slug: "a1-best-moving",
      p_name: "Jane Prospect",
      p_phone: "555-123-4567",
      p_email: null,
      p_source: "website",
    });
  });

  it("throws when the RPC returns an error", async () => {
    const client: LeadSubmitter = {
      rpc: async () => ({ data: null, error: { message: "boom" } }),
    };
    await expect(submitLead(client, VALID)).rejects.toThrow(/boom/);
  });
});

describe("getCompanyPublicProfile", () => {
  it("returns the profile when found", async () => {
    const profile = {
      name: "A-1 Best Moving LLC",
      phone: "971-777-6660",
      email: null,
      slogan: null,
    };
    const client: CompanyProfileReader = {
      rpc: async () => ({ data: [profile], error: null }),
    };
    await expect(getCompanyPublicProfile(client, "a1-best-moving")).resolves.toEqual(profile);
  });

  it("returns null when no company matches", async () => {
    const client: CompanyProfileReader = {
      rpc: async () => ({ data: [], error: null }),
    };
    await expect(getCompanyPublicProfile(client, "unknown")).resolves.toBeNull();
  });

  it("returns null on an RPC error", async () => {
    const client: CompanyProfileReader = {
      rpc: async () => ({ data: null, error: { message: "boom" } }),
    };
    await expect(getCompanyPublicProfile(client, "a1-best-moving")).resolves.toBeNull();
  });
});
