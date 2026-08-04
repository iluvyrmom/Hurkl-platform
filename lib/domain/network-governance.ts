/**
 * Domain contracts for HURKL Trusted Business Network (HTBN) governance
 * — see docs/business-intelligence/TRUSTED_TRADE_NETWORK.md.
 *
 * Types only. No runtime logic, no membership-decision logic, no
 * cross-tenant lookup mechanism, no database schema, no third-party
 * dependencies. Single-tenant perspective only: a tenant's own
 * membership status and the evidence behind it. Deliberately does not
 * model any cross-tenant "is this business a member" query — that is
 * its own conscious, reviewed cross-tenant design decision (see
 * ARCHITECTURE.md §4 and CLAUDE.md's permanent rules), not something to
 * derive from these types.
 *
 * Mason never decides membership — see StewardshipReviewRecommendation
 * below, which only ever recommends a review; only a HURKL
 * administrator, outside this contract entirely, makes the decision.
 */

export type NetworkMembershipStatus =
  "not_a_member" | "member" | "under_stewardship_review" | "on_improvement_plan" | "removed";

export type OperationalEvidenceCategory =
  | "licensing"
  | "insurance"
  | "certifications"
  | "equipment_maintenance"
  | "safety_compliance"
  | "documented_regulatory_actions"
  | "verified_customer_feedback"
  | "project_completion_history"
  | "documentation_quality"
  | "responsiveness"
  | "operational_organization";

export interface TenantOperationalEvidence {
  tenantId: string;
  category: OperationalEvidenceCategory;
  summary: string;
  observedAt: string;
  sourceReference?: string;
}

/**
 * Mason's private recommendation that a HURKL administrator review a
 * tenant's membership standing. This is a recommendation only — it
 * never changes NetworkMembershipStatus itself. See PRINCIPLES.md 003
 * and SECURITY.md §4's Tier 3 "never autonomous" rule.
 */
export interface StewardshipReviewRecommendation {
  tenantId: string;
  evidence: TenantOperationalEvidence[];
  reasonForReview: string;
  recommendedAt: string;
  requiresAdminDecision: true;
}

export interface ImprovementPlan {
  tenantId: string;
  issue: string;
  recommendedAction: string;
  reviewByDate: string;
  monitoringNotes?: string;
}
