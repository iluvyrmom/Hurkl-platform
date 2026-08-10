import { describe, expect, it } from "vitest";
import { estimateCostUsd, getModelConfig } from "./model-config";

describe("getModelConfig", () => {
  it("maps low_cost to Haiku with no effort support", () => {
    const config = getModelConfig("low_cost");
    expect(config.modelId).toBe("claude-haiku-4-5");
    expect(config.supportsEffort).toBe(false);
  });

  it("maps advanced_reasoning to Sonnet 5 with effort support", () => {
    const config = getModelConfig("advanced_reasoning");
    expect(config.modelId).toBe("claude-sonnet-5");
    expect(config.supportsEffort).toBe(true);
  });
});

describe("estimateCostUsd", () => {
  it("computes a positive cost proportional to token counts", () => {
    const cost = estimateCostUsd("low_cost", 1_000_000, 1_000_000);
    const config = getModelConfig("low_cost");
    expect(cost).toBeCloseTo(
      config.pricePerMillionInputTokens + config.pricePerMillionOutputTokens,
      6,
    );
  });

  it("returns 0 for zero tokens", () => {
    expect(estimateCostUsd("advanced_reasoning", 0, 0)).toBe(0);
  });
});
