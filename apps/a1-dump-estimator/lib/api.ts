/**
 * The service surface this app exposes for future integration — including,
 * eventually, Mason (see hurkl-platform's root CLAUDE.md/PRODUCT.md; Mason
 * itself is explicitly NOT integrated here per this app's build spec).
 * Every function here is plain, typed, and side-effect-documented so a
 * future caller (an API route, a marketplace service, a Mason HAL
 * specialist) can call it without knowing about Next.js, Supabase, or the
 * in-memory fallback underneath.
 */
import type { CrewSize, Estimate, EstimateInput, EstimateTier } from "@/lib/domain/estimate";
import type { Customer } from "@/lib/domain/customer";
import type { Job } from "@/lib/domain/job";
import { generateEstimate, type GenerateEstimateResult } from "@/lib/estimator/engine";
import { getFacilityRepository } from "@/lib/repository/facility-repository";
import { getEstimateRepository } from "@/lib/repository/estimate-repository";
import { getJobRepository } from "@/lib/repository/job-repository";
import { getMapsProvider } from "@/lib/providers/maps";
import { findOrCreateCustomer, lookupCustomer as lookupCustomerByPhone } from "@/lib/customers/service";
import { schedulePickup as schedulePickupJob } from "@/lib/scheduling/service";
import { DEFAULT_BUSINESS } from "@/lib/config/business";

export { lookupCustomerByPhone as lookupCustomer };
export { schedulePickupJob as schedulePickup };

export interface CalculatePriceParams {
  input: EstimateInput;
  crewSize: CrewSize;
  originLatitude: number;
  originLongitude: number;
}

/** Pure calculation — no persistence. Safe to call repeatedly as a crew member edits an estimate. */
export async function calculatePrice(params: CalculatePriceParams): Promise<GenerateEstimateResult> {
  const facilityRepo = getFacilityRepository();
  const [facilities, pricingRules, specialFees] = await Promise.all([
    facilityRepo.listFacilities(),
    facilityRepo.listPricingRules(),
    facilityRepo.listSpecialFees(),
  ]);

  return generateEstimate({
    input: params.input,
    crewSize: params.crewSize,
    originLatitude: params.originLatitude,
    originLongitude: params.originLongitude,
    facilities,
    pricingRules,
    specialFees,
    mapsProvider: getMapsProvider(),
  });
}

export interface CreateEstimateParams extends CalculatePriceParams {
  businessId?: string;
  createdByUserId?: string | null;
}

/** Calculates pricing, finds-or-creates the customer, and persists the estimate. */
export async function createEstimate(params: CreateEstimateParams): Promise<Estimate> {
  const businessId = params.businessId ?? DEFAULT_BUSINESS.id;
  const result = await calculatePrice(params);

  const customer: Customer = await findOrCreateCustomer({
    businessId,
    name: params.input.customerName,
    phone: params.input.customerPhone,
    address: params.input.address,
  });

  return getEstimateRepository().create({
    businessId,
    customerId: customer.id,
    customerName: params.input.customerName,
    customerPhone: params.input.customerPhone,
    address: params.input.address,
    photos: params.input.photos,
    manualItems: params.input.manualItems,
    notes: params.input.notes,
    status: "draft",
    tiers: result.tiers,
    selectedTier: null,
    selectedFacility: result.selectedFacility,
    createdByUserId: params.createdByUserId ?? null,
  });
}

export interface BookJobParams {
  estimateId: string;
  selectedTier: EstimateTier;
  scheduledAt: string;
  crewSize: CrewSize;
}

/** Converts an approved estimate into a scheduled job at the agreed tier's price. */
export async function bookJob(params: BookJobParams): Promise<Job> {
  const estimateRepo = getEstimateRepository();
  const estimate = await estimateRepo.get(params.estimateId);
  if (!estimate) throw new Error(`Estimate ${params.estimateId} not found`);
  if (!estimate.customerId) throw new Error("Estimate has no linked customer");

  const tier = estimate.tiers.find((t) => t.tier === params.selectedTier);
  if (!tier) throw new Error(`Estimate ${params.estimateId} has no ${params.selectedTier} tier`);

  const job = await getJobRepository().create({
    businessId: estimate.businessId,
    estimateId: estimate.id,
    customerId: estimate.customerId,
    selectedTier: params.selectedTier,
    agreedPrice: tier.totalPrice,
    crewSize: params.crewSize,
    facilityId: estimate.selectedFacility?.facility.id ?? null,
    scheduledAt: params.scheduledAt,
    status: "scheduled",
  });

  await estimateRepo.update(estimate.id, {
    status: "converted_to_job",
    selectedTier: params.selectedTier,
  });

  return job;
}
