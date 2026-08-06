import type {
  DebrisCategory,
  Facility,
  FacilityDumpFeeBreakdown,
  FacilityPricingRule,
  FacilitySpecialFee,
} from "@/lib/domain/facility";

const LBS_PER_TON = 2000;

export interface AggregatedLoadCategory {
  category: DebrisCategory;
  weightLbs: number;
  volumeYards: number;
  itemLabels: string[];
}

/** A rule is in effect for `asOf` when asOf falls in [effectiveDate, endDate). */
function isRuleActive(
  rule: { effectiveDate: string; endDate: string | null },
  asOf: string,
): boolean {
  if (rule.effectiveDate > asOf) return false;
  if (rule.endDate && rule.endDate <= asOf) return false;
  return true;
}

function findActiveRule(
  rules: FacilityPricingRule[],
  category: DebrisCategory,
  asOf: string,
): FacilityPricingRule | null {
  const candidates = rules.filter((r) => r.debrisCategory === category && isRuleActive(r, asOf));
  if (candidates.length === 0) return null;
  // Most-recently-effective active rule wins if more than one somehow overlaps.
  return candidates.sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1))[0];
}

/**
 * Computes what a specific facility would charge for a given load, as of a
 * given date (defaults to today) — using only the facility's own priced
 * categories and special fees, never an assumed/hardcoded rate. Falls back
 * to the facility's `general_junk` rate for any category it hasn't priced
 * individually, and flags (via the caller checking `lineItems` for zero
 * subtotal) when a category has no applicable rate at all.
 */
export function calculateDumpFee(
  facility: Facility,
  pricingRules: FacilityPricingRule[],
  specialFees: FacilitySpecialFee[],
  load: AggregatedLoadCategory[],
  asOf: string = new Date().toISOString().slice(0, 10),
): FacilityDumpFeeBreakdown {
  const facilityRules = pricingRules.filter((r) => r.facilityId === facility.id);
  const facilitySpecialFees = specialFees.filter((f) => f.facilityId === facility.id);

  const lineItems: FacilityDumpFeeBreakdown["lineItems"] = [];

  for (const entry of load) {
    const rule =
      findActiveRule(facilityRules, entry.category, asOf) ??
      findActiveRule(facilityRules, "general_junk", asOf);

    if (!rule) {
      // Facility has genuinely no priced rate for this category — record a
      // zero line rather than guessing a number, so the UI can surface it.
      lineItems.push({
        category: entry.category,
        unit: "flat",
        rate: 0,
        quantity: 0,
        subtotal: 0,
        requiresVerification: true,
      });
      continue;
    }

    let quantity: number;
    let subtotal: number;
    switch (rule.unit) {
      case "per_ton":
        quantity = entry.weightLbs / LBS_PER_TON;
        subtotal = quantity * rule.rate;
        break;
      case "per_yard":
        quantity = entry.volumeYards;
        subtotal = quantity * rule.rate;
        break;
      case "per_item":
        quantity = entry.itemLabels.length;
        subtotal = quantity * rule.rate;
        break;
      case "flat":
      default:
        quantity = 1;
        subtotal = rule.rate;
        break;
    }

    if (rule.minimumFee != null && subtotal < rule.minimumFee) {
      subtotal = rule.minimumFee;
    }

    lineItems.push({
      category: entry.category,
      unit: rule.unit,
      rate: rule.rate,
      quantity,
      subtotal,
      requiresVerification: rule.verification.requiresVerification,
    });
  }

  const matchedSpecialFees: FacilityDumpFeeBreakdown["specialFees"] = [];
  const allItemLabels = load.flatMap((entry) => entry.itemLabels);
  for (const label of allItemLabels) {
    const match = facilitySpecialFees.find(
      (fee) => isRuleActive(fee, asOf) && label.toLowerCase().includes(fee.itemLabel.toLowerCase()),
    );
    if (match) {
      matchedSpecialFees.push({
        itemLabel: match.itemLabel,
        fee: match.fee,
        requiresVerification: match.verification.requiresVerification,
      });
    }
  }

  const totalDumpFee =
    lineItems.reduce((sum, item) => sum + item.subtotal, 0) +
    matchedSpecialFees.reduce((sum, fee) => sum + fee.fee, 0);

  return {
    facilityId: facility.id,
    lineItems,
    specialFees: matchedSpecialFees,
    totalDumpFee: Math.round(totalDumpFee * 100) / 100,
    hasUnverifiedPricing:
      lineItems.some((item) => item.requiresVerification) ||
      matchedSpecialFees.some((fee) => fee.requiresVerification) ||
      facility.verification.requiresVerification,
  };
}
