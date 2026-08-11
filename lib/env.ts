/**
 * Typed, fail-fast environment variable access.
 *
 * Two exports, two audiences:
 *  - getServerEnv() — server-only. Never import this from a Client Component
 *    or pass its return value as a prop into one; that would leak secrets
 *    into the client bundle.
 *  - getClientEnv() — safe for the browser. Every field here must come from
 *    a NEXT_PUBLIC_ variable, because only those are inlined by Next.js at
 *    build time; anything else silently reads as undefined on the client.
 *
 * Phase discipline: only APP_ENV is required as of Phase 1 (M1.2). Every
 * other field is optional and stays that way until the milestone that wires
 * up its provider makes it required — see the `phase` comment on each field.
 * Do not flip a field to required ahead of the phase that actually uses it.
 */

export type AppEnv = "local" | "test" | "staging" | "production";

/** The single canonical list of valid values — import this, never re-list them. */
export const APP_ENVS: readonly AppEnv[] = ["local", "test", "staging", "production"];

function isAppEnv(value: string | undefined): value is AppEnv {
  return !!value && (APP_ENVS as readonly string[]).includes(value);
}

function invalidAppEnvMessage(value: string | undefined): string {
  return `NEXT_PUBLIC_APP_ENV is required and must be one of ${APP_ENVS.join(", ")} (got: ${
    value === undefined ? "unset" : JSON.stringify(value)
  })`;
}

function fail(errors: string[]): never {
  throw new Error(
    "Invalid environment configuration:\n" +
      errors.map((e) => `  - ${e}`).join("\n") +
      "\n\nSee .env.example and docs/development.md for the full variable list and which phase requires each one.",
  );
}

export interface ServerEnv {
  APP_ENV: AppEnv;

  // Phase 4 (M1.4) — Supabase. Server-side secret key only; the project URL
  // and publishable key are client-safe and live in ClientEnv instead.
  SUPABASE_SERVICE_ROLE_KEY?: string;

  // Phase 6 — AI model provider (Anthropic Claude, behind AIModelProvider).
  ANTHROPIC_API_KEY?: string;

  // Phase 8 — voice pipeline (Voice Gateway, a separate always-on service;
  // these are read there too, not just in this Next.js app).
  ELEVENLABS_API_KEY?: string;
  DEEPGRAM_API_KEY?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;

  // Phase 7 (M1.7) — Trigger.dev background jobs.
  TRIGGER_SECRET_KEY?: string;

  // Phase 6 (M1.6) — error tracking.
  SENTRY_DSN?: string;

  // Phase 9 — email provider (Resend).
  RESEND_API_KEY?: string;

  // Telegram — Mason's first communication channel (internal/dev use;
  // see docs/communications-architecture.md). TELEGRAM_BOT_TOKEN
  // authenticates this app to Telegram's Bot API (real Bot API calls
  // only happen once it's set — lib/communications/telegram-adapter.ts
  // throws a clear error otherwise, the same "mock until configured"
  // pattern as every other provider). TELEGRAM_WEBHOOK_SECRET is
  // checked against Telegram's `X-Telegram-Bot-Api-Secret-Token`
  // header once a webhook is actually registered (Phase 8-adjacent —
  // requires a public deployment, which doesn't exist yet); optional
  // until then.
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;

  // Real Mason reasoning — hard server-side Anthropic spend ceilings
  // (lib/mason/budget-config.ts, lib/mason/spend-guard.ts). Optional:
  // sane conservative defaults apply when unset. Server-side only —
  // there is no client-reachable way to change these.
  ANTHROPIC_DAILY_SPEND_CEILING_USD?: string;
  ANTHROPIC_MONTHLY_SPEND_CEILING_USD?: string;
  ANTHROPIC_COMPANY_DAILY_SPEND_CEILING_USD?: string;
  ANTHROPIC_COMPANY_MONTHLY_SPEND_CEILING_USD?: string;
}

export interface ClientEnv {
  NEXT_PUBLIC_APP_ENV: AppEnv;

  // Phase 4 (M1.4) — Supabase project URL and publishable ("anon") key.
  // Both are designed by Supabase to be public: the URL is just the
  // project's REST endpoint, and the publishable key is safe to ship to the
  // browser because Row-Level Security — not secrecy of this key — is what
  // actually protects tenant data.
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
}

/**
 * Server-only. Throws a single, clearly-worded Error listing every problem
 * at once if required variables are missing or invalid — call this once,
 * eagerly, at process startup (see instrumentation.ts), not lazily deep
 * inside a feature.
 */
export function getServerEnv(): ServerEnv {
  const errors: string[] = [];
  const rawAppEnv = process.env.NEXT_PUBLIC_APP_ENV;

  if (!isAppEnv(rawAppEnv)) {
    errors.push(invalidAppEnvMessage(rawAppEnv));
  }

  if (errors.length > 0) {
    fail(errors);
  }

  return {
    APP_ENV: rawAppEnv as AppEnv,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TRIGGER_SECRET_KEY: process.env.TRIGGER_SECRET_KEY,
    SENTRY_DSN: process.env.SENTRY_DSN,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
    ANTHROPIC_DAILY_SPEND_CEILING_USD: process.env.ANTHROPIC_DAILY_SPEND_CEILING_USD,
    ANTHROPIC_MONTHLY_SPEND_CEILING_USD: process.env.ANTHROPIC_MONTHLY_SPEND_CEILING_USD,
    ANTHROPIC_COMPANY_DAILY_SPEND_CEILING_USD:
      process.env.ANTHROPIC_COMPANY_DAILY_SPEND_CEILING_USD,
    ANTHROPIC_COMPANY_MONTHLY_SPEND_CEILING_USD:
      process.env.ANTHROPIC_COMPANY_MONTHLY_SPEND_CEILING_USD,
  };
}

/**
 * Safe to call from Client Components. Only reads NEXT_PUBLIC_ variables.
 */
export function getClientEnv(): ClientEnv {
  const errors: string[] = [];
  const rawAppEnv = process.env.NEXT_PUBLIC_APP_ENV;

  if (!isAppEnv(rawAppEnv)) {
    errors.push(invalidAppEnvMessage(rawAppEnv));
  }

  if (errors.length > 0) {
    fail(errors);
  }

  return {
    NEXT_PUBLIC_APP_ENV: rawAppEnv as AppEnv,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}
