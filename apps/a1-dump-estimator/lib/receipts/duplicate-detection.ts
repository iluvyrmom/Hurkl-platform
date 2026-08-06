import { createHash } from "node:crypto";

/**
 * SHA-256 of a receipt photo's actual bytes, from a data: URL
 * ("data:image/jpeg;base64,...."). This is the primary duplicate signal —
 * the exact same photo submitted for two different jobs. A secondary
 * signal (matching OCR-extracted ticket number) catches the same physical
 * receipt re-photographed at a different angle/lighting, which would hash
 * differently. See lib/repository/job-repository.ts#findDuplicateReceipt.
 */
export function hashReceiptImage(dataUrl: string): string {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return createHash("sha256").update(base64, "base64").digest("hex");
}

export class DuplicateReceiptError extends Error {
  constructor(public readonly duplicateOfJobId: string) {
    super(
      `This receipt matches one already on file for another job (${duplicateOfJobId}). ` +
        `Confirm this isn't a mistake or reused photo before completing this job.`,
    );
    this.name = "DuplicateReceiptError";
  }
}
