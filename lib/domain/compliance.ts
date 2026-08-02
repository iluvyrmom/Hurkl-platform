/**
 * Domain contracts for the Operations Compliance Engine — see
 * docs/business-intelligence/OPERATIONS_COMPLIANCE.md.
 *
 * Types only. No runtime logic, no database schema, no provider
 * integration, no third-party dependencies. Tracks employee, company,
 * equipment/vehicle, and project-specific qualifications so Mason can
 * identify renewal needs before they become business consequences
 * (lost bid eligibility, jobsite removal, etc.) — this file defines
 * the shape of a compliance record and its lifecycle, never the
 * proprietary risk-scoring or renewal-sourcing logic behind it.
 */

export type ComplianceSubjectType = "employee" | "company" | "equipment" | "vehicle" | "project";

export type ComplianceCredentialType =
  // Employee
  | "forklift_certification"
  | "osha_10"
  | "osha_30"
  | "first_aid_cpr"
  | "cdl_medical_card"
  | "equipment_operator_certification"
  | "rigging_certification"
  | "scaffolding_certification"
  | "fall_protection_training"
  | "confined_space_training"
  | "trade_license"
  | "union_qualification"
  | "site_specific_orientation"
  | "background_check"
  | "drug_testing"
  | "twic_or_similar_access_credential"
  // Company
  | "contractor_license"
  | "business_license"
  | "general_liability_insurance"
  | "workers_compensation"
  | "commercial_auto_insurance"
  | "umbrella_policy"
  | "surety_bond"
  | "bid_bond"
  | "performance_bond"
  | "government_registration"
  | "public_works_prequalification"
  | "tax_payroll_compliance"
  | "industry_certification"
  // Equipment / vehicle
  | "forklift_inspection"
  | "crane_inspection"
  | "lift_inspection"
  | "dot_inspection"
  | "truck_registration"
  | "trailer_registration"
  | "fire_extinguisher_inspection"
  | "preventive_maintenance"
  | "equipment_permit"
  | "site_specific_equipment_approval"
  // Tenant-configurable
  | "other_tenant_configured_credential";

export type ComplianceStatus =
  | "currently_valid"
  | "expiring_soon"
  | "renewal_in_progress"
  | "expired"
  | "missing"
  | "not_applicable"
  | "unverified"
  | "waiver_or_exception_pending";

export interface ComplianceRecord {
  tenantId: string;
  subjectType: ComplianceSubjectType;
  subjectId: string;
  credentialType: ComplianceCredentialType;
  status: ComplianceStatus;
  issuedAt?: string;
  expiresAt?: string;
  evidenceReference?: string;
}

/**
 * A requirement, independent of whether it's currently met — e.g. "this
 * project requires a bid bond," or "this trade requires OSHA 30" —
 * evaluated against ComplianceRecords to produce a ComplianceGap.
 */
export interface ComplianceRequirement {
  credentialType: ComplianceCredentialType;
  subjectType: ComplianceSubjectType;
  leadTimeWarningDays: readonly number[];
  mandatory: boolean;
}

export type ComplianceGapClassification =
  | "impossible_before_deadline"
  | "potentially_correctable_before_deadline"
  | "long_term_growth_path_requirement";

export interface ComplianceGap {
  requirement: ComplianceRequirement;
  record?: ComplianceRecord;
  classification: ComplianceGapClassification;
  explanation: string;
}

/**
 * The output of evaluating a set of requirements against current
 * records for a specific opportunity/project — the connection point to
 * the Opportunity and Qualification Engines. See
 * docs/business-intelligence/QUALIFICATION_ENGINE.md.
 */
export interface ComplianceEvaluation {
  tenantId: string;
  subjectId: string;
  gaps: ComplianceGap[];
  isEligible: boolean;
}

export type RenewalActionType =
  | "locate_requirements"
  | "prepare_checklist"
  | "find_training_options"
  | "propose_training_dates"
  | "coordinate_employee_availability"
  | "prepare_registration_information"
  | "request_owner_approval"
  | "track_progress"
  | "store_evidence"
  | "update_expiration_date";

export interface RenewalAction {
  type: RenewalActionType;
  record: ComplianceRecord;
  requiresOwnerApproval: boolean;
}

export interface ComplianceAlert {
  tenantId: string;
  record: ComplianceRecord;
  leadTimeDays: number;
  businessImpact?: string;
}
