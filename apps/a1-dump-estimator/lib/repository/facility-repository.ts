import type {
  Facility,
  FacilityPricingRule,
  FacilitySpecialFee,
  SourceVerification,
} from "@/lib/domain/facility";
import { getSupabaseClient } from "@/lib/db/supabase-client";

export interface FacilityRepository {
  listFacilities(): Promise<Facility[]>;
  listPricingRules(): Promise<FacilityPricingRule[]>;
  listSpecialFees(): Promise<FacilitySpecialFee[]>;
}

const NOW = new Date().toISOString();
const RESEARCH_DATE = "2026-08-06";

const METRO_FEE_SCHEDULE_URL =
  "https://www.oregonmetro.gov/what-metro-does/garbage-and-recycling-system/wpes-budget-and-solid-waste-fee-setting";
const METRO_CENTRAL_URL =
  "https://www.oregonmetro.gov/waste-disposal-and-prevention/need-get-rid-something/metro-central-transfer-station";
const METRO_SOUTH_URL =
  "https://www.oregonmetro.gov/waste-disposal-and-prevention/need-get-rid-something/metro-south-transfer-station";

/**
 * SEED DATA — Metro Central and Metro South are real Portland-area
 * facilities (Metro, the regional government, operates both; Recology
 * Portland runs day-to-day operations under contract). Names, addresses,
 * phone, and general hours were corroborated across oregonmetro.gov and
 * multiple independent directory listings via web search.
 *
 * IMPORTANT — read before relying on this for a real customer quote:
 * `oregonmetro.gov` could not be fetched directly from this build
 * environment (blocked by this session's network egress policy), so every
 * fact below came from a search-engine summary that *cites* oregonmetro.gov
 * rather than a direct page fetch this session performed and can fully
 * vouch for. Every record is marked `requiresVerification: true` until a
 * human confirms it against the live source URL. Coordinates for Metro
 * Central specifically could not be sourced at all and are a rough
 * placement in the correct neighborhood (NW Portland Industrial district) —
 * do not trust travel-distance output involving it without re-geocoding.
 *
 * A third facility (a metal scrap yard) that was previously seeded here was
 * removed rather than kept as invented data — no real scrap-yard was
 * sourced. Add one back only with real, cited data.
 */

function verification(
  sourceUrl: string,
  notes: string,
  requiresVerification = true,
): SourceVerification {
  return { sourceUrl, lastVerifiedDate: RESEARCH_DATE, requiresVerification, verificationNotes: notes };
}

