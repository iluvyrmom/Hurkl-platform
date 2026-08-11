import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SPEND_CEILINGS, getSpendCeilings } from "./budget-config";

describe("getSpendCeilings", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back to the conservative defaults when nothing is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "test");
    vi.stubEnv("ANTHROPIC_DAILY_SPEND_CEILING_USD", "");
    vi.stubEnv("ANTHROPIC_MONTHLY_SPEND_CEILING_USD", "");
    vi.stubEnv("ANTHROPIC_COMPANY_DAILY_SPEND_CEILING_USD", "");
    vi.stubEnv("ANTHROPIC_COMPANY_MONTHLY_SPEND_CEILING_USD", "");

    expect(getSpendCeilings()).toEqual(DEFAULT_SPEND_CEILINGS);
  });

  it("reads a valid configured ceiling from the environment", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "test");
    vi.stubEnv("ANTHROPIC_DAILY_SPEND_CEILING_USD", "12.5");
    vi.stubEnv("ANTHROPIC_MONTHLY_SPEND_CEILING_USD", "100");
    vi.stubEnv("ANTHROPIC_COMPANY_DAILY_SPEND_CEILING_USD", "3");
    vi.stubEnv("ANTHROPIC_COMPANY_MONTHLY_SPEND_CEILING_USD", "30");

    expect(getSpendCeilings()).toEqual({
      globalDailyUsd: 12.5,
      globalMonthlyUsd: 100,
      companyDailyUsd: 3,
      companyMonthlyUsd: 30,
    });
  });

  it("falls back to the default for a non-numeric configured value", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "test");
    vi.stubEnv("ANTHROPIC_DAILY_SPEND_CEILING_USD", "not-a-number");

    expect(getSpendCeilings().globalDailyUsd).toBe(DEFAULT_SPEND_CEILINGS.globalDailyUsd);
  });

  it("falls back to the default for a zero or negative configured value", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "test");
    vi.stubEnv("ANTHROPIC_MONTHLY_SPEND_CEILING_USD", "0");
    expect(getSpendCeilings().globalMonthlyUsd).toBe(DEFAULT_SPEND_CEILINGS.globalMonthlyUsd);

    vi.stubEnv("ANTHROPIC_MONTHLY_SPEND_CEILING_USD", "-5");
    expect(getSpendCeilings().globalMonthlyUsd).toBe(DEFAULT_SPEND_CEILINGS.globalMonthlyUsd);
  });
});
