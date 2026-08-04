/**
 * Domain contracts for Relationship Value — see
 * docs/business-intelligence/RELATIONSHIP_VALUE.md.
 *
 * Types only. No runtime logic, no scoring formulas, no database
 * schema, no third-party dependencies. Models the categories Mason
 * evaluates a customer relationship against, never the weighting or
 * scoring logic behind it.
 */

export type RelationshipValueFactor =
  | "repeat_work_potential"
  | "strategic_importance"
  | "payment_reliability"
  | "long_term_value"
  | "referral_potential"
  | "alignment_with_owner_goals";

/**
 * Mason's evaluation of a single customer relationship — a factor
 * breakdown to support a recommendation, never an automatic pricing or
 * acceptance decision. See PRINCIPLES.md 003.
 */
export interface CustomerRelationshipAssessment {
  tenantId: string;
  customerId: string;
  notesByFactor: Partial<Record<RelationshipValueFactor, string>>;
  recommendationText?: string;
}