const SEED_FACILITIES: Facility[] = [
  {
    id: "10000000-0000-0000-0000-000000000001",
    name: "Metro Central Transfer Station",
    facilityType: "transfer_station",
    address: "6161 NW 61st Ave",
    city: "Portland",
    state: "OR",
    postalCode: "97210",
    // Not independently geocoded — placed approximately in the NW Portland
    // Industrial district where this address sits. Re-geocode before
    // trusting travel-distance/time output for this facility.
    latitude: 45.5567,
    longitude: -122.7445,
    phone: "503-234-3000",
    website: "https://www.oregonmetro.gov/waste-disposal-and-prevention/need-get-rid-something/metro-central-transfer-station",
    acceptedDebris: [
      "general_junk",
      "yard_debris",
      "construction_debris",
      "appliances",
      "furniture",
      "mattresses",
      "tires",
      "electronics",
      "metal_scrap",
    ],
    prohibitedDebris: ["hazmat"],
    hazmatNotes:
      "Metro operates a household hazardous waste depot on-site, but it is a separate service (appointment/rules apply) from the general transfer-station drop-off this estimator prices — do not include hazmat in a junk-removal load routed here.",
    maxLoadWeightLbs: null,
    hours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      dayOfWeek: day,
      opensAt: "08:00",
      closesAt: "17:00",
      closed: false,
    })),
    isActive: true,
    verification: verification(
      METRO_CENTRAL_URL,
      "Address, phone, and general-public hours (8am-5pm daily) corroborated across oregonmetro.gov (via search summary) and independent directory listings. Coordinates are an unverified approximation. Direct fetch of oregonmetro.gov blocked by this session's network policy — confirm against the live page.",
    ),
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: "10000000-0000-0000-0000-000000000002",
    name: "Metro South Transfer Station",
    facilityType: "transfer_station",
    address: "2001 Washington St",
    city: "Oregon City",
    state: "OR",
    postalCode: "97045",
    // Derived from a geocode of the adjacent address (2002 Washington St);
    // not the exact parcel. Re-geocode before trusting travel output.
    latitude: 45.3692,
    longitude: -122.5876,
    phone: "503-234-3000",
    website: "https://www.oregonmetro.gov/waste-disposal-and-prevention/need-get-rid-something/metro-south-transfer-station",
    acceptedDebris: [
      "general_junk",
      "yard_debris",
      "construction_debris",
      "appliances",
      "furniture",
      "mattresses",
      "electronics",
    ],
    prohibitedDebris: ["hazmat", "tires"],
    hazmatNotes:
      "Metro South has a household hazardous waste facility on-site (separate service, free for households up to a container-size limit, appointment/rules apply) — not part of this estimator's general junk-load pricing. Whether Metro South accepts tires at the general public gate the same way Metro Central does was not confirmed this session — treat tires as unaccepted here until verified.",
    maxLoadWeightLbs: null,
    hours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      dayOfWeek: day,
      opensAt: "08:00",
      closesAt: "17:00",
      closed: false,
    })),
    isActive: true,
    verification: verification(
      METRO_SOUTH_URL,
      "Address, phone, and general-public hours (8am-5pm daily) corroborated across oregonmetro.gov (via search summary) and independent directory listings. Coordinates derived from a secondary geocode of the adjacent address, not the exact parcel. Direct fetch of oregonmetro.gov blocked by this session's network policy — confirm against the live page.",
    ),
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
    rate: 162.14,
    minimumFee: null,
    effectiveDate: "2025-07-01",
    endDate: null,
    notes:
      "$162.14/ton is Metro's published FY2025-26 tip fee (up from $153.67/ton), plus a $7.85/transaction fee not modeled separately here. UNCONFIRMED: whether this exact figure is the self-haul walk-in public rate vs. a licensed-hauler/franchise tip fee — these can differ at Metro facilities and this session could not confirm which applies. A per-load minimum fee is published but its exact dollar amount could not be confirmed this session. Metro Council sets new rates each fiscal year (next reset July 1, 2026) — re-verify before relying on this for a live quote.",
    verification: verification(METRO_FEE_SCHEDULE_URL, "See notes — self-haul vs. tip-fee ambiguity and minimum-fee amount both unconfirmed."),
  },
  {
    id: "20000000-0000-0000-0000-000000000002",
    facilityId: "10000000-0000-0000-0000-000000000002",
    debrisCategory: "general_junk",
    unit: "per_ton",
    rate: 162.14,
    minimumFee: null,
    effectiveDate: "2025-07-01",
    endDate: null,
    notes:
      "Metro sets one region-wide tip fee schedule across both transfer stations per oregonmetro.gov (via search summary); applied to Metro South on that basis, not independently confirmed for this specific facility. Same self-haul-vs-tip-fee and minimum-fee caveats as Metro Central's rule.",
    verification: verification(METRO_FEE_SCHEDULE_URL, "Applied from the region-wide schedule, not independently confirmed per-facility."),
  },
  {
    id: "20000000-0000-0000-0000-000000000003",
    facilityId: "10000000-0000-0000-0000-000000000001",
    debrisCategory: "tires",
    unit: "per_item",
    rate: 4,
    minimumFee: null,
    effectiveDate: "2025-07-01",
    endDate: null,
    notes:
      "Metro's published tire fee is graduated, not flat: $30 for the first tire, then $2 (no rim) or $4 (with rim) for each additional tire. This schema only supports a flat per-item rate, so $4 (the higher, more conservative per-tire figure) is used as an approximation for tires after the first — it will UNDER-price a single-tire drop-off and should not be trusted for an exact tire-only quote. Model a graduated fee structure before relying on this for real pricing.",
    verification: verification(METRO_FEE_SCHEDULE_URL, "Graduated real-world fee structure not fully representable in this schema — flat approximation, flagged."),
  },
];

const SEED_SPECIAL_FEES: FacilitySpecialFee[] = [
  {
    id: "30000000-0000-0000-0000-000000000001",
    facilityId: "10000000-0000-0000-0000-000000000001",
    itemLabel: "mattress",
    fee: 0,
    effectiveDate: "2025-07-01",
    endDate: null,
    notes:
      "Per oregonmetro.gov (via search summary), the first 4 mattresses/box springs per customer per day are accepted free (excludes car beds, foldout sofa beds, futons, crib mattresses, waterbeds, air mattresses), and a $2.30 credit applies per mattress when part of a mixed load. Modeled here as $0 rather than inventing a charge — confirm current policy and any per-day-limit overage fee before relying on this.",
    verification: verification(METRO_FEE_SCHEDULE_URL, "Free/credited under current policy per source summary, not a charge — re-verify limits."),
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
function mapVerification(row: any): SourceVerification {
  return {
    sourceUrl: row.source_url ?? null,
    lastVerifiedDate: row.last_verified_date ?? null,
    requiresVerification: row.requires_verification ?? true,
    verificationNotes: row.verification_notes ?? null,
  };
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
    verification: mapVerification(row),
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
    verification: mapVerification(row),
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
    verification: mapVerification(row),
  };
}

export function getFacilityRepository(): FacilityRepository {
  return getSupabaseClient() ? new SupabaseFacilityRepository() : new InMemoryFacilityRepository();
}
