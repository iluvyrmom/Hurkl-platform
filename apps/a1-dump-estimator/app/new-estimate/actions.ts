"use server";

import { redirect } from "next/navigation";
import { createEstimate } from "@/lib/api";
import type { CrewSize, ManualItemEntry } from "@/lib/domain/estimate";

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
  });

  redirect(`/quote/${estimate.id}`);
}
