import type { ModelTier } from "./model-routing";

/**
 * The one centralized place a routing tier maps to a real Anthropic
 * model ID. No other module may hardcode a model ID — this is what
 * "model selection through the router" means concretely, and it's what
 * lets a pricing or model-version change happen in one place.
 *
 * Pricing is for cost estimation/logging only — not billing-accurate,
 * and time-sensitive (Anthropic pricing changes). Last verified against
 * https://platform.claude.com/docs/en/pricing on 2026-08-10. Sonnet 5's
 * introductory rate ($2/$10 per MTok) expires 2026-08-31 and reverts to
 * $3/$15 — revisit this file before then.
 */
export interface ModelConfig {
  modelId: string;
  /** Hard cap on output tokens — the primary per-request cost control. */
  maxOutputTokens: number;
  /** Haiku-tier models reject `thinking`/`output_config.effort` — only Sonnet-and-above support them. */
  supportsEffort: boolean;
  effort?: "low" | "medium" | "high";
  pricePerMillionInputTokens: number;
  pricePerMillionOutputTokens: number;
}

const MODEL_CONFIG: Readonly<Record<ModelTier, ModelConfig>> = {
  low_cost: {
    modelId: "claude-haiku-4-5",
    maxOutputTokens: 400,
    supportsEffort: false,
    pricePerMillionInputTokens: 1.0,
    pricePerMillionOutputTokens: 5.0,
  },
  advanced_reasoning: {
    modelId: "claude-sonnet-5",
    maxOutputTokens: 1024,
    supportsEffort: true,
    effort: "medium",
    // Introductory pricing through 2026-08-31 — see file header.
    pricePerMillionInputTokens: 2.0,
    pricePerMillionOutputTokens: 10.0,
  },
};

export function getModelConfig(tier: ModelTier): ModelConfig {
  return MODEL_CONFIG[tier];
}

/** Rough cost estimate in USD — not billing-accurate. See file header. */
export function estimateCostUsd(
  tier: ModelTier,
  inputTokens: number,
  outputTokens: number,
): number {
  const config = getModelConfig(tier);
  return (
    (inputTokens / 1_000_000) * config.pricePerMillionInputTokens +
    (outputTokens / 1_000_000) * config.pricePerMillionOutputTokens
  );
}
