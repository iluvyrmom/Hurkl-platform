/**
 * Domain contracts for Verified Intelligence and Evidence-Based
 * Operations — see docs/business-intelligence/VERIFIED_INTELLIGENCE.md
 * and EVIDENCE_BASED_OPERATIONS.md.
 *
 * Types only. No runtime logic, no research crawler, no database
 * schema, no third-party dependencies. Defines the shape of a verified
 * finding and the evidence behind it, so Mason never presents an
 * unverified claim as fact — never the actual research, crawling, or
 * scoring logic itself.
 */

export type SourceAuthorityLevel =
  | "verified_company_record"
  | "official_government_or_regulatory_source"
  | "official_manufacturer_or_software_provider_documentation"
  | "official_industry_association_or_standards_body"
  | "other_reliable_source"
  | "requires_professional_review";

export type VerificationStatus =
  | "verified"
  | "unverified"
  | "pending_verification"
  | "interpretation_uncertain"
  | "requires_professional_review";

export interface Jurisdiction {
  level: "federal" | "state" | "county" | "city" | "other";
  name: string;
}

export interface EvidenceSource {
  authorityLevel: SourceAuthorityLevel;
  organization: string;
  documentTitle?: string;
  sectionOrReference?: string;
  url?: string;
  documentIdentifier?: string;
  publicationOrRevisionDate?: string;
}

export interface ReverificationRule {
  reverifyAfter: string;
  reason?: string;
}

export interface RegulatoryRequirement {
  jurisdiction: Jurisdiction;
  summary: string;
  source: EvidenceSource;
  status: VerificationStatus;
}

export interface VerifiedFinding {
  requirement: RegulatoryRequirement;
  verifiedAt: string;
  confidenceLevel: "high" | "medium" | "low";
  interpretationUncertain: boolean;
  reverification?: ReverificationRule;
}

/**
 * The full evidence-capture record for an important recommendation —
 * see EVIDENCE_BASED_OPERATIONS.md's field list.
 */
export interface EvidenceRecord {
  source: EvidenceSource;
  jurisdiction: Jurisdiction;
  summarizedRequirement: string;
  affectedSubjectType: "company" | "employee" | "equipment" | "project";
  affectedSubjectId: string;
  confidenceLevel: "high" | "medium" | "low";
  interpretationUncertain: boolean;
  verifiedAt: string;
  reverification?: ReverificationRule;
}

export interface RecommendationEvidence {
  evidence: EvidenceRecord;
  actionRecommended: string;
  actionTaken?: string;
  approvingPerson?: string;
}
