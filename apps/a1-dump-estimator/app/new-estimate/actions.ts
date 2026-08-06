"use server";

import { redirect } from "next/navigation";
import { createEstimate } from "@/lib/api";
import { requireMembership } from "@/lib/auth/business";
import { getMapsProvider } from "@/lib/providers/maps";
import type { GeocodeResult } from "@/lib/providers/maps";
import { getPhotoAnalysisProvider } from "@/lib/providers/photo-analysis";
import type { PhotoAnalysisResult } from "@/lib/domain/photo-analysis";
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

/**
 * Server Action so the OpenAI API key never reaches the browser. Takes a
 * data: URL (the photo is not uploaded to Storage in Phase 1 — see
 * README) and returns the provider's raw result, including confidence per
 * item and `requiresManualReview`. The caller (NewEstimateForm) never
 * auto-adds a detected item to the priced load — every one requires an
 * explicit "Add" tap, regardless of confidence, so a photo can never
 * silently produce an exact weight the crew didn't confirm.
 */
export async function analyzePhotoAction(
  photoId: string,
  imageDataUrl: string,
): Promise<PhotoAnalysisResult> {
  return getPhotoAnalysisProvider().analyze({ photoId, imageUrl: imageDataUrl });
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
