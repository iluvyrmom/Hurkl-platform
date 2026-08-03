/**
 * Domain contracts for Strategic Alliances and professional-relationship
 * recommendations — see docs/business-intelligence/STRATEGIC_ALLIANCES.md.
 *
 * Types only. No runtime logic, no cross-tenant data access, no
 * database schema, no third-party dependencies. Models a single
 * tenant's own external relationships and Mason's evaluation of them —
 * never the cross-tenant HURKL Trusted Trade Network. See
 * docs/business-intelligence/TRUSTED_TRADE_NETWORK.md, which
 * intentionally has no domain contract yet, pending its own,
 * separately-reviewed cross-tenant design decision (see
 * ARCHITECTURE.md §4 and CLAUDE.md's permanent rules).
 */

export type AllianceCapacityNeed =
  | "extra_crew"
  | "specialized_equipment"
  | "schedule_recovery"
  | "specialized_expertise"
  | "temporary_supervision"
  | "estimating_assistance"
  | "emergency_support";

export type RelationshipEvaluationFactor =
  | "reliability"
  | "professional_reputation"
  | "quality"
  | "payment_history"
  | "compatible_values"
  | "safety"
  | "communication"
  | "ability_to_honor_commitments"
  | "mutual_benefit"
  | "geographic_overlap"
  | "trade_compatibility";

export type AllianceCandidateType =
  | "former_coworker_owned_company"
  | "larger_respected_contractor"
  | "similar_stage_contractor"
  | "complementary_trade"
  | "industry_veteran"
  | "respected_competitor";

export interface AllianceCandidate {
  tenantId: string;
  name: string;
  candidateType: AllianceCandidateType;
  evaluationNotes?: Partial<Record<RelationshipEvaluationFactor, string>>;
}

/**
 * Mason's suggestion to the owner to consider an alliance — never an
 * alliance, contract, or commitment itself. See PRINCIPLES.md 003 and
 * 012.
 */
export interface AllianceRecommendation {
  tenantId: string;
  candidate: AllianceCandidate;
  capacityNeed?: AllianceCapacityNeed;
  recommendationText: string;
  requiresOwnerApproval: true;
}

export type CompetitorPatternSignal =
  | "repeated_competition_on_similar_projects"
  | "similar_project_size"
  | "similar_growth_trajectory"
  | "comparable_reputation"
  | "fair_competitive_behavior"
  | "aligned_standards"
  | "complementary_capacity";

/**
 * The "Respect-Worthy Competitors" pattern — a recommendation to open a
 * professional conversation, never an automatic alliance.
 */
export interface RespectWorthyCompetitorObservation {
  tenantId: string;
  competitorName: string;
  signals: CompetitorPatternSignal[];
  recommendationText: string;
}

export type LocalRelationshipType =
  | "general_contractor"
  | "subcontractor"
  | "architect"
  | "engineer"
  | "developer"
  | "supplier"
  | "property_manager"
  | "facility_manager"
  | "industry_association"
  | "respected_peer"
  | "mentor";

export interface LocalRelationshipReference {
  tenantId: string;
  relationshipType: LocalRelationshipType;
  name: string;
}

export type CommunicationBarrierSolution =
  | "translation_support"
  | "bilingual_staff"
  | "communication_training"
  | "clearer_documentation"
  | "meeting_preparation"
  | "multilingual_materials";
