/**
 * Lead intake — the first stage of the revenue pipeline (see
 * docs/a1-best-moving-launch.md). Application-layer validation here is
 * a defense-in-depth/better-error-message layer; the real authority is
 * supabase/migrations/00000000000008_leads_and_company_profile.sql's
 * submit_lead() function, which runs the same checks server-side
 * regardless of what this module does — a crafted request that skips
 * this module entirely still can't submit an invalid lead.
 */

export interface LeadSubmission {
  companySlug: string;
  name: string;
  phone?: string;
  email?: string;
  pickupAddress?: string;
  destinationAddress?: string;
  /** YYYY-MM-DD */
  moveDate?: string;
  preferredTime?: string;
  propertyType?: string;
  accessNotes?: string;
  inventoryNotes?: string;
  specialItems?: string;
  packingNeeds?: string;
  notes?: string;
  source?: string;
}

export class LeadValidationError extends Error {}

const MAX_NAME_LENGTH = 200;
const MAX_SHORT_FIELD_LENGTH = 300;
const MAX_LONG_FIELD_LENGTH = 2000;

function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validateLeadSubmission(input: LeadSubmission): void {
  if (!input.companySlug || input.companySlug.trim().length === 0) {
    throw new LeadValidationError("companySlug is required");
  }

  const name = input.name?.trim();
  if (!name) {
    throw new LeadValidationError("name is required");
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new LeadValidationError("name is too long");
  }

  const phone = input.phone?.trim();
  const email = input.email?.trim();
  if (!phone && !email) {
    throw new LeadValidationError("phone or email is required");
  }
  if (email && !isPlausibleEmail(email)) {
    throw new LeadValidationError("email does not look valid");
  }

  const shortFields: [string, string | undefined][] = [
    ["phone", phone],
    ["pickupAddress", input.pickupAddress],
    ["destinationAddress", input.destinationAddress],
    ["preferredTime", input.preferredTime],
    ["propertyType", input.propertyType],
  ];
  for (const [field, value] of shortFields) {
    if (value && value.length > MAX_SHORT_FIELD_LENGTH) {
      throw new LeadValidationError(`${field} is too long`);
    }
  }

  const longFields: [string, string | undefined][] = [
    ["accessNotes", input.accessNotes],
    ["inventoryNotes", input.inventoryNotes],
    ["specialItems", input.specialItems],
    ["packingNeeds", input.packingNeeds],
    ["notes", input.notes],
  ];
  for (const [field, value] of longFields) {
    if (value && value.length > MAX_LONG_FIELD_LENGTH) {
      throw new LeadValidationError(`${field} is too long`);
    }
  }
}

/**
 * Minimal shape this module needs from a Supabase client — matches
 * both the real client and a test double (same pattern as
 * lib/audit/log.ts's AuditLogWriter).
 */
export interface LeadSubmitter {
  rpc(
    fn: "submit_lead",
    args: Record<string, unknown>,
  ): PromiseLike<{ data: string | null; error: { message: string } | null }>;
}

/** Submits a validated lead via the submit_lead() RPC. Returns the new lead's id. */
export async function submitLead(client: LeadSubmitter, input: LeadSubmission): Promise<string> {
  validateLeadSubmission(input);

  const { data, error } = await client.rpc("submit_lead", {
    p_company_slug: input.companySlug.trim(),
    p_name: input.name.trim(),
    p_phone: input.phone?.trim() || null,
    p_email: input.email?.trim() || null,
    p_pickup_address: input.pickupAddress?.trim() || null,
    p_destination_address: input.destinationAddress?.trim() || null,
    p_move_date: input.moveDate || null,
    p_preferred_time: input.preferredTime?.trim() || null,
    p_property_type: input.propertyType?.trim() || null,
    p_access_notes: input.accessNotes?.trim() || null,
    p_inventory_notes: input.inventoryNotes?.trim() || null,
    p_special_items: input.specialItems?.trim() || null,
    p_packing_needs: input.packingNeeds?.trim() || null,
    p_notes: input.notes?.trim() || null,
    p_source: input.source?.trim() || "website",
  });

  if (error || !data) {
    throw new Error(`Failed to submit lead: ${error?.message ?? "no id returned"}`);
  }
  return data;
}

export interface CompanyPublicProfile {
  name: string;
  phone: string | null;
  email: string | null;
  slogan: string | null;
  logo_url: string | null;
  hero_eyebrow: string | null;
  hero_headline: string | null;
}

export interface CompanyProfileReader {
  rpc(
    fn: "get_company_public_profile",
    args: { p_company_slug: string },
  ): PromiseLike<{ data: CompanyPublicProfile[] | null; error: unknown }>;
}

/** Looks up a company's public-safe profile by its website slug. Null if no such company. */
export async function getCompanyPublicProfile(
  client: CompanyProfileReader,
  slug: string,
): Promise<CompanyPublicProfile | null> {
  const { data, error } = await client.rpc("get_company_public_profile", {
    p_company_slug: slug,
  });

  if (error || !data || data.length === 0) return null;
  return data[0];
}
