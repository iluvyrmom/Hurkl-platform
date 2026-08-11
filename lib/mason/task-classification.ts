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

/**
 * v1 heuristic — deliberately simple, deterministic, and explainable,
 * matching lib/mason/model-routing.ts's existing TASK_TIER mapping
 * style. Not a trained classifier. Defaults every ordinary message to
 * the cheapest tier and escalates only on an explicit complexity
 * signal, per the "default inexpensive, escalate only when justified"
 * cost-routing requirement.
 *
 * Message length alone is deliberately NOT a trigger: a long but
 * ordinary customer message (e.g. someone typing out full move
 * details) is still a simple task and shouldn't force the expensive
 * tier just because it's verbose — only actual complexity signals
 * should escalate. Revisit once real usage data shows this over- or
 * under-escalates.
 */
export function classifyMessageTaskType(text: string): RoutableTaskType {
  const lower = text.toLowerCase();
  const hasComplexitySignal = COMPLEXITY_SIGNAL_WORDS.some((word) => lower.includes(word));
  if (hasComplexitySignal) {
    return "complex_business_strategy";
  }
  return "faq_answer";
}
