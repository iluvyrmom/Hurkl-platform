/**
 * The one centralized place that decides whether a company should be
 * billed. See docs/internal-ownership-system.md.
 *
 * No billing/Stripe integration exists yet anywhere in this codebase —
 * this module is the guardrail built ahead of that work, not a bypass
 * of anything real. Every future billing workflow (subscriptions,
 * invoices, Stripe checkout, plan-limit enforcement) MUST call
 * `getBillingDecision` rather than reading `companies.account_type`
 * itself, so "does this company get billed" stays one fact decided in
 * one place — never scattered `if (accountType === 'internal_hurkl')`
 * checks across the codebase.
 */

export type AccountType =
  "production_customer" | "internal_hurkl" | "demo" | "development" | "partner";

// Explicitly listed per the founder's spec: internal_hurkl and
// development are called out as always billing-exempt with full
// access; demo is explicitly "no billing." "partner" appears in the
// spec's list of account types but its billing behavior was never
// specified — deliberately NOT included here. A partner company is
// billed like a production customer until that's its own conscious
// decision (see docs/internal-ownership-system.md's open question).
const BILLING_EXEMPT_ACCOUNT_TYPES: ReadonlySet<AccountType> = new Set([
  "internal_hurkl",
  "development",
  "demo",
]);

export interface BillingDecision {
  requiresBilling: boolean;
  reason: string;
}

/** Pure decision logic — no I/O. Exported for direct unit testing. */
export function decideBilling(accountType: AccountType): BillingDecision {
  if (BILLING_EXEMPT_ACCOUNT_TYPES.has(accountType)) {
    return { requiresBilling: false, reason: `account_type '${accountType}' is billing-exempt` };
  }
  return { requiresBilling: true, reason: `account_type '${accountType}' is billed normally` };
}

/**
 * Minimal shape this function needs from a Supabase client — matches
 * both the real @supabase/supabase-js client and a test double,
 * without depending on the full SDK's types (same pattern as
 * lib/audit/log.ts's AuditLogWriter).
 */
export interface CompanyAccountTypeReader {
  from(table: "companies"): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        single(): PromiseLike<{
          data: { account_type: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

/**
 * Looks up a company's current account_type from the database and
 * returns the billing decision. Always re-checks the database — never
 * trust a client-supplied account_type, and never cache this across a
 * billing-relevant decision (SECURITY.md's "this cannot rely on the
 * client" requirement, applied here).
 */
export async function getBillingDecision(
  client: CompanyAccountTypeReader,
  companyId: string,
): Promise<BillingDecision> {
  const { data, error } = await client
    .from("companies")
    .select("account_type")
    .eq("id", companyId)
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to look up company account_type for billing decision: ${error?.message ?? "not found"}`,
    );
  }

  return decideBilling(data.account_type as AccountType);
}
