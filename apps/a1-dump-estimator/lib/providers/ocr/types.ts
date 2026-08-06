export interface ReceiptOCRResult {
  provider: string;
  rawText: string | null;
  extractedWeightLbs: number | null;
  extractedFee: number | null;
  /** OCR is assistive only — a human must confirm before this feeds a job's official record. */
  requiresManualReview: boolean;
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
