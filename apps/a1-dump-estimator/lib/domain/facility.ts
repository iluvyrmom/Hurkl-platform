/**
 * Facility / local dump database domain types.
 *
 * Deliberately not hardcoded to any one city or facility — every fact here
 * (hours, pricing, accepted debris) is data, sourced from `facilities` and
 * related tables (see supabase/migrations), never a constant in code. This
 * is what lets the estimator expand city by city without a platform rewrite.
 */

export type DebrisCategory =
  | "general_junk"
  | "yard_debris"
  | "construction_debris"
  | "appliances"
  | "tires"
  | "electronics"
  | "mattresses"
  | "furniture"
  | "metal_scrap"
  | "hazmat";

export type FacilityType =
  | "landfill"
  | "transfer_station"
  | "recycling_center"
  | "donation_center"
  | "scrap_yard";

export interface FacilityHours {
  /** 0 = Sunday ... 6 = Saturday, per JS Date#getDay() convention. */
  dayOfWeek: number;
  opensAt: string; // "HH:MM", 24h local facility time
  closesAt: string; // "HH:MM"
  closed: boolean;
}

/**
 * Provenance for any fact sourced from an external authority (a facility's
 * own published rates, hours, or rules). Required on every record that
 * carries real-world pricing or policy data — see CONTINUOUS_INTELLIGENCE.md
 * and VERIFIED_INTELLIGENCE.md's principle, applied here: a fact is only as
 * good as knowing where it came from and how stale it might be.
 *
 * `requiresVerification: true` means the associated value (a rate, a fee, an
 * accepted-materials list) is either unconfirmed or was sourced indirectly
 * (e.g. a search-engine summary citing the source rather than a direct fetch
 * of the source page) and must not be presented to a customer as a firm
 * number without a human confirming it against the live source first.
 */
export interface SourceVerification {
  sourceUrl: string | null;
  lastVerifiedDate: string | null; // ISO date
  requiresVerification: boolean;
  verificationNotes: string | null;
}

export interface Facility {
  id: string;
  name: string;
  facilityType: FacilityType;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  website: string | null;
  acceptedDebris: DebrisCategory[];
  /** Debris categories this facility explicitly refuses (e.g. hazmat). */
  prohibitedDebris: DebrisCategory[];
  /** Free-text rules for hazardous or restricted materials — never inferred, only what the facility states. */
  hazmatNotes: string | null;
  /** Hard per-load weight ceiling in lbs, if the facility enforces one. */
  maxLoadWeightLbs: number | null;
  hours: FacilityHours[];
  isActive: boolean;
  verification: SourceVerification;
  createdAt: string;
  updatedAt: string;
}

export type PricingUnit = "per_ton" | "per_yard" | "per_item" | "flat";

/**
 * A facility's price for a debris category, valid over a date range.
 * `endDate: null` means currently in effect. Historical rows are kept
 * (never overwritten) so past estimates stay auditable against the price
 * that was actually in effect when they were made, and future-dated rows
 * let a facility's announced rate change be entered ahead of time.
 */
export interface FacilityPricingRule {
  id: string;
  facilityId: string;
  debrisCategory: DebrisCategory;
  unit: PricingUnit;
  rate: number;
  minimumFee: number | null;
  effectiveDate: string; // ISO date
  endDate: string | null; // ISO date, null = open-ended
  notes: string | null;
  verification: SourceVerification;
}

/** A per-item surcharge (e.g. refrigerator, tire, mattress) on top of category pricing. */
export interface FacilitySpecialFee {
  id: string;
  facilityId: string;
  itemLabel: string;
  fee: number;
  effectiveDate: string;
  endDate: string | null;
  notes: string | null;
  verification: SourceVerification;
}

export interface FacilitySelectionCriteria {
  debrisCategories: DebrisCategory[];
  originLatitude: number;
  originLongitude: number;
  /** Optional: restrict to facilities within this radius; otherwise closest-legal wins. */
  maxDistanceMiles?: number;
}

export interface FacilityDumpFeeBreakdown {
  facilityId: string;
  lineItems: Array<{
    category: DebrisCategory;
    unit: PricingUnit;
    rate: number;
    quantity: number;
    subtotal: number;
    requiresVerification: boolean;
  }>;
  specialFees: Array<{ itemLabel: string; fee: number; requiresVerification: boolean }>;
  totalDumpFee: number;
  /** True if any line item or special fee above was priced from an unverified rate — the UI must surface this, never hide it in a customer-facing total. */
  hasUnverifiedPricing: boolean;
}

export interface FacilitySelectionResult {
  facility: Facility;
  distanceMiles: number;
  driveTimeMinutes: number;
  dumpFee: FacilityDumpFeeBreakdown;
  /** Lower is better: a weighted blend of dump fee + travel cost, see lib/facilities/service.ts. */
  score: number;
  /** True if the facility does not accept every requested category — caller must show this, never hide it. */
  partialMatch: boolean;
  unacceptedCategories: DebrisCategory[];
}
