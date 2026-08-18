import type { PhotoAnalysisResult } from "@/lib/domain/photo-analysis";

export interface PhotoAnalysisInput {
  photoId: string;
  /** Publicly fetchable URL (e.g. a Supabase Storage signed URL) or data URI. */
  imageUrl: string;
}

/**
 * Abstraction over "look at these photos and estimate what's in them."
 * Swappable so OpenAI Vision can be replaced by another provider without
 * touching the estimator engine or New Estimate UI — see PhotoAnalysisResult
 * in lib/domain/photo-analysis.ts for the shared output shape.
 */
export interface PhotoAnalysisProvider {
  readonly name: string;
  analyze(input: PhotoAnalysisInput): Promise<PhotoAnalysisResult>;
}
