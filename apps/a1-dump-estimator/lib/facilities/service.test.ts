import { describe, expect, it } from "vitest";
import { selectBestFacility } from "./service";
import type { Facility, FacilityPricingRule, SourceVerification } from "@/lib/domain/facility";
import type { MapsProvider } from "@/lib/providers/maps";

const VERIFIED: SourceVerification = {
  sourceUrl: "https://example.com/rates",
  lastVerifiedDate: "2026-01-01",
  requiresVerification: false,
  verificationNotes: null,
};

function makeFacility(overrides: Partial<Facility>): Facility {
  return {
    id: overrides.id ?? "f",
    name: "Facility",
    facilityType: "transfer_station",
    address: "",
    city: "",
    state: "OR",
    postalCode: "",
    latitude: 45,
    longitude: -122,
    phone: null,
    website: null,
    acceptedDebris: ["general_junk"],
    prohibitedDebris: [],
    hazmatNotes: null,
    maxLoadWeightLbs: null,
    hours: [],
    isActive: true,
    verification: VERIFIED,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const rules: FacilityPricingRule[] = [
  {
    id: "cheap-rule",
    facilityId: "cheap",
    debrisCategory: "general_junk",
    unit: "per_ton",
    rate: 50,
    minimumFee: null,
    effectiveDate: "2026-01-01",
    endDate: null,
    notes: null,
    verification: VERIFIED,
  },
  {
    id: "expensive-rule",
    facilityId: "expensive",
    debrisCategory: "general_junk",
    unit: "per_ton",
    rate: 500,
    minimumFee: null,
    effectiveDate: "2026-01-01",
    endDate: null,
    notes: null,
    verification: VERIFIED,
  },
];

const fakeMapsProvider: MapsProvider = {
  name: "fake",
  async estimateRoute() {
    return { distanceMiles: 5, driveTimeMinutes: 10 };
  },
  geocodeAddress() {
    return Promise.resolve(null);
  },
  getDirectionsUrl() {
    return "";
  },
};

describe("selectBestFacility", () => {
  const facilities = [makeFacility({ id: "cheap" }), makeFacility({ id: "expensive" })];
  const load = [{ category: "general_junk" as const, weightLbs: 2000, volumeYards: 1, itemLabels: [] }];

  it("ranks the cheaper total-cost facility first", async () => {
    const results = await selectBestFacility(
      { debrisCategories: ["general_junk"], originLatitude: 45, originLongitude: -122 },
      facilities,
      rules,
      [],
      load,
      fakeMapsProvider,
      0.5,
    );
    expect(results[0].facility.id).toBe("cheap");
    expect(results[1].facility.id).toBe("expensive");
  });

  it("excludes a facility that prohibits a requested category", async () => {
    const hazmatFacility = makeFacility({
      id: "hazmat-refusing",
      acceptedDebris: ["general_junk", "hazmat"],
      prohibitedDebris: [],
    });
    const results = await selectBestFacility(
      { debrisCategories: ["hazmat"], originLatitude: 45, originLongitude: -122 },
      [makeFacility({ id: "refuses-hazmat", prohibitedDebris: ["hazmat"] }), hazmatFacility],
      [],
      [],
      [{ category: "hazmat", weightLbs: 10, volumeYards: 0.1, itemLabels: [] }],
      fakeMapsProvider,
      0.5,
    );
    expect(results).toHaveLength(1);
    expect(results[0].facility.id).toBe("hazmat-refusing");
  });

  it("flags partialMatch when a facility only accepts some requested categories", async () => {
    const mixedFacility = makeFacility({ id: "mixed", acceptedDebris: ["general_junk"] });
    const results = await selectBestFacility(
      { debrisCategories: ["general_junk", "tires"], originLatitude: 45, originLongitude: -122 },
      [mixedFacility],
      rules,
      [],
      [
        { category: "general_junk", weightLbs: 2000, volumeYards: 1, itemLabels: [] },
        { category: "tires", weightLbs: 20, volumeYards: 0.05, itemLabels: ["Tire"] },
      ],
      fakeMapsProvider,
      0.5,
    );
    expect(results[0].partialMatch).toBe(true);
    expect(results[0].unacceptedCategories).toEqual(["tires"]);
  });
});
