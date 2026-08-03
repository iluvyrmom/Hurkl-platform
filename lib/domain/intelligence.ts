/**
 * Domain contracts for the Continuous Intelligence Engine — see
 * docs/business-intelligence/CONTINUOUS_INTELLIGENCE.md.
 *
 * Types only. No runtime logic, no research crawler, no database
 * schema, no third-party dependencies. Models the eight-step
 * detect → verify → preserve evidence → determine affected subjects →
 * recommend → request approval → update guidance → schedule
 * re-verification cycle — never the actual detection or research logic
 * behind it.
 */

import type { EvidenceRecord, VerificationStatus } from "./evidence";

export type IntelligenceChangeCategory =
  | "law_or_regulation"
  | "building_code"
  | "osha_or_safety_standard"
  | "product_or_material"
  | "equipment"
  | "certification_requirement"
  | "bid_system"
  | "software"
  | "supplier_relationship"
  | "market_condition"
  | "customer_expectation";

export type IntelligenceCycleStage =
  | "detected"
  | "verifying"
  | "verified"
  | "evidence_preserved"
  | "affected_subjects_determined"
  | "recommendation_prepared"
  | "pending_owner_approval"
  | "guidance_updated"
  | "reverification_scheduled";

export interface DetectedChange {
  category: IntelligenceChangeCategory;
  summary: string;
  detectedAt: string;
  status: VerificationStatus;
}

export interface AffectedSubjectReference {
  subjectType: "tenant" | "trade" | "employee" | "equipment" | "project";
  subjectId: string;
}

/**
 * A single pass through the eight-step cycle described in
 * CONTINUOUS_INTELLIGENCE.md, tying a detected change to its evidence,
 * who it affects, and what Mason recommends — never applied to policy
 * automatically; see stage "pending_owner_approval".
 */
export interface IntelligenceUpdateProposal {
  change: DetectedChange;
  evidence: EvidenceRecord;
  affectedSubjects: AffectedSubjectReference[];
  recommendedAction: string;
  stage: IntelligenceCycleStage;
  requiresOwnerApproval: boolean;
  reverifyAfter?: string;
}
