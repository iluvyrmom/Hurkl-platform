import type { DebrisCategory, FacilitySelectionResult } from "./facility";
import type { PhotoAnalysisResult } from "./photo-analysis";

export type CrewSize = 1 | 2 | 3 | 4;

export type EstimateStatus =
  | "draft"
  | "sent"
  | "approved"
  | "declined"
  | "expired"
  | "converted_to_job";

export type EstimateTier = "low" | "recommended" | "premium";

export interface EstimatePhoto {
  id: string;
  estimateId: string;
  storagePath: string;
  source: "upload" | "camera";
  uploadedAt: string;
  analysis: PhotoAnalysisResult | null;
}

export interface ManualItemEntry {
  label: string;
  category: DebrisCategory;
  quantity: number;
  estimatedWeightLbs: number | null;
}

/**
 * Everything a crew member enters standing at the property. Photos and/or
 * manual items are both optional individually, but at least one must be
 * present for the engine to produce a non-placeholder estimate.
 */
export interface EstimateInput {
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  photos: EstimatePhoto[];
  manualItems: ManualItemEntry[];
  notes: string;
  /** Crew's own override if they eyeball a different truck-load volume than photos suggest. */
  manualVolumeYardsOverride: number | null;
}

export type EstimateLineItemCategory =
  | "weight"
  | "volume"
  | "labor"
  | "crew"
  | "travel"
  | "dump_fee"
  | "special_fee"
  | "contingency"
  | "margin";

export interface EstimateBreakdown {
  estimatedWeightLbs: number;
  estimatedVolumeYards: number;
  laborHours: number;
  crewSize: CrewSize;
  laborCost: number;
  travelDistanceMiles: number;
  travelTimeMinutes: number;
  travelCost: number;
  dumpFee: number;
  specialFees: Array<{ label: string; amount: number }>;
  baseCost: number; // labor + travel + dump fee + special fees
  contingencyRate: number;
  contingencyAmount: number;
  marginRate: number;
  marginAmount: number;
  profitAmount: number;
}

export interface PriceEstimate {
  tier: EstimateTier;
  totalPrice: number;
  breakdown: EstimateBreakdown;
}

export interface Estimate {
  id: string;
  businessId: string;
  quoteNumber: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  address: string;
  photos: EstimatePhoto[];
  manualItems: ManualItemEntry[];
  notes: string;
  status: EstimateStatus;
  tiers: PriceEstimate[];
  selectedTier: EstimateTier | null;
  selectedFacility: FacilitySelectionResult | null;
  /** Which snapshot of lib/estimator/constants.ts priced this estimate — see ESTIMATOR_MODEL_VERSION's doc comment. Never changes retroactively; a new estimate at a bumped version is how a pricing-defaults change actually takes effect. */
  estimatorModelVersion: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
}
