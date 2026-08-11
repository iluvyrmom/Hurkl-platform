import { estimateCostUsd, getModelConfig } from "./model-config";
import { getSpendCeilings } from "./budget-config";

export interface BudgetStatus {
  globalDailySpentUsd: number;
  globalDailyCeilingUsd: number;
  globalMonthlySpentUsd: number;
  globalMonthlyCeilingUsd: number;
  companyDailySpentUsd: number;
  companyDailyCeilingUsd: number;
  companyMonthlySpentUsd: number;
  companyMonthlyCeilingUsd: number;
}

export type ExceededCeiling =
  "global_daily" | "global_monthly" | "company_daily" | "company_monthly";

export interface BudgetDecision {
  allowed: boolean;
  /** Present only when allowed === false. */
  reason?: "budget_limit";
  /** Which specific ceiling triggered the block — for operator/audit visibility, never shown to the sender. */
  exceededCeiling?: ExceededCeiling;
  status: BudgetStatus;
}

/**
 * Minimal shape this module needs from a Supabase client — matches
 * both the real client and a test double, without depending on the
 * full SDK's types (same pattern as lib/audit/log.ts's AuditLogWriter).
 *
 * Filters chain in either order and the query is thenable at every
 * step (same behavior as the real PostgrestFilterBuilder), so a
 * caller can apply just `.gte()` for an unscoped, HURKL-wide sum, or
 * `.gte().eq()` / `.eq().gte()` for a company-scoped one.
 */
export interface SpendQuery extends PromiseLike<{
  data: { estimated_cost_usd: number | string | null }[] | null;
  error: unknown;
}> {
  eq(column: string, value: string): SpendQuery;
  gte(column: string, value: string): SpendQuery;
}

export interface SpendReader {
  from(table: "messages"): {
    select(columns: string): SpendQuery;
  };
}

function startOfDayUtcIso(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

function startOfMonthUtcIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * Sums `messages.estimated_cost_usd` since a cutoff — HURKL-wide when
 * `companyId` is omitted, scoped to one company when it's given.
 * Client-side sum over selected rows — fine at today's volume; revisit
 * with a real SQL aggregate (or a dedicated ledger table) if message
 * volume grows enough for this to matter.
 */
async function sumEstimatedCostSince(
  client: SpendReader,
  sinceIso: string,
  companyId?: string,
): Promise<number> {
  let query = client.from("messages").select("estimated_cost_usd").gte("created_at", sinceIso);
  if (companyId) {
    query = query.eq("company_id", companyId);
  }
  const { data, error } = await query;

  if (error || !data) return 0;
  return data.reduce((sum: number, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
}

/**
 * Real spend accounting — both the HURKL-wide (unscoped) figures and
 * one company's figures, for the same day/month window. `client`
 * should be the service-role admin client so the HURKL-wide sums
 * genuinely cover every company, not just the ones RLS would let an
 * ordinary caller see.
 */
export async function getBudgetStatus(
  client: SpendReader,
  companyId: string,
  now: Date = new Date(),
): Promise<BudgetStatus> {
  const ceilings = getSpendCeilings();
  const dayStart = startOfDayUtcIso(now);
  const monthStart = startOfMonthUtcIso(now);

  const [globalDailySpentUsd, globalMonthlySpentUsd, companyDailySpentUsd, companyMonthlySpentUsd] =
    await Promise.all([
      sumEstimatedCostSince(client, dayStart),
      sumEstimatedCostSince(client, monthStart),
      sumEstimatedCostSince(client, dayStart, companyId),
      sumEstimatedCostSince(client, monthStart, companyId),
    ]);

  return {
    globalDailySpentUsd,
    globalDailyCeilingUsd: ceilings.globalDailyUsd,
    globalMonthlySpentUsd,
    globalMonthlyCeilingUsd: ceilings.globalMonthlyUsd,
    companyDailySpentUsd,
    companyDailyCeilingUsd: ceilings.companyDailyUsd,
    companyMonthlySpentUsd,
    companyMonthlyCeilingUsd: ceilings.companyMonthlyUsd,
  };
}

/** Pure decision logic — no I/O. Exported for direct unit testing. */
export function evaluateBudget(status: BudgetStatus): BudgetDecision {
  if (status.globalDailySpentUsd >= status.globalDailyCeilingUsd) {
    return { allowed: false, reason: "budget_limit", exceededCeiling: "global_daily", status };
  }
  if (status.globalMonthlySpentUsd >= status.globalMonthlyCeilingUsd) {
    return { allowed: false, reason: "budget_limit", exceededCeiling: "global_monthly", status };
  }
  if (status.companyDailySpentUsd >= status.companyDailyCeilingUsd) {
    return { allowed: false, reason: "budget_limit", exceededCeiling: "company_daily", status };
  }
  if (status.companyMonthlySpentUsd >= status.companyMonthlyCeilingUsd) {
    return { allowed: false, reason: "budget_limit", exceededCeiling: "company_monthly", status };
  }
  return { allowed: true, status };
}

/**
 * The one hard server-side spend guard checked before every real
 * Anthropic request — HURKL-wide and per-company, daily and monthly.
 * No sender identity (including hurkl_admin/owner) is exempt: this
 * runs unconditionally in lib/communications/inbound.ts before any
 * tier's AI call, not just advanced_reasoning. Configuration
 * (lib/mason/budget-config.ts) is server-side environment only.
 *
 * `client` should be the service-role admin client so global figures
 * genuinely cover every company, not just the ones RLS would let an
 * ordinary caller see.
 */
export async function checkSpendBudget(
  client: SpendReader,
  companyId: string,
): Promise<BudgetDecision> {
  const status = await getBudgetStatus(client, companyId);
  return evaluateBudget(status);
}

/**
 * Whether escalating to advanced_reasoning for *this specific call*
 * would risk tipping any ceiling, given the current status and a rough
 * projected input-token count (the caller estimates this from the
 * assembled system prompt + message + history length — see
 * lib/communications/inbound.ts). Used to downgrade a single call to
 * the cheap tier rather than blocking Anthropic access entirely — the
 * broad "already over budget" block is evaluateBudget's job, checked
 * first and independent of tier.
 */
export function wouldExceedBudgetForAdvancedReasoning(
  status: BudgetStatus,
  projectedInputTokens: number,
): boolean {
  const config = getModelConfig("advanced_reasoning");
  const projectedCostUsd = estimateCostUsd(
    "advanced_reasoning",
    projectedInputTokens,
    config.maxOutputTokens,
  );
  return (
    status.globalDailySpentUsd + projectedCostUsd > status.globalDailyCeilingUsd ||
    status.globalMonthlySpentUsd + projectedCostUsd > status.globalMonthlyCeilingUsd ||
    status.companyDailySpentUsd + projectedCostUsd > status.companyDailyCeilingUsd ||
    status.companyMonthlySpentUsd + projectedCostUsd > status.companyMonthlyCeilingUsd
  );
}
