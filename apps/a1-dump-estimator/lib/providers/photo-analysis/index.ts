import type { PhotoAnalysisProvider } from "./types";
import { MockPhotoAnalysisProvider } from "./mock-provider";
import { OpenAIVisionPhotoAnalysisProvider } from "./openai-vision-provider";

export type { PhotoAnalysisProvider, PhotoAnalysisInput } from "./types";

/**
 * Provider selection: explicit opt-in only. Defaults to the mock so the
 * estimator always works locally with zero configuration and never silently
 * spends money on a real AI provider.
 */
export function getPhotoAnalysisProvider(): PhotoAnalysisProvider {
  const selected = process.env.PHOTO_ANALYSIS_PROVIDER ?? "mock";
  switch (selected) {
    case "openai":
      return new OpenAIVisionPhotoAnalysisProvider();
    case "mock":
    default:
      return new MockPhotoAnalysisProvider();
  }
}
