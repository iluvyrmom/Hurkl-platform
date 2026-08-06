import { randomUUID } from "node:crypto";
import type { Customer } from "@/lib/domain/customer";
import { getSupabaseClient } from "@/lib/db/supabase-client";
import { inMemoryStore } from "./in-memory-store";

export interface CreateCustomerInput {
  businessId: string;
  name: string;
  phone: string;
  email: string | null;
  address: string;
  notes: string;
}

export interface CustomerRepository {
  list(businessId: string): Promise<Customer[]>;
  get(id: string): Promise<Customer | null>;
  findByPhone(businessId: string, phone: string): Promise<Customer | null>;
  create(input: CreateCustomerInput): Promise<Customer>;
}

class InMemoryCustomerRepository implements CustomerRepository {
  async list(businessId: string): Promise<Customer[]> {
    return Array.from(inMemoryStore.customers.values()).filter((c) => c.businessId === businessId);
  }

  async get(id: string): Promise<Customer | null> {
    return inMemoryStore.customers.get(id) ?? null;
  }

  async findByPhone(businessId: string, phone: string): Promise<Customer | null> {
    return (
      Array.from(inMemoryStore.customers.values()).find(
        (c) => c.businessId === businessId && c.phone === phone,
      ) ?? null
    );
  }

  async create(input: CreateCustomerInput): Promise<Customer> {
    const now = new Date().toISOString();
    const customer: Customer = {
      id: randomUUID(),
      businessId: input.businessId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      address: input.address,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    };
    inMemoryStore.customers.set(customer.id, customer);
    return customer;
  }
}

/** Written against supabase/migrations/00000000000002_customers_estimates.sql; not executed against a live project. */
class SupabaseCustomerRepository implements CustomerRepository {
  async list(businessId: string): Promise<Customer[]> {
    const client = getSupabaseClient();
    if (!client) throw new Error("Supabase client not configured");
    const { data, error } = await client
      .from("customers")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  async get(id: string): Promise<Customer | null> {
    const client = getSupabaseClient();
    if (!client) throw new Error("Supabase client not configured");
    const { data, error } = await client.from("customers").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  async findByPhone(businessId: string, phone: string): Promise<Customer | null> {
    const client = getSupabaseClient();
    if (!client) throw new Error("Supabase client not configured");
    const { data, error } = await client
      .from("customers")
      .select("*")
      .eq("business_id", businessId)
      .eq("phone", phone)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  async create(input: CreateCustomerInput): Promise<Customer> {
    const client = getSupabaseClient();
    if (!client) throw new Error("Supabase client not configured");
    const { data, error } = await client
      .from("customers")
      .insert({
        business_id: input.businessId,
        name: input.name,
        phone: input.phone,
        email: input.email,
        address: input.address,
        notes: input.notes,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapRow(data);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): Customer {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address ?? "",
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getCustomerRepository(): CustomerRepository {
  return getSupabaseClient() ? new SupabaseCustomerRepository() : new InMemoryCustomerRepository();
}
