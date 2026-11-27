import type { LearningRecord } from "@/lib/domain/job";
import { getLearningRepository } from "@/lib/repository/learning-repository";

export interface LearningAccuracySummary {
  sampleSize: number;
  averageWeightErrorPercent: number | null;
  averageDumpFeeErrorPercent: number | null;
  averageLaborHoursErrorPercent: number | null;
}

function percentError(estimated: number, actual: number | null): number | null {
  if (actual == null || actual === 0) return null;
  return ((estimated - actual) / actual) * 100;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Summarizes how far Phase 1's fixed default estimates (see
 * lib/estimator/constants.ts) have drifted from real completed-job
 * outcomes. This is reporting only — Phase 1 does not yet feed this back
 * into the estimator automatically; that closed-loop tuning is future work
 * once there's enough real job history to do it responsibly.
 */
export async function getLearningAccuracySummary(businessId: string): Promise<LearningAccuracySummary> {
  const records: LearningRecord[] = await getLearningRepository().list(businessId);

  const weightErrors = records
    .map((r) => percentError(r.estimatedWeightLbs, r.actualWeightLbs))
    .filter((v): v is number => v !== null);
  const dumpFeeErrors = records
    .map((r) => percentError(r.estimatedDumpFee, r.actualDumpFee))
    .filter((v): v is number => v !== null);
  const laborErrors = records
    .map((r) => percentError(r.estimatedLaborHours, r.actualLaborHours))
    .filter((v): v is number => v !== null);

  return {
    sampleSize: records.length,
    averageWeightErrorPercent: average(weightErrors),
    averageDumpFeeErrorPercent: average(dumpFeeErrors),
    averageLaborHoursErrorPercent: average(laborErrors),
  };
}
