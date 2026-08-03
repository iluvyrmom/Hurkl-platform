import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadBusinessProfileSeed } from "./business-profile";

describe("loadBusinessProfileSeed", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hurkl-seed-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("throws a clear, actionable error when the seed file doesn't exist locally", () => {
    expect(() => loadBusinessProfileSeed("missing-tenant", dir)).toThrow(/missing-tenant\.json/);
  });

  it("loads and parses a real local seed file", () => {
    const profile = {
      businessName: "Test Movers",
      phone: "555-000-0000",
      email: "owner@test.invalid",
      operatingRules: {
        foremenHandleMoney: false,
        foremenChangePricing: false,
        foremenIssueDiscounts: false,
        invoiceCreatedBy: "mason_or_owner",
        invoiceAutoEmailAfterValidation: true,
        invoiceOwnerCanTextOneAction: true,
        paymentGoesDirectlyToBusiness: true,
      },
    };
    writeFileSync(join(dir, "test-tenant.json"), JSON.stringify(profile));

    const loaded = loadBusinessProfileSeed("test-tenant", dir);
    expect(loaded.businessName).toBe("Test Movers");
    expect(loaded.operatingRules.foremenHandleMoney).toBe(false);
  });
});
