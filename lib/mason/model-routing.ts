/**
 * Deterministic model routing — Mason must not send every task to the
 * most expensive model. This mapping is the actual cost control:
 * cheap/deterministic handling for routine tasks, a stronger reasoning
 * tier only for the tasks that genuinely need it. See ARCHITECTURE.md
 * §2a and §5 (AI Router).
 *
 * This module makes the routing DECISION only — it never calls a real
 * AI provider. See lib/mason/providers/ai-model-provider.ts for the
 * provider interface (mock implementation only, for now).
 */

export type ModelTier = "low_cost" | "advanced_reasoning";

export type RoutableTaskType =
  // Low-cost / deterministic handling
  | "faq_answer"
  | "customer_lookup"
  | "scheduling_check"
  | "appointment_confirmation"
  | "invoice_calculation"
  | "message_classification"
  | "formatting"
  | "simple_summary"
  | "reminder_generation"
  | "policy_retrieval"
  | "contact_collection"
  // Advanced reasoning
  | "complex_business_strategy"
  | "conflicting_evidence"
  | "unusual_customer_dispute"
  | "high_value_recommendation"
  | "multi_step_planning"
  | "difficult_document_analysis"
  | "risk_sensitive_decision"
  | "complex_bid_or_estimate_analysis"
  | "hal_disagreement_review"
  | "mason_escalated";

const TASK_TIER: Readonly<Record<RoutableTaskType, ModelTier>> = {
  faq_answer: "low_cost",
  customer_lookup: "low_cost",
  scheduling_check: "low_cost",
  appointment_confirmation: "low_cost",
  invoice_calculation: "low_cost",
  message_classification: "low_cost",
  formatting: "low_cost",
  simple_summary: "low_cost",
  reminder_generation: "low_cost",
  policy_retrieval: "low_cost",
  contact_collection: "low_cost",

  complex_business_strategy: "advanced_reasoning",
  conflicting_evidence: "advanced_reasoning",
  unusual_customer_dispute: "advanced_reasoning",
  high_value_recommendation: "advanced_reasoning",
  multi_step_planning: "advanced_reasoning",
  difficult_document_analysis: "advanced_reasoning",
  risk_sensitive_decision: "advanced_reasoning",
  complex_bid_or_estimate_analysis: "advanced_reasoning",
  hal_disagreement_review: "advanced_reasoning",
  mason_escalated: "advanced_reasoning",
};

export function routeModelTier(taskType: RoutableTaskType): ModelTier {
  return TASK_TIER[taskType];
}
