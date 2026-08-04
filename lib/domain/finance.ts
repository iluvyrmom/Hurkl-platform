/**
 * Domain contracts for the Financial Health Engine — see
 * docs/business-intelligence/FINANCIAL_HEALTH.md.
 *
 * Types only. No runtime logic, no accounting-platform integration, no
 * database schema, no third-party dependencies, and no tax-strategy
 * logic. Defines the shape of a tenant's cash position and the
 * provider-neutral interface a future accounting-platform integration
 * would implement. The accounting platform remains each tenant's
 * financial system of record — this file never replaces it and never
 * selects or integrates a real provider.
 */

export type CashCategory =
  | "operating_cash"
  | "payroll_obligation"
  | "tax_reserve"
  | "insurance_obligation"
  | "debt_obligation"
  | "committed_project_cost"
  | "true_discretionary_cash";

export interface CashPosition {
  tenantId: string;
  asOf: string;
  amountCentsByCategory: Record<CashCategory, number>;
}

export type FinancialReviewCycle = "monthly" | "quarterly" | "annual";

export type TaxDeadlineStatus = "upcoming" | "filed" | "paid" | "overdue" | "unverified";

export interface TaxDeadline {
  tenantId: string;
  jurisdiction: string;
  description: string;
  dueDate: string;
  reviewCycle?: FinancialReviewCycle;
  status: TaxDeadlineStatus;
}

export type FinancialDecisionCategory =
  | "equipment_purchase"
  | "vehicle_purchase"
  | "depreciation_timing"
  | "other_timing_sensitive_decision";

/**
 * A business decision Mason has identified as likely requiring tax
 * analysis — never a tax strategy or recommendation itself. Mason
 * surfaces the issue and defers to current official rules and a
 * qualified professional (see VERIFIED_INTELLIGENCE.md's
 * "requires_professional_review" tier).
 */
export interface FinancialDecisionForReview {
  tenantId: string;
  description: string;
  category: FinancialDecisionCategory;
  requiresProfessionalTaxReview: true;
}

export type AccountingPlatform = "quickbooks" | "xero" | "freshbooks" | "wave" | "other";

/**
 * Internal-only abstraction over an established accounting platform.
 * The accounting platform remains the tenant's financial system of
 * record; Mason coordinates records, deadlines, documents, and
 * workflows around it. No provider is selected or integrated by this
 * file.
 */
export interface AccountingProvider {
  platform: AccountingPlatform;
  getCashPosition(tenantId: string): Promise<CashPosition>;
  getUpcomingTaxDeadlines(tenantId: string): Promise<TaxDeadline[]>;
  listMissingInformation(tenantId: string): Promise<string[]>;
  areObligationsCurrent(tenantId: string): Promise<boolean>;
}
