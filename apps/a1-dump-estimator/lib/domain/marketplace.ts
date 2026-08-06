/**
 * Future independent-contractor marketplace domain contracts.
 *
 * Types only — no runtime logic, no database schema, no matching/pricing
 * algorithm, no payout execution. This exists so Phase 2+ (Customer App,
 * Independent Contractor App, Business Pro) has a stable shape to build
 * against without re-deriving it, mirroring the dependency-free-contract
 * pattern hurkl-platform's own lib/domain/*.ts already uses for Mason's
 * not-yet-built engines. Nothing in this file is wired into the Phase 1
 * estimator flow.
 */

export interface ReliabilityScoreFactors {
  contractorId: string;
  completedJobs: number;
  averageCustomerRating: number; // 0..5
  receiptComplianceRate: number; // 0..1 — official dump receipt uploaded on time
  cleanSitePhotoComplianceRate: number; // 0..1
  /**
   * Post-acceptance cancellation rate only. Declining a job before
   * acceptance must never penalize reliability — see PRODUCT.md-equivalent
   * product principle for this app: "no acceptance-rate penalties."
   */
  postAcceptanceCancellationRate: number; // 0..1
}

export interface ReliabilityScore {
  contractorId: string;
  score: number; // 0..100, derived from ReliabilityScoreFactors
  factors: ReliabilityScoreFactors;
  computedAt: string;
}

export type MarketplaceHeatLevel = "low" | "warm" | "hot";

export interface MarketplaceOffer {
  id: string;
  jobId: string;
  suggestedCustomerOfferPrice: number;
  /** 0..100 — how competitive the current offer is vs. comparable recent jobs. */
  offerStrengthMeter: number;
  heatLevel: MarketplaceHeatLevel;
  platformBoosted: boolean;
  createdAt: string;
}

export type ContractorPayoutStatus = "pending" | "processing" | "paid" | "failed";

export interface ContractorPayout {
  id: string;
  contractorId: string;
  jobId: string;
  amount: number;
  status: ContractorPayoutStatus;
  createdAt: string;
  paidAt: string | null;
}

export interface ContractorProfile {
  id: string;
  name: string;
  phone: string;
  tradeCategories: string[];
  serviceRadiusMiles: number;
  reliabilityScore: ReliabilityScore | null;
  isActive: boolean;
}
