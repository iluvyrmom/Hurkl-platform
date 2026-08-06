import { describe, expect, it } from "vitest";
import { calculateDumpFee } from "./dump-pricing";
import type {
  Facility,
  FacilityPricingRule,
  FacilitySpecialFee,
  SourceVerification,
} from "@/lib/domain/facility";

const VERIFIED: SourceVerification = {
  sourceUrl: "https://example.com/rates",
  lastVerifiedDate: "2026-01-01",
  requiresVerification: false,
  verificationNotes: null,
};

const facility: Facility = {
  id: "f1",
  name: "Test Facility",
  facilityType: "transfer_station",
  address: "1 Test St",
  city: "Testville",
  state: "OR",
  postalCode: "97000",
  latitude: 45,
  longitude: -122,
  phone: null,
  website: null,
  acceptedDebris: ["general_junk", "tires"],
  prohibitedDebris: ["hazmat"],
  hazmatNotes: null,
  maxLoadWeightLbs: null,
  hours: [],
  isActive: true,
  verification: VERIFIED,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const rules: FacilityPricingRule[] = [
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
    verification: VERIFIED,
  },
  {
    id: "r2",
    facilityId: "f1",
    debrisCategory: "general_junk",
    unit: "per_ton",
    rate: 80,
    minimumFee: 15,
    effectiveDate: "2020-01-01",
    endDate: "2026-01-01",
    notes: "expired rate",
    verification: VERIFIED,
  },
];

const specialFees: FacilitySpecialFee[] = [
  {
    id: "s1",
    facilityId: "f1",
    itemLabel: "tire",
    fee: 5,
    effectiveDate: "2026-01-01",
    endDate: null,
    notes: null,
    verification: VERIFIED,
  },
];

describe("calculateDumpFee", () => {
  it("prices weight-based categories per ton using the active rule", () => {
    const result = calculateDumpFee(
      facility,
      rules,
      [],
      [{ category: "general_junk", weightLbs: 2000, volumeYards: 1, itemLabels: ["Couch"] }],
      "2026-06-01",
    );
    expect(result.lineItems[0].subtotal).toBe(100);
    expect(result.totalDumpFee).toBe(100);
  });

  it("applies the minimum fee when computed subtotal is below it", () => {
    const result = calculateDumpFee(
      facility,
      rules,
      [],
      [{ category: "general_junk", weightLbs: 100, volumeYards: 0.1, itemLabels: ["Lamp"] }],
      "2026-06-01",
    );
    expect(result.lineItems[0].subtotal).toBe(20);
  });

  it("ignores expired pricing rules", () => {
    const result = calculateDumpFee(
      facility,
      rules,
      [],
      [{ category: "general_junk", weightLbs: 2000, volumeYards: 1, itemLabels: [] }],
      "2019-06-01",
    );
    expect(result.lineItems[0].subtotal).toBe(0);
  });

  it("matches special fees by item label substring", () => {
    const result = calculateDumpFee(
      facility,
      rules,
      specialFees,
      [{ category: "general_junk", weightLbs: 0, volumeYards: 0, itemLabels: ["Car tire"] }],
      "2026-06-01",
    );
    expect(result.specialFees).toEqual([{ itemLabel: "tire", fee: 5, requiresVerification: false }]);
    expect(result.totalDumpFee).toBeCloseTo(20 + 5); // hits minimum fee for the zero-weight line + special fee
  });
});
