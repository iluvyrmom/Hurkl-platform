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
 *
 * Two families, per Knowledge Capture Session 010
 * (HAL_SPECIALIST_WORKFORCE.md's "Operational Service-Delivery
 * Specialists" section): the original roster below this comment is
 * growth/business-development-facing (finding and winning tomorrow's
 * work); the "Operational service-delivery specialists" group below
 * that is operations-facing (running today's already-won work — every
 * tenant needs these, not just ones pursuing growth/BD).
 */
export type SpecialistType =
  // --- Growth / business-development specialists (original roster) ---
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
  | "memory_specialist"
  // --- Operational service-delivery specialists (Session 010) ---
  // The lead → qualification → estimate → calendar/capacity → booking
  // → invoice → follow-up pipeline every tenant runs, regardless of
  // industry — never named after any one trade (e.g. never "moving
  // estimator"); a tenant's industry is configuration this specialist
  // reads, not part of its identity, per CLAUDE.md's platform-neutrality
  // rule. Distinct from lead_center_specialist above, which scores
  // outbound growth/BD opportunities, not a tenant's own inbound leads.
  | "lead_qualification_specialist"
  | "estimating_specialist"
  | "calendar_capacity_specialist"
  | "invoice_specialist"
  | "sales_specialist"
  | "dispatch_specialist"
  | "customer_follow_up_specialist";
// Deliberately NOT adding separate "marketing" or "compliance" types
// here: marketing_specialist already exists above, and compliance is
// already covered by licensing_specialist/osha_specialist/
// building_code_specialist — narrower and more useful than one generic
// compliance type would be. See HAL_SPECIALIST_WORKFORCE.md.

/**
 * The Quality Assurance Layer a specialist report passes through
 * before it reaches Mason — never the owner directly, and never Mason
 * directly either, for findings material enough to warrant review.
 *
 * "critical_review" is the mandatory, universal stage: every report
 * passes through it, confirming the report is actually fact-based
 * before Mason ever sees it — the enforcement point for
 * VerificationStatus/VerifiedFinding discipline (see evidence.ts) at
 * the specialist-report stage, not just after Mason has already
 * synthesized a recommendation. The other roles are situational.
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
 * The Critical Review Specialist's (the founder's plain-language name:
 * "the Critic") classification for each claim in a specialist report —
 * Session 010's sharpening of the mandatory critical_review gate.
 * Distinct from evidence.ts's VerificationStatus, which classifies
 * regulatory/compliance findings specifically against a documented
 * source; this classifies any specialist claim (a price, a schedule
 * conflict, a recommendation) by how well-founded it is. The Critic
 * must actively assign one of these to each material claim, never
 * default to treating an unreviewed claim as a VERIFIED_FACT, and
 * Mason must never present a NEEDS_INFORMATION/UNKNOWN claim to the
 * owner or customer as though it were a VERIFIED_FACT. Enforces
 * Principle 008 (Verified Intelligence) at the specialist-report stage.
 */
export type ClaimVerificationClassification =
  | "verified_fact"
  | "supported_inference"
  | "estimate"
  | "assumption"
  | "needs_information";

/**
 * One claim from a specialist report, as classified by the Critic.
 * A SpecialistReport's "findings" text is free-form; this is the
 * structured, per-claim classification the Critic produces over it
 * before the report is allowed to reach Mason.
 */
export interface ClassifiedClaim {
  claim: string;
  classification: ClaimVerificationClassification;
  /** Why this classification, or what's missing for a stronger one. */
  rationale: string;
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
