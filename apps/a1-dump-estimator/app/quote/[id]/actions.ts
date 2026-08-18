"use server";

import { redirect } from "next/navigation";
import { bookJob } from "@/lib/api";
import type { CrewSize, EstimateTier } from "@/lib/domain/estimate";

export async function bookJobAction(params: {
  estimateId: string;
  selectedTier: EstimateTier;
  scheduledAt: string;
  crewSize: CrewSize;
}) {
  const job = await bookJob(params);
  redirect(`/jobs/${job.id}`);
}
