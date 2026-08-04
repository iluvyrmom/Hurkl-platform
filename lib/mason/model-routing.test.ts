import { describe, expect, it } from "vitest";
import { routeModelTier } from "./model-routing";

describe("routeModelTier", () => {
  it("routes routine, deterministic tasks to the low-cost tier", () => {
    const lowCostTasks = [
      "faq_answer",
      "customer_lookup",
      "scheduling_check",
      "appointment_confirmation",
      "invoice_calculation",
      "message_classification",
      "formatting",
      "simple_summary",
      "reminder_generation",
      "policy_retrieval",
      "contact_collection",
    ] as const;
    for (const task of lowCostTasks) {
      expect(routeModelTier(task)).toBe("low_cost");
    }
  });

  it("routes genuinely hard reasoning tasks to advanced_reasoning", () => {
    const advancedTasks = [
      "complex_business_strategy",
      "conflicting_evidence",
      "unusual_customer_dispute",
      "high_value_recommendation",
      "multi_step_planning",
      "difficult_document_analysis",
      "risk_sensitive_decision",
      "complex_bid_or_estimate_analysis",
      "hal_disagreement_review",
      "mason_escalated",
    ] as const;
    for (const task of advancedTasks) {
      expect(routeModelTier(task)).toBe("advanced_reasoning");
    }
  });
});
