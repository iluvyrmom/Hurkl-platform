/**
 * Domain contracts for HAL (HURKL Agent Library) and Mason's Executive
 * Architecture — see docs/business-intelligence/HAL_SPECIALIST_WORKFORCE.md
 * and ARCHITECTURE.md §1c.
 *
 * Types only. No runtime logic, no agent execution, no AI provider
 * calls, no database schema, no third-party dependencies. Mason is the
 * Executive (COO); these types define the deterministic shape of a
 * specialist, its report, the Assurance Layer that reviews it before
 * Mason sees it, and Mason's own decision checklist — never the
 * proprietary logic behind any individual specialist's judgment.
 *
 * Do NOT build autonomous production agents from these types yet —
 * this is architecture and contracts only, per Knowledge Capture
 * Session 009.
 */

/**
 * The deterministic registry of specialists Mason may delegate to.
 * Founder-specified initial set — "and many more to be added over
 * time" per HAL_SPECIALIST_WORKFORCE.md. Adding a specialist means
 * adding a value here and a corresponding SpecialistDefinition, never
 * expanding what Mason personally "knows."
 */
export type SpecialistType =
  | "permit_specialist"
  | "property_specialist"
  | "developer_intelligence_specialist"
  | "bid_center_specialist"
  | "lead_center_specialist"
  | "osha_specialist"
  | "licensing_specialist"
  | "equipment_specialist"
  | "fleet_specialist"
  | "maintenance_specialist"
  | "receivables_specialist"
  | "tax_readiness_specialist"
  | "payroll_specialist"
  | "accounting_specialist"
  | "relationship_specialist"
  | "marketing_specialist"
  | "deferrd_specialist"
  | "research_specialist"
  | "building_code_specialist"
  | "financial_exposure_specialist"
  | "strategic_intelligence_specialist"
  | "memory_specialist";

/**
 * The Quality Assurance Layer a specialist report passes through
 * before it reaches Mason — never the owner directly, and never Mason
 * directly either, for findings material enough to warrant review.
 */
export type AssuranceSpecialistRole =
  "evidence_verification" | "critical_review" | "risk" | "conflict_resolution" | "audit";

export type EscalationTrigger =
  | "confidence_below_threshold"
  | "conflicting_specialist_conclusions"
  | "missing_required_evidence"
  | "exceeds_execution_limits"
  | "outside_approved_permissions"
  | "strategic_decision_detected";

/**
 * The common contract every HAL specialist shares — the shape that
 * lets Mason coordinate hundreds of narrow specialists without
 * becoming one enormous AI prompt. One responsibility, one mission,
 * one specialty per specialist; nothing here grants a specialist
 * authority beyond what's explicitly listed.
 */
export interface SpecialistDefinition {
  type: SpecialistType;
  mission: string;
  responsibility: string;
  permissions: readonly string[];
  requiredEvidenceCategories: readonly string[];
  escalationTriggers: readonly EscalationTrigger[];
  executionLimits: {
    maxRequestsPerConversation?: number;
    maxConcurrentExecutions?: number;
  };
  auditRequired: true;
}

export type SpecialistConfidenceLevel = "high" | "medium" | "low";

/**
 * A specialist's output, before Assurance Layer review. Never
 * delivered to the owner directly — see ReportingHierarchyStage.
 *
 * Every report passes through the "critical_review" AssuranceSpecialistRole
 * unconditionally — that stage is the mandatory, universal gate that
 * looks over everything before Mason ever sees it. requiresAdditionalAssuranceStages
 * governs only whether the *other* stages (evidence_verification, risk,
 * conflict_resolution, audit) are warranted for this particular report.
 */
export interface SpecialistReport {
  tenantId: string;
  specialistType: SpecialistType;
  findings: string;
  confidenceLevel: SpecialistConfidenceLevel;
  evidenceReferences: readonly string[];
  requiresAdditionalAssuranceStages: boolean;
  escalations: readonly EscalationTrigger[];
}

export interface AssuranceReviewResult {
  role: AssuranceSpecialistRole;
  report: SpecialistReport;
  passed: boolean;
  notes: string;
}

/**
 * The permanent reporting hierarchy: a specialist report always flows
 * through the mandatory Critical Review stage (plus whichever other
 * assurance stages it warrants), then to Mason, then — only if Mason's
 * decision checklist requires it — to the owner. See
 * HAL_SPECIALIST_WORKFORCE.md's reporting-structure diagram.
 */
export type ReportingHierarchyStage = "specialist" | "assurance_layer" | "mason" | "owner";

/**
 * Mason's decision checklist — see HAL_SPECIALIST_WORKFORCE.md's
 * "Mason's Decision Process." The output is always one of two things:
 * Mason decides within approved authority, or the owner must decide.
 * Never a third option where a specialist or the Assurance Layer
 * decides on the owner's behalf.
 */
export interface MasonDecisionAssessment {
  tenantId: string;
  trustsEvidence: boolean;
  specialistsInAgreement: boolean;
  hasBeenReviewedByAssuranceLayer: boolean;
  remainingUncertainty?: string;
  alignsWithOwnerVision: boolean;
  outcome: "mason_can_decide" | "owner_decision_required";
  recommendationToOwner?: string;
}
