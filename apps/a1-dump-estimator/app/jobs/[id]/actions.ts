"use server";

import { revalidatePath } from "next/cache";
import { completeJob } from "@/lib/jobs/service";
import { requireMembership } from "@/lib/auth/business";
import { getOCRProvider } from "@/lib/providers/ocr";
import { hashReceiptImage, DuplicateReceiptError } from "@/lib/receipts/duplicate-detection";

export interface CompleteJobActionParams {
  jobId: string;
  cleanSitePhotoPaths: string[];
  dumpReceiptImagePath: string;
  /** data: URL of the receipt photo — used for OCR extraction and duplicate-detection hashing; not persisted to Storage in Phase 1 (see README). */
  dumpReceiptImageDataUrl: string;
  actualWeightLbs: number | null;
  actualDumpFee: number | null;
  actualLaborHours: number | null;
  /** Set true only on a resubmit after the crew explicitly confirmed a flagged duplicate isn't a mistake. */
  duplicateOverrideConfirmed?: boolean;
}

export type CompleteJobActionResult =
  | { ok: true }
  | { ok: false; error: "duplicate"; duplicateOfJobId: string };

export async function completeJobAction(
  params: CompleteJobActionParams,
): Promise<CompleteJobActionResult> {
  const membership = await requireMembership();
  const userId = membership.userId === "dev-mode" ? null : membership.userId;

  const ocr = await getOCRProvider().extractReceiptData(params.dumpReceiptImageDataUrl);
  const imageHash = hashReceiptImage(params.dumpReceiptImageDataUrl);
  const overrideConfirmed = params.duplicateOverrideConfirmed ?? false;

  try {
    await completeJob(params.jobId, {
      cleanSitePhotoPaths: params.cleanSitePhotoPaths,
      dumpReceipt: {
        imageStoragePath: params.dumpReceiptImagePath,
        imageHash,
        ocrProvider: ocr.provider,
        ocrExtractedText: ocr.rawText,
        ocrFacilityNameGuess: ocr.facilityNameGuess,
        ocrTicketNumber: ocr.ticketNumber,
        ocrReceiptDate: ocr.receiptDate,
        ocrReceiptTime: ocr.receiptTime,
        ocrGrossWeightLbs: ocr.grossWeightLbs,
        ocrTareWeightLbs: ocr.tareWeightLbs,
        ocrNetWeightLbs: ocr.netWeightLbs,
        ocrAmountCharged: ocr.amountCharged,
        verifiedByUserId: null,
        duplicateOfJobId: null,
        duplicateOverrideConfirmed: overrideConfirmed,
        duplicateOverrideByUserId: overrideConfirmed ? userId : null,
        uploadedAt: new Date().toISOString(),
      },
      actualWeightLbs: params.actualWeightLbs,
      actualDumpFee: params.actualDumpFee,
      actualLaborHours: params.actualLaborHours,
      completedByUserId: userId,
    });
  } catch (err) {
    if (err instanceof DuplicateReceiptError) {
      return { ok: false, error: "duplicate", duplicateOfJobId: err.duplicateOfJobId };
    }
    throw err;
  }

  revalidatePath(`/jobs/${params.jobId}`);
  return { ok: true };
}
