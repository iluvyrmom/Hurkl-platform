import { randomUUID } from "node:crypto";
import type { Estimate } from "@/lib/domain/estimate";
import { getSupabaseClient } from "@/lib/db/supabase-client";
import { inMemoryStore, nextQuoteNumber } from "./in-memory-store";

export type CreateEstimateInput = Omit<Estimate, "id" | "quoteNumber" | "createdAt" | "updatedAt">;

export interface EstimateRepository {
  list(businessId: string): Promise<Estimate[]>;
  get(id: string): Promise<Estimate | null>;
  create(input: CreateEstimateInput): Promise<Estimate>;
  update(id: string, patch: Partial<Estimate>): Promise<Estimate>;
}

class InMemoryEstimateRepository implements EstimateRepository {
  async list(businessId: string): Promise<Estimate[]> {
    return Array.from(inMemoryStore.estimates.values())
      .filter((e) => e.businessId === businessId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async get(id: string): Promise<Estimate | null> {
    return inMemoryStore.estimates.get(id) ?? null;
  }

  async create(input: CreateEstimateInput): Promise<Estimate> {
    const now = new Date().toISOString();
    const estimate: Estimate = {
      ...input,
      id: randomUUID(),
      quoteNumber: nextQuoteNumber(),
      createdAt: now,
      updatedAt: now,
    };
    inMemoryStore.estimates.set(estimate.id, estimate);
    return estimate;
  }

  async update(id: string, patch: Partial<Estimate>): Promise<Estimate> {
    const existing = inMemoryStore.estimates.get(id);
    if (!existing) throw new Error(`Estimate ${id} not found`);
    const updated: Estimate = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    inMemoryStore.estimates.set(id, updated);
    return updated;
  }
}

/** Written against supabase/migrations/00000000000002_customers_estimates.sql; not executed against a live project. */
class SupabaseEstimateRepository implements EstimateRepository {
  async list(businessId: string): Promise<Estimate[]> {
    const client = getSupabaseClient();
    if (!client) throw new Error("Supabase client not configured");
    const { data, error } = await client
      .from("estimates")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  async get(id: string): Promise<Estimate | null> {
    const client = getSupabaseClient();
    if (!client) throw new Error("Supabase client not configured");
    const { data, error } = await client.from("estimates").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  async create(input: CreateEstimateInput): Promise<Estimate> {
    const client = getSupabaseClient();
    if (!client) throw new Error("Supabase client not configured");
    const { data, error } = await client
      .from("estimates")
      .insert({
        business_id: input.businessId,
        quote_number: `A1-${Date.now()}`,
        customer_id: input.customerId,
        customer_name: input.customerName,
        customer_phone: input.customerPhone,
        address: input.address,
        notes: input.notes,
        manual_items: input.manualItems,
        status: input.status,
        tiers: input.tiers,
        selected_tier: input.selectedTier,
        selected_facility_id: input.selectedFacility?.facility.id ?? null,
        selected_facility_snapshot: input.selectedFacility,
        created_by_user_id: input.createdByUserId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapRow(data);
  }

  async update(id: string, patch: Partial<Estimate>): Promise<Estimate> {
    const client = getSupabaseClient();
    if (!client) throw new Error("Supabase client not configured");
    const { data, error } = await client
      .from("estimates")
      .update({
        status: patch.status,
        selected_tier: patch.selectedTier,
        notes: patch.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return mapRow(data);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): Estimate {
  return {
    id: row.id,
    businessId: row.business_id,
    quoteNumber: row.quote_number,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    address: row.address,
    photos: [],
    manualItems: row.manual_items ?? [],
    notes: row.notes ?? "",
    status: row.status,
    tiers: row.tiers ?? [],
    selectedTier: row.selected_tier,
    selectedFacility: row.selected_facility_snapshot ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByUserId: row.created_by_user_id,
  };
}

export function getEstimateRepository(): EstimateRepository {
  return getSupabaseClient() ? new SupabaseEstimateRepository() : new InMemoryEstimateRepository();
}
