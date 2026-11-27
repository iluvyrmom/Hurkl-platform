import type { PhotoAnalysisResult, DetectedItem } from "@/lib/domain/photo-analysis";
import type { DebrisCategory } from "@/lib/domain/facility";
import { ProviderNotConfiguredError } from "../errors";
import type { PhotoAnalysisInput, PhotoAnalysisProvider } from "./types";

const DEBRIS_CATEGORIES: DebrisCategory[] = [
  "general_junk",
  "yard_debris",
  "construction_debris",
  "appliances",
  "tires",
  "electronics",
  "mattresses",
  "furniture",
  "metal_scrap",
  "hazmat",
];

/**
 * OpenAI Vision-backed implementation. Requires OPENAI_API_KEY.
 *
 * IMPORTANT: this code has not been executed against a live API key in this
 * environment (no paid provider was activated to build Phase 1, per the
 * repo's cost-conscious build practice). The request shape follows OpenAI's
 * documented Chat Completions image-input format as of this writing; verify
 * against current OpenAI API docs and test with a real key before relying on
 * it for a real estimate.
 */
export class OpenAIVisionPhotoAnalysisProvider implements PhotoAnalysisProvider {
  readonly name = "openai-vision";

  private readonly apiKey: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ProviderNotConfiguredError("OpenAIVisionPhotoAnalysisProvider", [
        "OPENAI_API_KEY",
      ]);
    }
    this.apiKey = apiKey;
  }

  async analyze(input: PhotoAnalysisInput): Promise<PhotoAnalysisResult> {
    const prompt = [
      "You are estimating junk-removal volume for a dump-run quote.",
      `Identify visible items, choosing a category from: ${DEBRIS_CATEGORIES.join(", ")}.`,
      "Respond with strict JSON only: ",
      '{"items":[{"label":string,"category":string,"quantity":number,"estimatedWeightLbs":number|null,"confidence":number}],',
      '"estimatedVolumeYards":number|null,"estimatedWeightLbs":number|null}',
    ].join(" ");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: input.imageUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI Vision request failed (${response.status}): ${await response.text()}`,
      );
    }

    const payload = await response.json();
    const content: string | undefined = payload?.choices?.[0]?.message?.content;
    if (!content) {
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

    const parsed = JSON.parse(content) as {
      items?: Array<{
        label: string;
        category: string;
        quantity: number;
        estimatedWeightLbs: number | null;
        confidence: number;
      }>;
      estimatedVolumeYards?: number | null;
      estimatedWeightLbs?: number | null;
    };

    const detectedItems: DetectedItem[] = (parsed.items ?? []).map((item) => ({
      label: item.label,
      category: DEBRIS_CATEGORIES.includes(item.category as DebrisCategory)
        ? (item.category as DebrisCategory)
        : "general_junk",
      estimatedQuantity: item.quantity,
      estimatedWeightLbs: item.estimatedWeightLbs,
      confidence: item.confidence,
    }));

    return {
      photoId: input.photoId,
      provider: this.name,
      detectedItems,
      estimatedVolumeYards: parsed.estimatedVolumeYards ?? null,
      estimatedWeightLbs: parsed.estimatedWeightLbs ?? null,
      requiresManualReview: detectedItems.length === 0,
      analyzedAt: new Date().toISOString(),
    };
  }
}
