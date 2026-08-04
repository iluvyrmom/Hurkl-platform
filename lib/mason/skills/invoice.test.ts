import { describe, expect, it } from "vitest";
import { PermissionDeniedError } from "../../auth/roles";
import { calculateInvoice, calculateInvoiceWithPermissionCheck } from "./invoice";

describe("calculateInvoice", () => {
  it("calculates an hourly job with travel and supplies, no discount or tax", () => {
    const result = calculateInvoice({
      billableDurationMinutes: 120,
      hourlyRateCents: 16500,
      travelChargeCents: 5000,
      supplyChargeCents: 2500,
    });

    expect(result.lineItems).toEqual([
      { description: "Labor", amountCents: 33000 },
      { description: "Travel", amountCents: 5000 },
      { description: "Supplies", amountCents: 2500 },
    ]);
    expect(result.subtotalCents).toBe(40500);
    expect(result.taxCents).toBe(0);
    expect(result.totalCents).toBe(40500);
    expect(result.amountDueCents).toBe(40500);
  });

  it("calculates a flat-rate job, ignoring hourly fields entirely", () => {
    const result = calculateInvoice({ flatRateCents: 50000 });
    expect(result.lineItems).toEqual([{ description: "Flat rate", amountCents: 50000 }]);
    expect(result.subtotalCents).toBe(50000);
  });

  it("applies a discount before tax, and never discounts below zero", () => {
    const result = calculateInvoice({ flatRateCents: 10000, discountCents: 15000 });
    expect(result.discountCents).toBe(10000);
    expect(result.taxableCents).toBe(0);
  });

  it("applies tax to the post-discount taxable amount", () => {
    const result = calculateInvoice({
      flatRateCents: 10000,
      discountCents: 1000,
      taxRatePercent: 10,
    });
    expect(result.taxableCents).toBe(9000);
    expect(result.taxCents).toBe(900);
    expect(result.totalCents).toBe(9900);
  });

  it("subtracts deposits and previous payments to get the amount due", () => {
    const result = calculateInvoice({
      flatRateCents: 10000,
      depositCents: 2000,
      previousPaymentsCents: 3000,
    });
    expect(result.totalCents).toBe(10000);
    expect(result.amountDueCents).toBe(5000);
  });

  it("includes arbitrary additional line items", () => {
    const result = calculateInvoice({
      flatRateCents: 10000,
      additionalLineItems: [{ description: "Extra stop", amountCents: 1500 }],
    });
    expect(result.lineItems).toContainEqual({ description: "Extra stop", amountCents: 1500 });
    expect(result.subtotalCents).toBe(11500);
  });

  it("throws when neither a flat rate nor hourly rate + duration is given", () => {
    expect(() => calculateInvoice({})).toThrow();
    expect(() => calculateInvoice({ hourlyRateCents: 16500 })).toThrow();
  });
});

describe("calculateInvoiceWithPermissionCheck", () => {
  it("allows an employee with no financial grants to calculate a job with no discount", () => {
    const result = calculateInvoiceWithPermissionCheck(
      { role: "employee" },
      { flatRateCents: 10000 },
    );
    expect(result.totalCents).toBe(10000);
  });

  it("blocks an employee with no financial grants from applying a discount", () => {
    expect(() =>
      calculateInvoiceWithPermissionCheck(
        { role: "employee" },
        { flatRateCents: 10000, discountCents: 1000 },
      ),
    ).toThrow(PermissionDeniedError);
  });

  it("allows an employee explicitly granted issue_discount to apply one", () => {
    const result = calculateInvoiceWithPermissionCheck(
      { role: "employee", employeeFinancialGrants: ["issue_discount"] },
      { flatRateCents: 10000, discountCents: 1000 },
    );
    expect(result.discountCents).toBe(1000);
  });

  it("always allows the owner to apply a discount", () => {
    const result = calculateInvoiceWithPermissionCheck(
      { role: "owner" },
      { flatRateCents: 10000, discountCents: 1000 },
    );
    expect(result.discountCents).toBe(1000);
  });
});
