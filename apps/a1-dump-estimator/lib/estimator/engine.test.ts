import { describe, expect, it } from "vitest";
import { generateEstimate } from "./engine";
import type { Facility, FacilityPricingRule } from "@/lib/domain/facility";
import type { EstimateInput } from "@/lib/domain/estimate";
import type { MapsProvider } from "@/lib/providers/maps";

const facility: Facility = {
  id: "f1",
  name: "Test Facility",
  facilityType: "transfer_station",
  address: "",
  city: "",
  state: "OR",
  postalCode: "",
  latitude: 45.1,
  longitude: -122.1,
  phone: null,
  website: null,
  acceptedDebris: ["general_junk"],
  prohibitedDebris: [],
  hazmatNotes: null,
  maxLoadWeightLbs: null,
  hours: [],
  isActive: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const pricingRules: FacilityPricingRule[] = [
  {
    id: "r1",
    facilityId: "f1",
    debrisCategory: "general_junk",
    unit: "per_ton",
    rate: 100,
    minimumFee: 20,
    effectiveDate: "2026-01-01",
    endDate: null,
    notes: null,
  },
];

const fakeMapsProvider: MapsProvider = {
  name: "fake",
  async estimateRoute() {
    return { distanceMiles: 10, driveTimeMinutes: 20 };
  },
  getDirectionsUrl() {
    return "";
  },
};

function baseInput(overrides: Partial<EstimateInput> = {}): EstimateInput {
  return {
    customerId: null,
    customerName: "Jane Smith",
    customerPhone: "555-0100",
    address: "123 Main St",
    latitude: 45,
    longitude: -122,
    photos: [],
    manualItems: [{ label: "Couch", category: "general_junk", quantity: 2, estimatedWeightLbs: null }],
    notes: "",
    manualVolumeYardsOverride: null,
    ...overrides,
  };
}

describe("generateEstimate", () => {
  it("produces low < recommended < premium pricing for the same load", async () => {
    const result = await generateEstimate({
      input: baseInput(),
      crewSize: 2,
      originLatitude: 45,
      originLongitude: -122,
      facilities: [facility],
      pricingRules,
      specialFees: [],
      mapsProvider: fakeMapsProvider,
    });

    const [low, recommended, premium] = result.tiers;
    expect(low.tier).toBe("low");
    expect(recommended.tier).toBe("recommended");
    expect(premium.tier).toBe("premium");
    expect(low.totalPrice).toBeLessThan(recommended.totalPrice);
    expect(recommended.totalPrice).toBeLessThan(premium.totalPrice);
  });

  it("selects the matching facility and carries its dump fee into every tier", async () => {
    const result = await generateEstimate({
      input: baseInput(),
      crewSize: 2,
      originLatitude: 45,
      originLongitude: -122,
      facilities: [facility],
      pricingRules,
      specialFees: [],
      mapsProvider: fakeMapsProvider,
    });

    expect(result.selectedFacility?.facility.id).toBe("f1");
    for (const tier of result.tiers) {
      expect(tier.breakdown.dumpFee).toBeGreaterThan(0);
    }
  });

  it("returns no selected facility and zero dump fee when the load has no items", async () => {
    const result = await generateEstimate({
      input: baseInput({ manualItems: [] }),
      crewSize: 2,
      originLatitude: 45,
      originLongitude: -122,
      facilities: [facility],
      pricingRules,
      specialFees: [],
      mapsProvider: fakeMapsProvider,
    });

    expect(result.selectedFacility).toBeNull();
    expect(result.tiers[0].breakdown.dumpFee).toBe(0);
  });

  it("scales labor hours down as crew size increases for the same volume", async () => {
    // A large enough load that labor hours clear the MIN_JOB_HOURS floor for
    // a 1-person crew, so the crew-size effect is actually observable.
    const bigLoadInput = baseInput({
      manualItems: [{ label: "Couch", category: "general_junk", quantity: 100, estimatedWeightLbs: null }],
    });

    const small = await generateEstimate({
      input: bigLoadInput,
      crewSize: 1,
      originLatitude: 45,
      originLongitude: -122,
      facilities: [facility],
      pricingRules,
      specialFees: [],
      mapsProvider: fakeMapsProvider,
    });
    const large = await generateEstimate({
      input: bigLoadInput,
      crewSize: 4,
      originLatitude: 45,
      originLongitude: -122,
      facilities: [facility],
      pricingRules,
      specialFees: [],
      mapsProvider: fakeMapsProvider,
    });

    expect(large.tiers[0].breakdown.laborHours).toBeLessThan(small.tiers[0].breakdown.laborHours);
  });
});
