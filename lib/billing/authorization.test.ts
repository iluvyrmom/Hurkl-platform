import { describe, expect, it, vi } from "vitest";
import {
  type AccountType,
  type CompanyAccountTypeReader,
  decideBilling,
  getBillingDecision,
} from "./authorization";

function fakeReader(result: {
  data: { account_type: string } | null;
  error: { message: string } | null;
}) {
  const single = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { client: { from } as unknown as CompanyAccountTypeReader, from, select, eq };
}

describe("decideBilling", () => {
  const cases: [AccountType, boolean][] = [
    ["production_customer", true],
    ["internal_hurkl", false],
    ["demo", false],
    ["development", false],
    // "partner" was named as an account type but its billing behavior
    // was never specified — treated as billed like a production
    // customer until that's its own conscious decision.
    ["partner", true],
  ];

  it.each(cases)("account_type '%s' requiresBilling=%s", (accountType, expected) => {
    expect(decideBilling(accountType).requiresBilling).toBe(expected);
  });
});

describe("getBillingDecision", () => {
  it("looks up the company's account_type and returns the matching decision", async () => {
    const { client, from, eq } = fakeReader({
      data: { account_type: "internal_hurkl" },
      error: null,
    });

    const decision = await getBillingDecision(client, "company-1");

    expect(from).toHaveBeenCalledWith("companies");
    expect(eq).toHaveBeenCalledWith("id", "company-1");
    expect(decision).toEqual({
      requiresBilling: false,
      reason: "account_type 'internal_hurkl' is billing-exempt",
    });
  });

  it("defaults a production customer to requiring billing", async () => {
    const { client } = fakeReader({ data: { account_type: "production_customer" }, error: null });
    const decision = await getBillingDecision(client, "company-1");
    expect(decision.requiresBilling).toBe(true);
  });

  it("throws rather than silently allowing billing to be skipped when the lookup fails", async () => {
    const { client } = fakeReader({ data: null, error: { message: "connection refused" } });
    await expect(getBillingDecision(client, "company-1")).rejects.toThrow(/connection refused/);
  });

  it("throws when no company is found", async () => {
    const { client } = fakeReader({ data: null, error: null });
    await expect(getBillingDecision(client, "missing-company")).rejects.toThrow(/not found/);
  });
});
