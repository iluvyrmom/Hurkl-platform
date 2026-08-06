import { randomUUID } from "node:crypto";
import type { LearningRecord } from "@/lib/domain/job";
import { getSupabaseClient } from "@/lib/db/supabase-client";
import { inMemoryStore } from "./in-memory-store";

export type CreateLearningRecordInput = Omit<LearningRecord, "id" | "recordedAt">;

export interface LearningRepository {
  list(businessId: string): Promise<LearningRecord[]>;
  create(input: CreateLearningRecordInput): Promise<LearningRecord>;
}

class InMemoryLearningRepository implements LearningRepository {
  async list(businessId: string): Promise<LearningRecord[]> {
    return Array.from(inMemoryStore.learningRecords.values()).filter(
      (r) => r.businessId === businessId,
    );
  }

  async create(input: CreateLearningRecordInput): Promise<LearningRecord> {
    const record: LearningRecord = { ...input, id: randomUUID(), recordedAt: new Date().toISOString() };
    inMemoryStore.learningRecords.set(record.id, record);
    return record;
  }
}

/** Written against supabase/migrations/00000000000003_jobs_and_learning.sql; not executed against a live project. */
class SupabaseLearningRepository implements LearningRepository {
  async list(businessId: string): Promise<LearningRecord[]> {
    const client = getSupabaseClient();
    if (!client) throw new Error("Supabase client not configured");
    const { data, error } = await client
      .from("learning_records")
      .select("*")
      .eq("business_id", businessId);
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  async create(input: CreateLearningRecordInput): Promise<LearningRecord> {
    const client = getSupabaseClient();
    if (!client) throw new Error("Supabase client not configured");
    const { data, error } = await client
      .from("learning_records")
      .insert({
        job_id: input.jobId,
        business_id: input.businessId,
        estimated_weight_lbs: input.estimatedWeightLbs,
        actual_weight_lbs: input.actualWeightLbs,
        estimated_dump_fee: input.estimatedDumpFee,
        actual_dump_fee: input.actualDumpFee,
        estimated_labor_hours: input.estimatedLaborHours,
        actual_labor_hours: input.actualLaborHours,
        estimated_profit: input.estimatedProfit,
        actual_profit: input.actualProfit,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapRow(data);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): LearningRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    businessId: row.business_id,
    estimatedWeightLbs: Number(row.estimated_weight_lbs),
    actualWeightLbs: row.actual_weight_lbs != null ? Number(row.actual_weight_lbs) : null,
    estimatedDumpFee: Number(row.estimated_dump_fee),
    actualDumpFee: row.actual_dump_fee != null ? Number(row.actual_dump_fee) : null,
    estimatedLaborHours: Number(row.estimated_labor_hours),
    actualLaborHours: row.actual_labor_hours != null ? Number(row.actual_labor_hours) : null,
    estimatedProfit: Number(row.estimated_profit),
    actualProfit: row.actual_profit != null ? Number(row.actual_profit) : null,
    recordedAt: row.recorded_at,
  };
}

export function getLearningRepository(): LearningRepository {
  return getSupabaseClient() ? new SupabaseLearningRepository() : new InMemoryLearningRepository();
}
