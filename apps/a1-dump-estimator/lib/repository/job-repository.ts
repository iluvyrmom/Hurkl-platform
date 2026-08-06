import { randomUUID } from "node:crypto";
import type { Job, JobCompletion } from "@/lib/domain/job";
import { getSupabaseClient } from "@/lib/db/supabase-client";
import { inMemoryStore } from "./in-memory-store";

export type CreateJobInput = Omit<Job, "id" | "createdAt" | "updatedAt" | "completion">;

export interface JobRepository {
  list(businessId: string): Promise<Job[]>;
  get(id: string): Promise<Job | null>;
  create(input: CreateJobInput): Promise<Job>;
  update(id: string, patch: Partial<Job>): Promise<Job>;
  complete(id: string, completion: JobCompletion): Promise<Job>;
}

class InMemoryJobRepository implements JobRepository {
  async list(businessId: string): Promise<Job[]> {
    return Array.from(inMemoryStore.jobs.values())
      .filter((j) => j.businessId === businessId)
      .sort((a, b) => (a.scheduledAt < b.scheduledAt ? -1 : 1));
  }

  async get(id: string): Promise<Job | null> {
    return inMemoryStore.jobs.get(id) ?? null;
  }

  async create(input: CreateJobInput): Promise<Job> {
    const now = new Date().toISOString();
    const job: Job = { ...input, id: randomUUID(), completion: null, createdAt: now, updatedAt: now };
    inMemoryStore.jobs.set(job.id, job);
    return job;
  }

  async update(id: string, patch: Partial<Job>): Promise<Job> {
    const existing = inMemoryStore.jobs.get(id);
    if (!existing) throw new Error(`Job ${id} not found`);
    const updated: Job = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    inMemoryStore.jobs.set(id, updated);
    return updated;
  }

  async complete(id: string, completion: JobCompletion): Promise<Job> {
    const existing = inMemoryStore.jobs.get(id);
    if (!existing) throw new Error(`Job ${id} not found`);
    const updated: Job = {
      ...existing,
      status: "completed",
      completion,
      updatedAt: new Date().toISOString(),
    };
    inMemoryStore.jobs.set(id, updated);
    return updated;
  }
}

/** Written against supabase/migrations/00000000000003_jobs_and_learning.sql; not executed against a live project. */
class SupabaseJobRepository implements JobRepository {
  async list(businessId: string): Promise<Job[]> {
    const client = getSupabaseClient();
    if (!client) throw new Error("Supabase client not configured");
    const { data, error } = await client
      .from("jobs")
      .select("*, job_completions(*)")
      .eq("business_id", businessId)
      .order("scheduled_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  async get(id: string): Promise<Job | null> {
    const client = getSupabaseClient();
    if (!client) throw new Error("Supabase client not configured");
    const { data, error } = await client
      .from("jobs")
      .select("*, job_completions(*)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  async create(input: CreateJobInput): Promise<Job> {
    const client = getSupabaseClient();
    if (!client) throw new Error("Supabase client not configured");
    const { data, error } = await client
      .from("jobs")
      .insert({
        business_id: input.businessId,
        estimate_id: input.estimateId,
        customer_id: input.customerId,
        selected_tier: input.selectedTier,
        agreed_price: input.agreedPrice,
        crew_size: input.crewSize,
        facility_id: input.facilityId,
        scheduled_at: input.scheduledAt,
        status: input.status,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapRow(data);
  }

  async update(id: string, patch: Partial<Job>): Promise<Job> {
    const client = getSupabaseClient();
    if (!client) throw new Error("Supabase client not configured");
    const { data, error } = await client
      .from("jobs")
      .update({
        status: patch.status,
        scheduled_at: patch.scheduledAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return mapRow(data);
  }

  async complete(id: string, completion: JobCompletion): Promise<Job> {
    const client = getSupabaseClient();
    if (!client) throw new Error("Supabase client not configured");
    const { error: completionError } = await client.from("job_completions").upsert({
      job_id: id,
      clean_site_photo_paths: completion.cleanSitePhotoPaths,
      dump_receipt_image_path: completion.dumpReceipt?.imageStoragePath ?? null,
      actual_weight_lbs: completion.actualWeightLbs,
      actual_dump_fee: completion.actualDumpFee,
      actual_labor_hours: completion.actualLaborHours,
      completed_at: completion.completedAt,
      completed_by_user_id: completion.completedByUserId,
    });
    if (completionError) throw completionError;

    const { data, error } = await client
      .from("jobs")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*, job_completions(*)")
      .single();
    if (error) throw error;
    return mapRow(data);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): Job {
  return {
    id: row.id,
    businessId: row.business_id,
    estimateId: row.estimate_id,
    customerId: row.customer_id,
    selectedTier: row.selected_tier,
    agreedPrice: Number(row.agreed_price),
    crewSize: row.crew_size,
    facilityId: row.facility_id,
    scheduledAt: row.scheduled_at,
    status: row.status,
    completion: row.job_completions ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getJobRepository(): JobRepository {
  return getSupabaseClient() ? new SupabaseJobRepository() : new InMemoryJobRepository();
}
