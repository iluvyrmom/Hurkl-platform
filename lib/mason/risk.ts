/**
 * Risk classification — Step 3 of Mason's thinking system, and the
 * concrete link between an action and SECURITY.md §4's autonomy tiers.
 * The mapping is exhaustive (TypeScript enforces every ActionCategory
 * has an entry) so a newly added action can never silently default to
 * a risk level nobody chose.
 */
import type { AutonomyTier } from "../audit/log";

export type RiskLevel = "low" | "medium" | "high";

export type ActionCategory =
  // Low risk — Mason may handle automatically
  | "answer_common_question"
  | "take_message"
  | "collect_lead_info"
  | "schedule_within_rules"
  | "send_reminder"
  | "send_approved_invoice"
  | "provide_job_status"
  | "record_customer_note"
  | "confirm_appointment"
  // Medium risk — Mason may prepare the action; confirmation may be
  // required depending on tenant configuration
  | "apply_discount"
  | "move_appointment_outside_rules"
  | "create_invoice_unusual_charges"
  | "make_customer_promise"
  | "issue_credit"
  | "change_job_scope"
  | "send_sensitive_company_info"
  // High risk — owner approval required
  | "large_financial_commitment"
  | "refund_above_threshold"
  | "quote_above_threshold"
  | "contract_change"
  | "legal_admission"
  | "employee_discipline"
  | "change_company_pricing"
  | "send_money"
  | "take_loan"
  | "accept_unusual_liability"
  | "delete_important_record"
  | "reveal_confidential_information";

const ACTION_RISK: Readonly<Record<ActionCategory, RiskLevel>> = {
  answer_common_question: "low",
  take_message: "low",
  collect_lead_info: "low",
  schedule_within_rules: "low",
  send_reminder: "low",
  send_approved_invoice: "low",
  provide_job_status: "low",
  record_customer_note: "low",
  confirm_appointment: "low",

  apply_discount: "medium",
  move_appointment_outside_rules: "medium",
  create_invoice_unusual_charges: "medium",
  make_customer_promise: "medium",
  issue_credit: "medium",
  change_job_scope: "medium",
  send_sensitive_company_info: "medium",

  large_financial_commitment: "high",
  refund_above_threshold: "high",
  quote_above_threshold: "high",
  contract_change: "high",
  legal_admission: "high",
  employee_discipline: "high",
  change_company_pricing: "high",
  send_money: "high",
  take_loan: "high",
  accept_unusual_liability: "high",
  delete_important_record: "high",
  reveal_confidential_information: "high",
};

export function classifyRisk(action: ActionCategory): RiskLevel {
  return ACTION_RISK[action];
}

const RISK_TO_AUTONOMY_TIER: Readonly<Record<RiskLevel, AutonomyTier>> = {
  low: "tier_1_automatic",
  medium: "tier_2_approval_required",
  high: "tier_3_never_autonomous",
};

/**
 * The direct link from a classified action to SECURITY.md §4's
 * autonomy tiers. "Medium" maps to Tier 2 by default; a tenant may
 * configure a narrowly-scoped, pre-approved workflow that runs a
 * specific medium-risk action at Tier 1 instead (see SECURITY.md §4's
 * bid-submission example) — that override happens above this function,
 * which only expresses the default.
 */
export function defaultAutonomyTierFor(action: ActionCategory): AutonomyTier {
  return RISK_TO_AUTONOMY_TIER[classifyRisk(action)];
}
