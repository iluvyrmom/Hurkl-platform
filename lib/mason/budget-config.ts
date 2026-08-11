import { getServerEnv } from "../env";

/**
 * Hard server-side Anthropic spend ceilings. Configuration is
 * server-side environment variables only — there is no client-
 * reachable way to read or change these (see .env.example). Sane
 * conservative defaults apply when unset, so the guard is active even
 * before anyone configures it explicitly.
 *
 * Per-company ceilings exist alongside the HURKL-wide ones so a single
 * company (today: only the internal HURKL company has a channel)
 * cannot exhaust the whole platform's budget on its own, and so a
 * future second tenant is bounded independently of the first.
 */
export interface SpendCeilings {
  globalDailyUsd: number;
  globalMonthlyUsd: number;
  companyDailyUsd: number;
  companyMonthlyUsd: number;
}

// Conservative defaults for a single-tenant, low-volume internal dev
// channel — well under ARCHITECTURE.md §2a's ~$10-40/mo Claude API
// pilot estimate. Raise via env vars once real usage/volume justifies
// it; this is a ceiling, not a target (same cost-policy framing as
// ARCHITECTURE.md's overall estimate).
export const DEFAULT_SPEND_CEILINGS: SpendCeilings = {
  globalDailyUsd: 5,
  globalMonthlyUsd: 50,
  companyDailyUsd: 2,
  companyMonthlyUsd: 20,
};

function parsePositiveFloat(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getSpendCeilings(): SpendCeilings {
  const env = getServerEnv();
  return {
    globalDailyUsd: parsePositiveFloat(
      env.ANTHROPIC_DAILY_SPEND_CEILING_USD,
      DEFAULT_SPEND_CEILINGS.globalDailyUsd,
    ),
    globalMonthlyUsd: parsePositiveFloat(
      env.ANTHROPIC_MONTHLY_SPEND_CEILING_USD,
      DEFAULT_SPEND_CEILINGS.globalMonthlyUsd,
    ),
    companyDailyUsd: parsePositiveFloat(
      env.ANTHROPIC_COMPANY_DAILY_SPEND_CEILING_USD,
      DEFAULT_SPEND_CEILINGS.companyDailyUsd,
    ),
    companyMonthlyUsd: parsePositiveFloat(
      env.ANTHROPIC_COMPANY_MONTHLY_SPEND_CEILING_USD,
      DEFAULT_SPEND_CEILINGS.companyMonthlyUsd,
    ),
  };
}
