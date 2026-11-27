import type { ReceiptFormat } from "@/lib/domain/job";

export type { ReceiptFormat };

export interface ReceiptOCRResult {
  provider: string;
  rawText: string | null;
  receiptFormat: ReceiptFormat;
  facilityNameGuess: string | null;
  ticketNumber: string | null;
  receiptDate: string | null; // ISO date, if legible
  receiptTime: string | null; // "HH:MM", if legible
  grossWeightLbs: number | null;
  tareWeightLbs: number | null;
  netWeightLbs: number | null;
  amountCharged: number | null;
  /** OCR is assistive only — a human must confirm before this feeds a job's official record. */
  requiresManualReview: boolean;
}

/** True when the receipt itself (not just routine OCR assistiveness) needs a human's extra attention before any extracted number is trusted. */
export function needsSpecialReceiptReview(result: Pick<ReceiptOCRResult, "receiptFormat">): boolean {
  return result.receiptFormat === "handwritten" || result.receiptFormat === "unsupported";
}

/**
 * Abstraction over "read a scanned/photographed dump receipt." Job
 * completion always requires the underlying receipt photo regardless of
 * whether OCR is configured — this only assists filling in the numbers.
 */
export interface OCRProvider {
  readonly name: string;
  extractReceiptData(imageUrl: string): Promise<ReceiptOCRResult>;
}
