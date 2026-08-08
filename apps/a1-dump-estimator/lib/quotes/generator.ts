import type { Estimate, EstimateTier } from "@/lib/domain/estimate";

export interface QuoteView {
  quoteNumber: string;
  customerName: string;
  address: string;
  createdAt: string;
  tiers: Array<{ tier: EstimateTier; totalPrice: number; isSelected: boolean }>;
  facilityName: string | null;
  notes: string;
}

const TIER_LABELS: Record<EstimateTier, string> = {
  low: "Low",
  recommended: "Recommended",
  premium: "Premium",
};

export function tierLabel(tier: EstimateTier): string {
  return TIER_LABELS[tier];
}

/** Assembles the display data for a printable/emailable/textable quote from a stored estimate. */
export function buildQuoteView(estimate: Estimate): QuoteView {
  return {
    quoteNumber: estimate.quoteNumber,
    customerName: estimate.customerName,
    address: estimate.address,
    createdAt: estimate.createdAt,
    tiers: estimate.tiers.map((t) => ({
      tier: t.tier,
      totalPrice: t.totalPrice,
      isSelected: estimate.selectedTier === t.tier,
    })),
    facilityName: estimate.selectedFacility?.facility.name ?? null,
    notes: estimate.notes,
  };
}

/** Short text summary suitable for an SMS quote link message. */
export function buildQuoteSmsSummary(estimate: Estimate, quoteUrl: string): string {
  const recommended = estimate.tiers.find((t) => t.tier === "recommended");
  const priceLine = recommended ? `Estimate: $${recommended.totalPrice}` : "Estimate ready";
  return `${priceLine} — view your quote ${estimate.quoteNumber}: ${quoteUrl}`;
}
