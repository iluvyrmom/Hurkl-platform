import type { CrewSize, EstimateTier } from "./estimate";

export type JobStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export interface DumpReceiptRecord {
  imageStoragePath: string;
  ocrExtractedText: string | null;
  ocrExtractedWeightLbs: number | null;
  ocrExtractedFee: number | null;
  /** OCR is assistive only — a human confirms before this is trusted for payout/learning data. */
  verifiedByUserId: string | null;
  uploadedAt: string;
}

export interface JobCompletion {
  cleanSitePhotoPaths: string[];
  dumpReceipt: DumpReceiptRecord | null;
  actualWeightLbs: number | null;
  actualDumpFee: number | null;
  actualLaborHours: number | null;
  completedAt: string;
  completedByUserId: string | null;
}

export interface Job {
  id: string;
  businessId: string;
  estimateId: string;
  customerId: string;
  selectedTier: EstimateTier;
  agreedPrice: number;
  crewSize: CrewSize;
  facilityId: string | null;
  scheduledAt: string;
  status: JobStatus;
  completion: JobCompletion | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The learning-system record: estimate vs. actual, per completed job.
 * Every completed job with a verified receipt and completion record feeds
 * this — see lib/learning/service.ts. Types only carry the comparison data;
 * how much weight future estimates give this history is service-layer logic.
 */
export interface LearningRecord {
  id: string;
  jobId: string;
  businessId: string;
  estimatedWeightLbs: number;
  actualWeightLbs: number | null;
  estimatedDumpFee: number;
  actualDumpFee: number | null;
  estimatedLaborHours: number;
  actualLaborHours: number | null;
  estimatedProfit: number;
  actualProfit: number | null;
  recordedAt: string;
}
