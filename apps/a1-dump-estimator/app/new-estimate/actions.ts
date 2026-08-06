"use server";

import { redirect } from "next/navigation";
import { createEstimate } from "@/lib/api";
import { requireMembership } from "@/lib/auth/business";
import { getMapsProvider } from "@/lib/providers/maps";
import type { GeocodeResult } from "@/lib/providers/maps";
import type { CrewSize, ManualItemEntry } from "@/lib/domain/estimate";

/**
 * Server Action so the Google Maps API key never reaches the browser.
 * Returns null (never a guessed location) when the active provider can't
 * geocode — the New Estimate form falls back to requiring GPS capture.
 */
export async function geocodeAddressAction(address: string): Promise<GeocodeResult | null> {
  if (!address.trim()) return null;
  return getMapsProvider().geocodeAddress(address);
}

export interface CreateEstimateActionParams {
  customerName: string;
  customerPhone: string;
  address: string;
  latitude: number;
  longitude: number;
  notes: string;
  manualItems: ManualItemEntry[];
  manualVolumeYardsOverride: number | null;
  crewSize: CrewSize;
}

export async function createEstimateAction(params: CreateEstimateActionParams) {
  const membership = await requireMembership();

  const estimate = await createEstimate({
    input: {
      customerId: null,
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      address: params.address,
      latitude: params.latitude,
      longitude: params.longitude,
      photos: [],
      manualItems: params.manualItems,
      notes: params.notes,
      manualVolumeYardsOverride: params.manualVolumeYardsOverride,
    },
    crewSize: params.crewSize,
    originLatitude: params.latitude,
    originLongitude: params.longitude,
    businessId: membership.businessId,
    createdByUserId: membership.userId === "dev-mode" ? null : membership.userId,
  });

  redirect(`/quote/${estimate.id}`);
}
