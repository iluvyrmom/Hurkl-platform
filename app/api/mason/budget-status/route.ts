import { NextResponse } from "next/server";
import { authErrorResponse } from "../../../../lib/auth/http-errors";
import { requireAuthedUser, UnauthorizedError } from "../../../../lib/auth/session";
import { HURKL_INTERNAL_COMPANY_ID } from "../../../../lib/communications/internal-company";
import {
  evaluateBudget,
  getBudgetStatus,
  type SpendReader,
} from "../../../../lib/mason/spend-guard";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

// Reads live spend accumulated so far this day/month — never statically
// cached, same reasoning as app/api/health/route.ts.
export const dynamic = "force-dynamic";

/**
 * Sanitized, read-only view of the hard Anthropic spend guard
 * (lib/mason/spend-guard.ts) — hurkl_admin only. Exposes aggregate
 * numbers only (spent/ceiling per bucket, whether a limit is currently
 * reached, which one) — never message content, never secrets, and
 * nothing here can change a ceiling. Ceilings are configured
 * server-side only (lib/mason/budget-config.ts) with no write path
 * from this or any other route.
 *
 * requireCompanyProfile can't be reused here: hurkl_admin profiles
 * have company_id = null by design (they're not scoped to one
 * tenant), so that helper would incorrectly reject every legitimate
 * caller of this route. This does its own manual role check instead.
 *
 * Uses the caller's own RLS-scoped session client, not the
 * service-role admin client — the messages_select_own_company RLS
 * policy already includes an `OR is_hurkl_admin()` bypass (see
 * supabase/migrations/00000000000004_communications.sql), so an
 * authenticated hurkl_admin can already read every company's spend
 * rows through their own session, with no elevated credential needed
 * for a read-only operational query.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await requireAuthedUser(supabase);

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (error || !profile || profile.role !== "hurkl_admin") {
      throw new UnauthorizedError();
    }

    const url = new URL(request.url);
    const companyId = url.searchParams.get("companyId") ?? HURKL_INTERNAL_COMPANY_ID;

    // See lib/communications/inbound.ts for why this cast is needed:
    // matching the real SupabaseClient directly against SpendReader's
    // chainable interface blows TypeScript's instantiation-depth limit
    // (TS2589). The real client satisfies SpendReader's shape at
    // runtime.
    const status = await getBudgetStatus(supabase as unknown as SpendReader, companyId);
    const decision = evaluateBudget(status);

    return NextResponse.json({
      companyId,
      global: {
        dailySpentUsd: status.globalDailySpentUsd,
        dailyCeilingUsd: status.globalDailyCeilingUsd,
        monthlySpentUsd: status.globalMonthlySpentUsd,
        monthlyCeilingUsd: status.globalMonthlyCeilingUsd,
      },
      company: {
        dailySpentUsd: status.companyDailySpentUsd,
        dailyCeilingUsd: status.companyDailyCeilingUsd,
        monthlySpentUsd: status.companyMonthlySpentUsd,
        monthlyCeilingUsd: status.companyMonthlyCeilingUsd,
      },
      limitReached: !decision.allowed,
      exceededCeiling: decision.exceededCeiling ?? null,
    });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
