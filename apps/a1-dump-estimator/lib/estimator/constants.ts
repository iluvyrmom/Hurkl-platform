import type { DebrisCategory } from "@/lib/domain/facility";
import type { EstimateTier } from "@/lib/domain/estimate";

/**
 * Phase 1 estimator defaults. These are rough industry-typical starting
 * points, not measured constants — the whole point of the learning system
 * (lib/learning/service.ts) is to tighten these over time from real
 * estimated-vs-actual job data. Treat every number here as a starting
 * default a business could eventually tune, not a permanent hardcoded fact.
 *
 * That tuning is manual and owner-approved, never automatic: the learning
 * system only ever computes an accuracy *summary* for a human to read
 * (getLearningAccuracySummary in lib/learning/service.ts) — nothing in this
 * codebase writes back into the constants below at runtime. `Object.freeze`
 * makes that a real, enforced guarantee rather than just a comment: a bug
 * that tried to mutate one of these objects would throw, not silently
 * change prices. Every estimate records which version of these constants
 * priced it (ESTIMATOR_MODEL_VERSION, stored as Estimate.estimatorModelVersion)
 * so a future, deliberate pricing-defaults change is auditable — bump the
 * version string only when the business owner explicitly approves a change.
 */
export const ESTIMATOR_MODEL_VERSION = "1.0.0";

/** Average lbs per item when a specific item doesn't carry its own weight estimate. */
export const DEFAULT_ITEM_WEIGHT_LBS: Readonly<Record<DebrisCategory, number>> = Object.freeze({
  general_junk: 40,
  yard_debris: 30,
  construction_debris: 65,
  appliances: 120,
  tires: 20,
  electronics: 25,
  mattresses: 50,
  furniture: 80,
  metal_scrap: 55,
  hazmat: 15,
});

/** Average cubic yards of truck space per item. */
export const DEFAULT_ITEM_VOLUME_YARDS: Readonly<Record<DebrisCategory, number>> = Object.freeze({
  general_junk: 0.05,
  yard_debris: 0.15,
  construction_debris: 0.1,
  appliances: 0.3,
  tires: 0.05,
  electronics: 0.05,
  mattresses: 0.6,
  furniture: 0.5,
  metal_scrap: 0.1,
  hazmat: 0.05,
});

export const MIN_JOB_HOURS = 0.5;
export const SETUP_HOURS = 0.25;
export const PERSON_HOURS_PER_VOLUME_YARD = 0.15;
export const HOURLY_LABOR_RATE = 35;
export const FUEL_COST_PER_MILE = 0.65;

export interface TierPricingParams {
  contingencyRate: number;
  marginRate: number;
}

export const TIER_PRICING: Readonly<Record<EstimateTier, Readonly<TierPricingParams>>> = Object.freeze({
  low: Object.freeze({ contingencyRate: 0.05, marginRate: 0.1 }),
  recommended: Object.freeze({ contingencyRate: 0.08, marginRate: 0.25 }),
  premium: Object.freeze({ contingencyRate: 0.12, marginRate: 0.4 }),
});

export const ESTIMATE_TIERS: EstimateTier[] = ["low", "recommended", "premium"];
