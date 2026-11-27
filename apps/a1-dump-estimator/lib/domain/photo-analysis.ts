/**
 * Shared output shape for any photo-analysis provider (see
 * lib/providers/photo-analysis). Kept independent of any one AI vendor so
 * OpenAI Vision can be swapped for another provider without touching the
 * estimator engine or UI.
 */
import type { DebrisCategory } from "./facility";

export interface DetectedItem {
  label: string;
  category: DebrisCategory;
  estimatedQuantity: number;
  /** Rough per-item weight estimate in lbs, if the provider offers one. */
  estimatedWeightLbs: number | null;
  confidence: number; // 0..1
}

export interface PhotoAnalysisResult {
  photoId: string;
  provider: string;
  detectedItems: DetectedItem[];
  estimatedVolumeYards: number | null;
  estimatedWeightLbs: number | null;
  /** True when the provider could not produce a confident read — caller must fall back to manual entry, never fabricate a number. */
  requiresManualReview: boolean;
  analyzedAt: string;
}
