import { randomUUID } from "node:crypto";
import type { Job, JobCompletion } from "@/lib/domain/job";
import type { PaymentStatus } from "@/lib/domain/payment";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { inMemoryStore } from "./in-memory-store";

export type CreateJobInput = Omit<Job, "id" | "createdAt" | "updatedAt" | "completion">;

export interface JobRepository {
  list(businessId: string): Promise<Job[]>;
  get(id: string): Promise<Job | null>;
  create(input: CreateJobInput): Promise<Job>;
  update(id: string, patch: Partial<Job>): Promise<Job>;
  complete(id: string, completion: JobCompletion): Promise<Job>;
  updatePaymentStatus(id: string, paymentStatus: PaymentStatus): Promise<Job>;
  /** Duplicate-receipt detection: matches by image hash (primary signal) or ticket number (secondary), scoped to the business, excluding the job being completed. */
  findDuplicateReceipt(
    businessId: string,
    signal: { imageHash: string | null; ticketNumber: string | null },
    excludeJobId: string,
  ): Promise<{ jobId: string } | null>;
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

  async updatePaymentStatus(id: string, paymentStatus: PaymentStatus): Promise<Job> {
    const existing = inMemoryStore.jobs.get(id);
    if (!existing) throw new Error(`Job ${id} not found`);
    const updated: Job = { ...existing, paymentStatus, updatedAt: new Date().toISOString() };
    inMemoryStore.jobs.set(id, updated);
    return updated;
  }

  async findDuplicateReceipt(
    businessId: string,
    signal: { imageHash: string | null; ticketNumber: string | null },
    excludeJobId: string,
  ): Promise<{ jobId: string } | null> {
    for (const job of inMemoryStore.jobs.values()) {
      if (job.businessId !== businessId || job.id === excludeJobId || !job.completion?.dumpReceipt) {
        continue;
      }
      const receipt = job.completion.dumpReceipt;
      const hashMatch = signal.imageHash != null && receipt.imageHash === signal.imageHash;
      const ticketMatch =
        signal.ticketNumber != null &&
        receipt.ocrTicketNumber != null &&
        receipt.ocrTicketNumber === signal.ticketNumber;
      if (hashMatch || ticketMatch) return { jobId: job.id };
    }
    return null;
  }
}

/**
 * Written against supabase/migrations/00000000000003_jobs_and_learning.sql
 * and 00000000000006_job_payment_status.sql; not executed against a live
 * project. `useAdmin: true` uses the service-role client — only the Stripe
 * webhook handler passes this (see lib/payments/service.ts), since it has
 * no business-member session for RLS to authorize against.
 */
class SupabaseJobRepository implements JobRepository {
  constructor(private readonly useAdmin = false) {}

  private async client() {
    return this.useAdmin ? createSupabaseAdminClient() : createSupabaseServerClient();
  }

