import type { Job, JobCompletion } from "@/lib/domain/job";
import { getJobRepository } from "@/lib/repository/job-repository";
import { getEstimateRepository } from "@/lib/repository/estimate-repository";
import { getLearningRepository } from "@/lib/repository/learning-repository";

export async function listJobs(businessId: string): Promise<Job[]> {
  return getJobRepository().list(businessId);
}

export async function getJob(id: string): Promise<Job | null> {
  return getJobRepository().get(id);
}

/**
 * Marks a job complete. Requires at least one clean-site photo and a dump
 * receipt image before completion is accepted — enforced here, not just in
 * the UI, since this is a hard product requirement ("Job Completion" in the
 * spec), not a suggestion.
 */
export async function completeJob(
  jobId: string,
  completion: Omit<JobCompletion, "completedAt">,
): Promise<Job> {
  if (completion.cleanSitePhotoPaths.length === 0) {
    throw new Error("At least one clean-site photo is required to complete a job.");
  }
  if (!completion.dumpReceipt) {
    throw new Error("An official dump receipt is required to complete a job.");
  }

  const jobRepo = getJobRepository();
  const job = await jobRepo.get(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  const fullCompletion: JobCompletion = { ...completion, completedAt: new Date().toISOString() };
  const completedJob = await jobRepo.complete(jobId, fullCompletion);

  // Feed the learning system: every completed job with a verified receipt
  // records estimated-vs-actual so the estimator's defaults can eventually
  // be tuned from real outcomes (see lib/learning/service.ts).
  const estimate = await getEstimateRepository().get(job.estimateId);
  const estimatedTier = estimate?.tiers.find((t) => t.tier === job.selectedTier);
  if (estimate && estimatedTier) {
    const estimatedProfit = estimatedTier.breakdown.profitAmount;
    const actualProfit =
      fullCompletion.actualDumpFee != null && fullCompletion.actualLaborHours != null
        ? job.agreedPrice -
          fullCompletion.actualDumpFee -
          fullCompletion.actualLaborHours * job.crewSize * 35
        : null;

    await getLearningRepository().create({
      jobId,
      businessId: job.businessId,
      estimatedWeightLbs: estimatedTier.breakdown.estimatedWeightLbs,
      actualWeightLbs: fullCompletion.actualWeightLbs,
      estimatedDumpFee: estimatedTier.breakdown.dumpFee,
      actualDumpFee: fullCompletion.actualDumpFee,
      estimatedLaborHours: estimatedTier.breakdown.laborHours,
      actualLaborHours: fullCompletion.actualLaborHours,
      estimatedProfit,
      actualProfit,
    });
  }

  return completedJob;
}
