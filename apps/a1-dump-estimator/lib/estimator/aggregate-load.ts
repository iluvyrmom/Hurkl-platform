import type { DebrisCategory } from "@/lib/domain/facility";
import type { EstimateInput } from "@/lib/domain/estimate";
import type { AggregatedLoadCategory } from "@/lib/pricing/dump-pricing";
import { DEFAULT_ITEM_VOLUME_YARDS, DEFAULT_ITEM_WEIGHT_LBS } from "./constants";

interface RawItem {
  label: string;
  category: DebrisCategory;
  quantity: number;
  estimatedWeightLbs: number | null;
}

/**
 * Combines manually-entered items and any AI photo-analysis detections into
 * one per-category load summary the pricing and labor calculations can use.
 * Falls back to DEFAULT_ITEM_WEIGHT_LBS/VOLUME per item only when a
 * specific weight wasn't supplied (manual entry or a confident photo read).
 */
export function aggregateLoad(input: EstimateInput): AggregatedLoadCategory[] {
  const rawItems: RawItem[] = [
    ...input.manualItems.map((item) => ({
      label: item.label,
      category: item.category,
      quantity: item.quantity,
      estimatedWeightLbs: item.estimatedWeightLbs,
    })),
    ...input.photos.flatMap((photo) =>
      (photo.analysis?.detectedItems ?? []).map((item) => ({
        label: item.label,
        category: item.category,
        quantity: item.estimatedQuantity,
        estimatedWeightLbs: item.estimatedWeightLbs,
      })),
    ),
  ];

  const byCategory = new Map<DebrisCategory, AggregatedLoadCategory>();

  for (const item of rawItems) {
    const weightLbs = item.estimatedWeightLbs ?? DEFAULT_ITEM_WEIGHT_LBS[item.category] * item.quantity;
    const volumeYards = DEFAULT_ITEM_VOLUME_YARDS[item.category] * item.quantity;

    const existing = byCategory.get(item.category);
    if (existing) {
      existing.weightLbs += weightLbs;
      existing.volumeYards += volumeYards;
      for (let i = 0; i < item.quantity; i += 1) existing.itemLabels.push(item.label);
    } else {
      byCategory.set(item.category, {
        category: item.category,
        weightLbs,
        volumeYards,
        itemLabels: Array.from({ length: Math.max(1, Math.round(item.quantity)) }, () => item.label),
      });
    }
  }

  return Array.from(byCategory.values());
}
