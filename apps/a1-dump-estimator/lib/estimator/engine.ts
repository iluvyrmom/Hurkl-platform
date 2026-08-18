import type {
  Facility,
  FacilityPricingRule,
  FacilitySelectionResult,
  FacilitySpecialFee,
} from "@/lib/domain/facility";
import type { CrewSize, EstimateBreakdown, EstimateInput, PriceEstimate } from "@/lib/domain/estimate";
import type { MapsProvider } from "@/lib/providers/maps";
import { aggregateLoad } from "./aggregate-load";
import { selectBestFacility } from "@/lib/facilities/service";
import {
  ESTIMATE_TIERS,
  ESTIMATOR_MODEL_VERSION,
  FUEL_COST_PER_MILE,
  HOURLY_LABOR_RATE,
  MIN_JOB_HOURS,
  PERSON_HOURS_PER_VOLUME_YARD,
  SETUP_HOURS,
  TIER_PRICING,
} from "./constants";

export interface GenerateEstimateParams {
  input: EstimateInput;
  crewSize: CrewSize;
  originLatitude: number;
  originLongitude: number;
  facilities: Facility[];
  pricingRules: FacilityPricingRule[];
  specialFees: FacilitySpecialFee[];
  mapsProvider: MapsProvider;
}

export interface GenerateEstimateResult {
  tiers: PriceEstimate[];
  selectedFacility: FacilitySelectionResult | null;
  estimatedWeightLbs: number;
  estimatedVolumeYards: number;
  /** Which snapshot of lib/estimator/constants.ts priced this — see ESTIMATOR_MODEL_VERSION's doc comment. */
  estimatorModelVersion: string;
}

function roundToNearestDollar(amount: number): number {
  return Math.round(amount);
}

/**
 * Produces low / recommended / premium price estimates for a dump run.
 *
 * This is the pricing engine the whole product exists to deliver: weight,
 * volume, labor, crew, travel, dump fee, special fees, contingency, and
 * margin all flow through here into three customer-facing prices. Nothing
 * about this function is Portland- or A-1-specific — every input (facility
 * data, rates) is passed in, never imported as a constant.
 */
export async function generateEstimate(
  params: GenerateEstimateParams,
): Promise<GenerateEstimateResult> {
  const { input, crewSize, mapsProvider } = params;

  const load = aggregateLoad(input);
  const estimatedWeightLbs = load.reduce((sum, entry) => sum + entry.weightLbs, 0);
  const estimatedVolumeYards =
    input.manualVolumeYardsOverride ?? load.reduce((sum, entry) => sum + entry.volumeYards, 0);

  const debrisCategories = load.map((entry) => entry.category);

  const facilityResults =
    debrisCategories.length > 0
      ? await selectBestFacility(
          {
            debrisCategories,
            originLatitude: params.originLatitude,
            originLongitude: params.originLongitude,
          },
          params.facilities,
          params.pricingRules,
          params.specialFees,
          load,
          mapsProvider,
          FUEL_COST_PER_MILE,
        )
      : [];

  const selectedFacility = facilityResults[0] ?? null;

  const laborHours = Math.max(
    MIN_JOB_HOURS,
    (estimatedVolumeYards * PERSON_HOURS_PER_VOLUME_YARD) / crewSize + SETUP_HOURS,
  );
  const laborCost = laborHours * crewSize * HOURLY_LABOR_RATE;

  const travelDistanceMiles = selectedFacility?.distanceMiles ?? 0;
  const travelTimeMinutes = selectedFacility?.driveTimeMinutes ?? 0;
  const travelFuelCost = travelDistanceMiles * 2 * FUEL_COST_PER_MILE;
  const travelLaborCost = (travelTimeMinutes / 60) * 2 * crewSize * HOURLY_LABOR_RATE;
  const travelCost = travelFuelCost + travelLaborCost;

  const dumpFee = selectedFacility?.dumpFee.totalDumpFee ?? 0;
  const specialFees =
    selectedFacility?.dumpFee.specialFees.map((fee) => ({
      label: fee.itemLabel,
      amount: fee.fee,
    })) ?? [];

  const baseCost =
    laborCost + travelCost + dumpFee + specialFees.reduce((sum, fee) => sum + fee.amount, 0);

  const tiers: PriceEstimate[] = ESTIMATE_TIERS.map((tier) => {
    const { contingencyRate, marginRate } = TIER_PRICING[tier];
    const contingencyAmount = baseCost * contingencyRate;
    const marginAmount = (baseCost + contingencyAmount) * marginRate;
    const totalPrice = roundToNearestDollar(baseCost + contingencyAmount + marginAmount);

    const breakdown: EstimateBreakdown = {
      estimatedWeightLbs: Math.round(estimatedWeightLbs),
      estimatedVolumeYards: Math.round(estimatedVolumeYards * 100) / 100,
      laborHours: Math.round(laborHours * 100) / 100,
      crewSize,
      laborCost: Math.round(laborCost * 100) / 100,
      travelDistanceMiles,
      travelTimeMinutes,
      travelCost: Math.round(travelCost * 100) / 100,
      dumpFee: Math.round(dumpFee * 100) / 100,
      specialFees,
      baseCost: Math.round(baseCost * 100) / 100,
      contingencyRate,
      contingencyAmount: Math.round(contingencyAmount * 100) / 100,
      marginRate,
      marginAmount: Math.round(marginAmount * 100) / 100,
      profitAmount: Math.round(marginAmount * 100) / 100,
    };

    return { tier, totalPrice, breakdown };
  });

  return {
    tiers,
    selectedFacility,
    estimatedWeightLbs,
    estimatedVolumeYards,
    estimatorModelVersion: ESTIMATOR_MODEL_VERSION,
  };
}
