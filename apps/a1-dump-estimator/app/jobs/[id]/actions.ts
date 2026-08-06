"use server";

import { revalidatePath } from "next/cache";
import { completeJob } from "@/lib/jobs/service";
import { requireMembership } from "@/lib/auth/business";

export interface CompleteJobActionParams {
  jobId: string;
  cleanSitePhotoPaths: string[];
  dumpReceiptImagePath: string;
  actualWeightLbs: number | null;
  actualDumpFee: number | null;
  actualLaborHours: number | null;
}

export async function completeJobAction(params: CompleteJobActionParams) {
  const membership = await requireMembership();
  const userId = membership.userId === "dev-mode" ? null : membership.userId;

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
    completedByUserId: userId,
  });

  revalidatePath(`/jobs/${params.jobId}`);
}
