/**
 * Domain contracts for the Operational Readiness Engine — see
 * docs/business-intelligence/OPERATIONAL_READINESS.md.
 *
 * Types only. No runtime logic, no dashboard implementation, no
 * database schema, no third-party dependencies. Models the daily
 * "are we ready to work today?" aggregation across People, Equipment,
 * Projects, Company, and Financial — never the scoring logic behind it.
 */

export type ReadinessCategory = "people" | "equipment" | "projects" | "company" | "financial";

export type ReadinessIssueSeverity = "informational" | "needs_attention" | "blocking";

/**
 * A single actionable readiness issue. DailyReadinessReport should
 * surface only these — never a full status listing of everything
 * that's fine.
 */
export interface ReadinessIssue {
  tenantId: string;
  category: ReadinessCategory;
  severity: ReadinessIssueSeverity;
  summary: string;
  sourceReference?: string;
}

export interface DailyReadinessReport {
  tenantId: string;
  asOf: string;
  issues: ReadinessIssue[];
  isReadyToWork: boolean;
}
