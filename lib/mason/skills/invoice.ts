/**
 * Skill 5: Invoice Creation. Real, deterministic math — no AI call
 * needed or used here (see model-routing.ts: "invoice_calculation" is
 * explicitly a low_cost/deterministic task). Pricing/discount
 * authority is enforced by the caller via lib/auth/roles.ts, not by
 * this module — see calculateInvoiceWithPermissionCheck below for the
 * one exception that needs both.
 */
import { type RoleContext, assertPermission } from "../../auth/roles";

export interface InvoiceLineItem {
  description: string;
  amountCents: number;
}

export interface InvoiceCalculationInput {
  /** Required unless flatRateCents is given. */
  billableDurationMinutes?: number;
  hourlyRateCents?: number;
  /** If given, overrides hourly-rate calculation entirely. */
  flatRateCents?: number;
  travelChargeCents?: number;
  supplyChargeCents?: number;
  additionalLineItems?: readonly InvoiceLineItem[];
  discountCents?: number;
  taxRatePercent?: number;
  depositCents?: number;
  previousPaymentsCents?: number;
}

export interface InvoiceCalculationResult {
  lineItems: readonly InvoiceLineItem[];
  subtotalCents: number;
  discountCents: number;
  taxableCents: number;
  taxCents: number;
  totalCents: number;
  amountDueCents: number;
}

export function calculateInvoice(input: InvoiceCalculationInput): InvoiceCalculationResult {
  if (
    input.flatRateCents == null &&
    (input.hourlyRateCents == null || input.billableDurationMinutes == null)
  ) {
    throw new Error(
      "calculateInvoice requires either flatRateCents, or both hourlyRateCents and billableDurationMinutes.",
    );
  }

  const laborCents =
    input.flatRateCents ??
    Math.round((input.billableDurationMinutes! / 60) * input.hourlyRateCents!);

  const lineItems: InvoiceLineItem[] = [
    { description: input.flatRateCents != null ? "Flat rate" : "Labor", amountCents: laborCents },
  ];
  if (input.travelChargeCents) {
    lineItems.push({ description: "Travel", amountCents: input.travelChargeCents });
  }
  if (input.supplyChargeCents) {
    lineItems.push({ description: "Supplies", amountCents: input.supplyChargeCents });
  }
  for (const item of input.additionalLineItems ?? []) {
    lineItems.push(item);
  }

  const subtotalCents = lineItems.reduce((sum, item) => sum + item.amountCents, 0);
  const discountCents = Math.min(input.discountCents ?? 0, subtotalCents);
  const taxableCents = subtotalCents - discountCents;
  const taxCents = input.taxRatePercent
    ? Math.round(taxableCents * (input.taxRatePercent / 100))
    : 0;
  const totalCents = taxableCents + taxCents;
  const amountDueCents =
    totalCents - (input.depositCents ?? 0) - (input.previousPaymentsCents ?? 0);

  return {
    lineItems,
    subtotalCents,
    discountCents,
    taxableCents,
    taxCents,
    totalCents,
    amountDueCents,
  };
}

/**
 * The one place invoice math and permission enforcement meet: applying
 * a discount requires "issue_discount" (see lib/auth/roles.ts). Every
 * other field is pure calculation — an employee with no financial
 * grants can still calculate what a job costs, they just can't discount
 * it. Matches the master prompt's A-1 rule: foremen report job facts,
 * they don't set financial terms.
 */
export function calculateInvoiceWithPermissionCheck(
  context: RoleContext,
  input: InvoiceCalculationInput,
): InvoiceCalculationResult {
  if ((input.discountCents ?? 0) > 0) {
    assertPermission(context, "issue_discount");
  }
  return calculateInvoice(input);
}
