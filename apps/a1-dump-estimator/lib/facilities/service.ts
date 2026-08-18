import type {
  Facility,
  FacilityPricingRule,
  FacilitySelectionCriteria,
  FacilitySelectionResult,
  FacilitySpecialFee,
} from "@/lib/domain/facility";
import { calculateDumpFee, type AggregatedLoadCategory } from "@/lib/pricing/dump-pricing";
import type { MapsProvider } from "@/lib/providers/maps";

/**
 * Chooses the best facility for a load: cheapest total cost to the business
 * (dump fee + round-trip travel cost), among facilities that legally accept
 * every category in the load where possible. A facility that only accepts
 * some of the load's categories is still considered (junk removal loads are
 * often mixed and a business may split a load across two runs), but is
 * flagged `partialMatch` so the UI must show it, never hide it.
 */
export async function selectBestFacility(
  criteria: FacilitySelectionCriteria,
  facilities: Facility[],
  pricingRules: FacilityPricingRule[],
  specialFees: FacilitySpecialFee[],
  load: AggregatedLoadCategory[],
  mapsProvider: MapsProvider,
  travelCostPerMile: number,
): Promise<FacilitySelectionResult[]> {
  const activeFacilities = facilities.filter((f) => f.isActive);

  const results = await Promise.all(
    activeFacilities.map(async (facility): Promise<FacilitySelectionResult | null> => {
      const acceptedSet = new Set(facility.acceptedDebris);
      const prohibitedSet = new Set(facility.prohibitedDebris);
      const requestedCategories = criteria.debrisCategories;

      // Never send hazmat (or any explicitly prohibited category) to a
      // facility that refuses it — that's a hard legal exclusion, not a scoring penalty.
      const hasProhibitedCategory = requestedCategories.some((c) => prohibitedSet.has(c));
      if (hasProhibitedCategory) return null;

      const acceptedCategories = requestedCategories.filter((c) => acceptedSet.has(c));
      if (acceptedCategories.length === 0) return null;
      const unacceptedCategories = requestedCategories.filter((c) => !acceptedSet.has(c));

      const route = await mapsProvider.estimateRoute(
        { latitude: criteria.originLatitude, longitude: criteria.originLongitude },
        { latitude: facility.latitude, longitude: facility.longitude },
      );

      if (criteria.maxDistanceMiles != null && route.distanceMiles > criteria.maxDistanceMiles) {
        return null;
      }

      const acceptedLoad: AggregatedLoadCategory[] = load.filter((entry) =>
        acceptedSet.has(entry.category),
      );
      const dumpFee = calculateDumpFee(facility, pricingRules, specialFees, acceptedLoad);

      const roundTripTravelCost = route.distanceMiles * 2 * travelCostPerMile;
      const score = dumpFee.totalDumpFee + roundTripTravelCost;

      return {
        facility,
        distanceMiles: route.distanceMiles,
        driveTimeMinutes: route.driveTimeMinutes,
        dumpFee,
        score,
        partialMatch: unacceptedCategories.length > 0,
        unacceptedCategories,
      };
    }),
  );

  return results
    .filter((r): r is FacilitySelectionResult => r !== null)
    .sort((a, b) => a.score - b.score);
}
