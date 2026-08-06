import type { Facility, FacilityPricingRule, FacilitySpecialFee } from "@/lib/domain/facility";
import { getSupabaseClient } from "@/lib/db/supabase-client";

export interface FacilityRepository {
  listFacilities(): Promise<Facility[]>;
  listPricingRules(): Promise<FacilityPricingRule[]>;
  listSpecialFees(): Promise<FacilitySpecialFee[]>;
}

const NOW = new Date().toISOString();

/**
 * SEED EXAMPLE DATA — for local development/demo only. These are placeholder
 * facility names and illustrative rates, not verified current pricing for
 * any real facility. Before this app is used for a real quote, replace this
 * with verified facility data (real name, address, current published rates,
 * hours, accepted-materials rules) sourced from the actual facility.
 */
const SEED_FACILITIES: Facility[] = [
  {
    id: "10000000-0000-0000-0000-000000000001",
    name: "Example Metro Transfer Station",
    facilityType: "transfer_station",
    address: "6161 NW Front Ave",
    city: "Portland",
    state: "OR",
    postalCode: "97210",
    latitude: 45.5578,
    longitude: -122.7195,
    phone: null,
    website: null,
    acceptedDebris: [
      "general_junk",
      "yard_debris",
      "construction_debris",
      "appliances",
      "furniture",
      "metal_scrap",
      "mattresses",
    ],
    prohibitedDebris: ["hazmat"],
    hazmatNotes: "Household hazardous waste not accepted — placeholder note, verify locally.",
    maxLoadWeightLbs: null,
    hours: [1, 2, 3, 4, 5, 6].map((day) => ({
      dayOfWeek: day,
      opensAt: "07:00",
      closesAt: "17:30",
      closed: false,
    })),
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: "10000000-0000-0000-0000-000000000002",
    name: "Example County Landfill",
    facilityType: "landfill",
    address: "2001 SW Landfill Rd",
    city: "Portland",
    state: "OR",
    postalCode: "97219",
    latitude: 45.4402,
    longitude: -122.7295,
    phone: null,
    website: null,
    acceptedDebris: [
      "general_junk",
      "yard_debris",
      "construction_debris",
      "appliances",
      "furniture",
      "metal_scrap",
      "mattresses",
      "tires",
    ],
    prohibitedDebris: ["hazmat", "electronics"],
    hazmatNotes: "No hazardous waste or e-waste — placeholder note, verify locally.",
    maxLoadWeightLbs: 20000,
    hours: [1, 2, 3, 4, 5, 6].map((day) => ({
      dayOfWeek: day,
      opensAt: "06:30",
      closesAt: "16:00",
      closed: false,
    })),
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: "10000000-0000-0000-0000-000000000003",
    name: "Example Community Scrap & Metal Recycling",
    facilityType: "scrap_yard",
    address: "8421 N Scrap Yard Way",
    city: "Portland",
    state: "OR",
    postalCode: "97203",
    latitude: 45.5951,
    longitude: -122.7539,
    phone: null,
    website: null,
    acceptedDebris: ["metal_scrap", "appliances"],
    prohibitedDebris: ["hazmat"],
    hazmatNotes: null,
    maxLoadWeightLbs: null,
    hours: [1, 2, 3, 4, 5].map((day) => ({
      dayOfWeek: day,
      opensAt: "08:00",
      closesAt: "16:30",
      closed: false,
    })),
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

const SEED_PRICING_RULES: FacilityPricingRule[] = [
  {
    id: "20000000-0000-0000-0000-000000000001",
    facilityId: "10000000-0000-0000-0000-000000000001",
    debrisCategory: "general_junk",
    unit: "per_ton",
    rate: 130,
    minimumFee: 25,
    effectiveDate: "2026-01-01",
    endDate: null,
    notes: "Example rate — not verified.",
  },
  {
    id: "20000000-0000-0000-0000-000000000002",
    facilityId: "10000000-0000-0000-0000-000000000001",
    debrisCategory: "yard_debris",
    unit: "per_ton",
    rate: 60,
    minimumFee: 15,
    effectiveDate: "2026-01-01",
    endDate: null,
    notes: "Example rate — not verified.",
  },
  {
    id: "20000000-0000-0000-0000-000000000003",
    facilityId: "10000000-0000-0000-0000-000000000001",
    debrisCategory: "construction_debris",
    unit: "per_ton",
    rate: 145,
    minimumFee: 30,
    effectiveDate: "2026-01-01",
    endDate: null,
    notes: "Example rate — not verified.",
  },
  {
    id: "20000000-0000-0000-0000-000000000004",
    facilityId: "10000000-0000-0000-0000-000000000002",
    debrisCategory: "general_junk",
    unit: "per_ton",
    rate: 105,
    minimumFee: 20,
    effectiveDate: "2026-01-01",
    endDate: null,
    notes: "Example rate — not verified.",
  },
  {
    id: "20000000-0000-0000-0000-000000000005",
    facilityId: "10000000-0000-0000-0000-000000000002",
    debrisCategory: "construction_debris",
    unit: "per_ton",
    rate: 118,
    minimumFee: 25,
    effectiveDate: "2026-01-01",
    endDate: null,
    notes: "Example rate — not verified.",
  },
  {
    id: "20000000-0000-0000-0000-000000000006",
    facilityId: "10000000-0000-0000-0000-000000000003",
    debrisCategory: "metal_scrap",
    unit: "flat",
    rate: 0,
    minimumFee: null,
    effectiveDate: "2026-01-01",
    endDate: null,
    notes: "Scrap metal often pays the hauler rather than charging — example only.",
  },
];

const SEED_SPECIAL_FEES: FacilitySpecialFee[] = [
  {
    id: "30000000-0000-0000-0000-000000000001",
    facilityId: "10000000-0000-0000-0000-000000000001",
    itemLabel: "tire",
    fee: 5,
    effectiveDate: "2026-01-01",
    endDate: null,
    notes: "Example per-tire surcharge — not verified.",
  },
  {
    id: "30000000-0000-0000-0000-000000000002",
    facilityId: "10000000-0000-0000-0000-000000000001",
    itemLabel: "mattress",
    fee: 20,
    effectiveDate: "2026-01-01",
    endDate: null,
    notes: "Example per-mattress surcharge — not verified.",
  },
  {
    id: "30000000-0000-0000-0000-000000000003",
    facilityId: "10000000-0000-0000-0000-000000000002",
    itemLabel: "refrigerator",
    fee: 15,
    effectiveDate: "2026-01-01",
    endDate: null,
    notes: "Example Freon-recovery surcharge — not verified.",
  },
];

class InMemoryFacilityRepository implements FacilityRepository {
  async listFacilities(): Promise<Facility[]> {
    return SEED_FACILITIES;
  }
  async listPricingRules(): Promise<FacilityPricingRule[]> {
    return SEED_PRICING_RULES;
  }
  async listSpecialFees(): Promise<FacilitySpecialFee[]> {
    return SEED_SPECIAL_FEES;
  }
}

/**
 * Supabase-backed implementation. Written against the schema in
 * supabase/migrations/, but not executed against a live project in this
 * environment — no Supabase project has been provisioned for this app yet.
 */
class SupabaseFacilityRepository implements FacilityRepository {
  async listFacilities(): Promise<Facility[]> {
    const client = getSupabaseClient();
    if (!client) throw new Error("Supabase client not configured");
    const { data, error } = await client.from("facilities").select("*").eq("is_active", true);
    if (error) throw error;
    return (data ?? []).map(mapFacilityRow);
  }

  async listPricingRules(): Promise<FacilityPricingRule[]> {
    const client = getSupabaseClient();
    if (!client) throw new Error("Supabase client not configured");
    const { data, error } = await client.from("facility_pricing_rules").select("*");
    if (error) throw error;
    return (data ?? []).map(mapPricingRuleRow);
  }

  async listSpecialFees(): Promise<FacilitySpecialFee[]> {
    const client = getSupabaseClient();
    if (!client) throw new Error("Supabase client not configured");
    const { data, error } = await client.from("facility_special_fees").select("*");
    if (error) throw error;
    return (data ?? []).map(mapSpecialFeeRow);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFacilityRow(row: any): Facility {
  return {
    id: row.id,
    name: row.name,
    facilityType: row.facility_type,
    address: row.address,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    latitude: row.latitude,
    longitude: row.longitude,
    phone: row.phone,
    website: row.website,
    acceptedDebris: row.accepted_debris ?? [],
    prohibitedDebris: row.prohibited_debris ?? [],
    hazmatNotes: row.hazmat_notes,
    maxLoadWeightLbs: row.max_load_weight_lbs,
    hours: [],
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPricingRuleRow(row: any): FacilityPricingRule {
  return {
    id: row.id,
    facilityId: row.facility_id,
    debrisCategory: row.debris_category,
    unit: row.unit,
    rate: Number(row.rate),
    minimumFee: row.minimum_fee != null ? Number(row.minimum_fee) : null,
    effectiveDate: row.effective_date,
    endDate: row.end_date,
    notes: row.notes,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSpecialFeeRow(row: any): FacilitySpecialFee {
  return {
    id: row.id,
    facilityId: row.facility_id,
    itemLabel: row.item_label,
    fee: Number(row.fee),
    effectiveDate: row.effective_date,
    endDate: row.end_date,
    notes: row.notes,
  };
}

export function getFacilityRepository(): FacilityRepository {
  return getSupabaseClient() ? new SupabaseFacilityRepository() : new InMemoryFacilityRepository();
}
