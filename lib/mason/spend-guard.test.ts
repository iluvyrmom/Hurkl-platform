import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluateBudget,
  getBudgetStatus,
  wouldExceedBudgetForAdvancedReasoning,
  type BudgetStatus,
  type SpendReader,
} from "./spend-guard";

function baseStatus(overrides: Partial<BudgetStatus> = {}): BudgetStatus {
  return {
    globalDailySpentUsd: 0,
    globalDailyCeilingUsd: 5,
    globalMonthlySpentUsd: 0,
    globalMonthlyCeilingUsd: 50,
    companyDailySpentUsd: 0,
    companyDailyCeilingUsd: 2,
    companyMonthlySpentUsd: 0,
    companyMonthlyCeilingUsd: 20,
    ...overrides,
  };
}

describe("evaluateBudget", () => {
  it("allows a request when every bucket is under its ceiling", () => {
    const decision = evaluateBudget(baseStatus());
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBeUndefined();
    expect(decision.exceededCeiling).toBeUndefined();
  });

  it("blocks and reports global_daily when the HURKL-wide daily ceiling is met", () => {
    const decision = evaluateBudget(baseStatus({ globalDailySpentUsd: 5 }));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("budget_limit");
    expect(decision.exceededCeiling).toBe("global_daily");
  });

  it("blocks and reports global_monthly when the HURKL-wide monthly ceiling is met", () => {
    const decision = evaluateBudget(baseStatus({ globalMonthlySpentUsd: 50 }));
    expect(decision.exceededCeiling).toBe("global_monthly");
  });

  it("blocks and reports company_daily when the per-company daily ceiling is met", () => {
    const decision = evaluateBudget(baseStatus({ companyDailySpentUsd: 2 }));
    expect(decision.exceededCeiling).toBe("company_daily");
  });

  it("blocks and reports company_monthly when the per-company monthly ceiling is met", () => {
    const decision = evaluateBudget(baseStatus({ companyMonthlySpentUsd: 20 }));
    expect(decision.exceededCeiling).toBe("company_monthly");
  });

  it("checks ceilings in a fixed order — global_daily wins when multiple are simultaneously met", () => {
    const decision = evaluateBudget(
      baseStatus({ globalDailySpentUsd: 5, companyDailySpentUsd: 2 }),
    );
    expect(decision.exceededCeiling).toBe("global_daily");
  });

  it("treats a ceiling exactly met (not just exceeded) as reached", () => {
    // >= , not > — a request that would land exactly on the ceiling is
    // still blocked, since the ceiling is a hard cap, not a target.
    expect(evaluateBudget(baseStatus({ globalDailySpentUsd: 5 })).allowed).toBe(false);
    expect(evaluateBudget(baseStatus({ globalDailySpentUsd: 4.99 })).allowed).toBe(true);
  });
});

describe("wouldExceedBudgetForAdvancedReasoning", () => {
  it("returns false when the projected cost keeps every bucket under its ceiling", () => {
    expect(wouldExceedBudgetForAdvancedReasoning(baseStatus(), 100)).toBe(false);
  });

  it("returns true when the projected cost would tip the company daily ceiling", () => {
    // companyDailyCeilingUsd is 2; already at 1.999999, so almost any
    // real advanced_reasoning call (input + max output tokens) tips it.
    const status = baseStatus({ companyDailySpentUsd: 1.999999 });
    expect(wouldExceedBudgetForAdvancedReasoning(status, 500)).toBe(true);
  });

  it("returns false for a tiny projected input when there is ample headroom", () => {
    const status = baseStatus({
      globalDailySpentUsd: 0,
      globalMonthlySpentUsd: 0,
      companyDailySpentUsd: 0,
      companyMonthlySpentUsd: 0,
    });
    expect(wouldExceedBudgetForAdvancedReasoning(status, 50)).toBe(false);
  });
});

interface FakeRow {
  company_id: string;
  created_at: string;
  estimated_cost_usd: number;
}

/**
 * Minimal in-memory double for SpendReader's chainable query surface —
 * filters progressively regardless of chain order, matching the real
 * PostgrestFilterBuilder's actual behavior described in spend-guard.ts.
 */
function createFakeSpendReader(rows: FakeRow[]): SpendReader {
  function makeQuery(filtered: FakeRow[]) {
    const query = {
      eq(column: string, value: string) {
        return makeQuery(
          filtered.filter((row) => (row as unknown as Record<string, unknown>)[column] === value),
        );
      },
      gte(column: string, value: string) {
        return makeQuery(
          filtered.filter(
            (row) => String((row as unknown as Record<string, unknown>)[column]) >= value,
          ),
        );
      },
      then<TResult1, TResult2 = never>(
        onfulfilled?:
          | ((value: {
              data: { estimated_cost_usd: number }[] | null;
              error: unknown;
            }) => TResult1 | PromiseLike<TResult1>)
          | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        return Promise.resolve({
          data: filtered.map((row) => ({ estimated_cost_usd: row.estimated_cost_usd })),
          error: null,
        }).then(onfulfilled, onrejected);
      },
    };
    return query;
  }

  return {
    from() {
      return {
        select() {
          return makeQuery(rows);
        },
      };
    },
  };
}

describe("getBudgetStatus", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("computes genuinely distinct HURKL-wide and per-company sums, not aliases of each other", async () => {
    const now = new Date("2026-08-15T12:00:00Z");
    const rows: FakeRow[] = [
      // company-a, today (this day AND this month)
      { company_id: "company-a", created_at: "2026-08-15T01:00:00Z", estimated_cost_usd: 1 },
      // company-a, earlier this month but not today
      { company_id: "company-a", created_at: "2026-08-10T00:00:00Z", estimated_cost_usd: 2 },
      // company-a, before this month — excluded from every bucket
      { company_id: "company-a", created_at: "2026-07-31T00:00:00Z", estimated_cost_usd: 4 },
      // company-b, today — must be counted in the HURKL-wide sums but
      // NOT in company-a's per-company sums.
      { company_id: "company-b", created_at: "2026-08-15T02:00:00Z", estimated_cost_usd: 8 },
    ];
    const reader = createFakeSpendReader(rows);

    const status = await getBudgetStatus(reader, "company-a", now);

    expect(status.companyDailySpentUsd).toBe(1);
    expect(status.companyMonthlySpentUsd).toBe(3);
    // HURKL-wide figures include company-b's spend too — this is the
    // exact bug this test guards against (global sums silently aliased
    // to the single company's sums).
    expect(status.globalDailySpentUsd).toBe(9);
    expect(status.globalMonthlySpentUsd).toBe(11);
  });
});
