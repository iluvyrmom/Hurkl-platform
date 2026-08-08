import { describe, expect, it } from "vitest";
import { DEFAULT_ITEM_WEIGHT_LBS, DEFAULT_ITEM_VOLUME_YARDS, TIER_PRICING } from "./constants";

/**
 * These constants must never be mutated at runtime — pricing changes are a
 * deliberate, owner-approved code change (a bumped ESTIMATOR_MODEL_VERSION),
 * never something the learning system or any other code path writes back
 * automatically. Object.freeze makes an attempted mutation throw instead of
 * silently succeeding; these tests prove that's actually wired up, not just
 * asserted in a comment.
 */
describe("estimator constants are frozen against runtime mutation", () => {
  it("throws when attempting to mutate DEFAULT_ITEM_WEIGHT_LBS", () => {
    expect(() => {
      // @ts-expect-error -- intentionally violating readonly to prove the runtime freeze
      DEFAULT_ITEM_WEIGHT_LBS.general_junk = 999;
    }).toThrow(TypeError);
  });

  it("throws when attempting to mutate DEFAULT_ITEM_VOLUME_YARDS", () => {
    expect(() => {
      // @ts-expect-error -- intentionally violating readonly to prove the runtime freeze
      DEFAULT_ITEM_VOLUME_YARDS.mattresses = 999;
    }).toThrow(TypeError);
  });

  it("throws when attempting to mutate TIER_PRICING or its nested tier objects", () => {
    expect(() => {
      // @ts-expect-error -- intentionally violating readonly to prove the runtime freeze
      TIER_PRICING.recommended = { contingencyRate: 0, marginRate: 0 };
    }).toThrow(TypeError);

    expect(() => {
      // @ts-expect-error -- intentionally violating readonly to prove the runtime freeze
      TIER_PRICING.recommended.marginRate = 0.99;
    }).toThrow(TypeError);
  });
});
