"use server";

import { revalidatePath } from "next/cache";
import { completeJob } from "@/lib/jobs/service";

export interface CompleteJobActionParams {
  jobId: string;
  cleanSitePhotoPaths: string[];
  dumpReceiptImagePath: string;
  actualWeightLbs: number | null;
  actualDumpFee: number | null;
  actualLaborHours: number | null;
}

export async function completeJobAction(params: CompleteJobActionParams) {
  await completeJob(params.jobId, {
    cleanSitePhotoPaths: params.cleanSitePhotoPaths,
    dumpReceipt: {
      imageStoragePath: params.dumpReceiptImagePath,
      ocrExtractedText: null,
      ocrExtractedWeightLbs: null,
      ocrExtractedFee: null,
      verifiedByUserId: null,
      uploadedAt: new Date().toISOString(),
    },
    actualWeightLbs: params.actualWeightLbs,
    actualDumpFee: params.actualDumpFee,
    actualLaborHours: params.actualLaborHours,
    completedByUserId: null,
  });

  revalidatePath(`/jobs/${params.jobId}`);
}