  async list(businessId: string): Promise<Job[]> {
    const client = await this.client();
    const { data, error } = await client
      .from("jobs")
      .select("*, job_completions(*)")
      .eq("business_id", businessId)
      .order("scheduled_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  async get(id: string): Promise<Job | null> {
    const client = await this.client();
    const { data, error } = await client
      .from("jobs")
      .select("*, job_completions(*)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  async create(input: CreateJobInput): Promise<Job> {
    const client = await this.client();
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
        payment_status: input.paymentStatus,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapRow(data);
  }

  async updatePaymentStatus(id: string, paymentStatus: PaymentStatus): Promise<Job> {
    const client = await this.client();
    const { data, error } = await client
      .from("jobs")
      .update({ payment_status: paymentStatus, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*, job_completions(*)")
      .single();
    if (error) throw error;
    return mapRow(data);
  }

  async update(id: string, patch: Partial<Job>): Promise<Job> {
    const client = await this.client();
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
    const client = await this.client();
    const receipt = completion.dumpReceipt;
    const { error: completionError } = await client.from("job_completions").upsert({
      job_id: id,
      clean_site_photo_paths: completion.cleanSitePhotoPaths,
      dump_receipt_image_path: receipt?.imageStoragePath ?? null,
      receipt_image_hash: receipt?.imageHash ?? null,
      ocr_provider: receipt?.ocrProvider ?? null,
      ocr_raw_text: receipt?.ocrExtractedText ?? null,
      receipt_format: receipt?.ocrReceiptFormat ?? null,
      facility_name_guess: receipt?.ocrFacilityNameGuess ?? null,
      ticket_number: receipt?.ocrTicketNumber ?? null,
      receipt_date: receipt?.ocrReceiptDate ?? null,
      receipt_time: receipt?.ocrReceiptTime ?? null,
      gross_weight_lbs: receipt?.ocrGrossWeightLbs ?? null,
      tare_weight_lbs: receipt?.ocrTareWeightLbs ?? null,
      net_weight_lbs: receipt?.ocrNetWeightLbs ?? null,
      amount_charged: receipt?.ocrAmountCharged ?? null,
      duplicate_of_job_id: receipt?.duplicateOfJobId ?? null,
      duplicate_override_confirmed: receipt?.duplicateOverrideConfirmed ?? false,
      duplicate_override_by_user_id: receipt?.duplicateOverrideByUserId ?? null,
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

  async findDuplicateReceipt(
    businessId: string,
    signal: { imageHash: string | null; ticketNumber: string | null },
    excludeJobId: string,
  ): Promise<{ jobId: string } | null> {
    if (!signal.imageHash && !signal.ticketNumber) return null;
    const client = await this.client();

    const orConditions = [
      signal.imageHash ? `receipt_image_hash.eq.${signal.imageHash}` : null,
      signal.ticketNumber ? `ticket_number.eq.${signal.ticketNumber}` : null,
    ]
      .filter((c): c is string => c !== null)
      .join(",");

    const { data, error } = await client
      .from("job_completions")
      .select("job_id, jobs!inner(business_id)")
      .or(orConditions)
      .neq("job_id", excludeJobId)
      .eq("jobs.business_id", businessId)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? { jobId: data.job_id as string } : null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCompletionRow(row: any): JobCompletion | null {
  if (!row) return null;
  const completionRow = Array.isArray(row) ? row[0] : row;
  if (!completionRow) return null;

  return {
    cleanSitePhotoPaths: completionRow.clean_site_photo_paths ?? [],
    dumpReceipt: completionRow.dump_receipt_image_path
      ? {
          imageStoragePath: completionRow.dump_receipt_image_path,
          imageHash: completionRow.receipt_image_hash,
          ocrProvider: completionRow.ocr_provider,
          ocrExtractedText: completionRow.ocr_raw_text,
          ocrReceiptFormat: completionRow.receipt_format ?? null,
          ocrFacilityNameGuess: completionRow.facility_name_guess,
          ocrTicketNumber: completionRow.ticket_number,
          ocrReceiptDate: completionRow.receipt_date,
          ocrReceiptTime: completionRow.receipt_time,
          ocrGrossWeightLbs:
            completionRow.gross_weight_lbs != null ? Number(completionRow.gross_weight_lbs) : null,
          ocrTareWeightLbs:
            completionRow.tare_weight_lbs != null ? Number(completionRow.tare_weight_lbs) : null,
          ocrNetWeightLbs:
            completionRow.net_weight_lbs != null ? Number(completionRow.net_weight_lbs) : null,
          ocrAmountCharged:
            completionRow.amount_charged != null ? Number(completionRow.amount_charged) : null,
          verifiedByUserId: null,
          duplicateOfJobId: completionRow.duplicate_of_job_id,
          duplicateOverrideConfirmed: completionRow.duplicate_override_confirmed ?? false,
          duplicateOverrideByUserId: completionRow.duplicate_override_by_user_id,
          uploadedAt: completionRow.completed_at,
        }
      : null,
    actualWeightLbs:
      completionRow.actual_weight_lbs != null ? Number(completionRow.actual_weight_lbs) : null,
    actualDumpFee: completionRow.actual_dump_fee != null ? Number(completionRow.actual_dump_fee) : null,
    actualLaborHours:
      completionRow.actual_labor_hours != null ? Number(completionRow.actual_labor_hours) : null,
    completedAt: completionRow.completed_at,
    completedByUserId: completionRow.completed_by_user_id,
  };
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
    paymentStatus: row.payment_status,
    completion: mapCompletionRow(row.job_completions),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getJobRepository(useAdmin = false): JobRepository {
  return isSupabaseConfigured() ? new SupabaseJobRepository(useAdmin) : new InMemoryJobRepository();
}
