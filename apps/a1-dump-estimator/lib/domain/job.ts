import type { CrewSize, EstimateTier } from "./estimate";
import type { PaymentStatus } from "./payment";

export type JobStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

/**
 * `printed` = a standard machine-printed scale ticket/receipt. `handwritten`
 * = a hand-written receipt (common at small/informal facilities) — numbers
 * extracted from these are far less reliable and must be flagged
 * distinctly, not silently folded into ordinary OCR review. `unsupported` =
 * a format the OCR provider recognizes but can't parse (torn, faded, not a
 * receipt at all). `unknown` = no classification was attempted (always true
 * for the mock OCR provider). See lib/providers/ocr/types.ts, which
 * implements this same type for provider results.
 */
export type ReceiptFormat = "printed" | "handwritten" | "unsupported" | "unknown";

export interface DumpReceiptRecord {
  /** Never overwritten once set — the original receipt image is the permanent record; OCR only ever adds assistive fields alongside it. */
  imageStoragePath: string;
  /** SHA-256 of the receipt image bytes — the primary signal for duplicate-receipt detection (see lib/receipts/duplicate-detection.ts). */
  imageHash: string | null;
  ocrProvider: string | null;
  ocrExtractedText: string | null;
  /** "handwritten" or "unsupported" flags this receipt for extra manual review beyond the routine OCR check — see needsSpecialReceiptReview() in lib/providers/ocr/types.ts. */
  ocrReceiptFormat: ReceiptFormat | null;
  ocrFacilityNameGuess: string | null;
  ocrTicketNumber: string | null;
  ocrReceiptDate: string | null;
  ocrReceiptTime: string | null;
  ocrGrossWeightLbs: number | null;
  ocrTareWeightLbs: number | null;
  ocrNetWeightLbs: number | null;
  ocrAmountCharged: number | null;
  /** OCR is assistive only — a human confirms before this is trusted for payout/learning data. */
  verifiedByUserId: string | null;
  /** Set when this receipt matched another job's receipt (same image hash or same ticket number) — see lib/receipts/duplicate-detection.ts. */
  duplicateOfJobId: string | null;
  /** True once a human explicitly confirmed the duplicate match is not a mistake and completion should proceed anyway. */
  duplicateOverrideConfirmed: boolean;
  duplicateOverrideByUserId: string | null;
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
  /**
   * Denormalized cache of the job's latest payment state — see
   * supabase/migrations/00000000000006_job_payment_status.sql. The
   * `payments` table (lib/domain/payment.ts) is the source of truth; this
   * field is kept in sync by lib/payments/service.ts, only ever from a
   * webhook-confirmed or owner-recorded payment event, never optimistically
   * from a client redirect.
   */
  paymentStatus: PaymentStatus;
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
