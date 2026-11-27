import type { Estimate } from "@/lib/domain/estimate";
import { getEstimateRepository } from "@/lib/repository/estimate-repository";

export async function listEstimates(businessId: string): Promise<Estimate[]> {
  return getEstimateRepository().list(businessId);
}

export async function getEstimate(id: string): Promise<Estimate | null> {
  return getEstimateRepository().get(id);
}
