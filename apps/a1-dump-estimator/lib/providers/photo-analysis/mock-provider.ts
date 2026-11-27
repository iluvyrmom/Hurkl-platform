import type { PhotoAnalysisResult } from "@/lib/domain/photo-analysis";
import type { PhotoAnalysisInput, PhotoAnalysisProvider } from "./types";

/**
 * Default provider when no AI vision provider is configured. Never invents
 * detected items or a weight/volume figure — it honestly reports that the
 * photo needs manual review, which is what the New Estimate flow falls back
 * to (manual item entry) when this is what's active.
 */
export class MockPhotoAnalysisProvider implements PhotoAnalysisProvider {
  readonly name = "mock";

  async analyze(input: PhotoAnalysisInput): Promise<PhotoAnalysisResult> {
    return {
      photoId: input.photoId,
      provider: this.name,
      detectedItems: [],
      estimatedVolumeYards: null,
      estimatedWeightLbs: null,
      requiresManualReview: true,
      analyzedAt: new Date().toISOString(),
    };
  }
}
