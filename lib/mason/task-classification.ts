import type { RoutableTaskType } from "./model-routing";

const COMPLEXITY_SIGNAL_WORDS = [
  "strategy",
  "strategic",
  "analyze",
  "analysis",
  "compare",
  "comparison",
  "recommend",
  "recommendation",
  "should i",
  "should we",
  "decide",
  "decision",
  "plan",
  "planning",
  "evaluate",
  "evaluation",
  "pros and cons",
  "trade-off",
  "tradeoff",
];

const LONG_MESSAGE_THRESHOLD_CHARS = 280;

/**
 * v1 heuristic — deliberately simple, deterministic, and explainable,
 * matching lib/mason/model-routing.ts's existing TASK_TIER mapping
 * style. Not a trained classifier. Defaults every ordinary message to
 * the cheapest tier and escalates only on an explicit complexity signal
 * or message length, per the "default inexpensive, escalate only when
 * justified" cost-routing requirement. Revisit once real usage data
 * shows this over- or under-escalates.
 */
export function classifyMessageTaskType(text: string): RoutableTaskType {
  const lower = text.toLowerCase();
  const hasComplexitySignal = COMPLEXITY_SIGNAL_WORDS.some((word) => lower.includes(word));
  if (hasComplexitySignal || text.length > LONG_MESSAGE_THRESHOLD_CHARS) {
    return "complex_business_strategy";
  }
  return "faq_answer";
}
