#!/usr/bin/env node
/**
 * `npm run env:check` — validates required environment variables using the
 * exact same logic the running app enforces at startup (lib/env.ts, called
 * from instrumentation.ts). This script does not duplicate any validation
 * rule; it only calls that code and reports the outcome.
 *
 * Never prints secret values — only whether each optional, future-phase
 * variable is set or unset.
 */
import { getClientEnv, getServerEnv, type ServerEnv } from "../lib/env.ts";

const SECRET_SERVER_KEYS: (keyof ServerEnv)[] = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
  "ELEVENLABS_API_KEY",
  "DEEPGRAM_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TRIGGER_SECRET_KEY",
  "SENTRY_DSN",
  "RESEND_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "ANTHROPIC_DAILY_SPEND_CEILING_USD",
  "ANTHROPIC_MONTHLY_SPEND_CEILING_USD",
  "ANTHROPIC_COMPANY_DAILY_SPEND_CEILING_USD",
  "ANTHROPIC_COMPANY_MONTHLY_SPEND_CEILING_USD",
];

function presence(value: string | undefined): "set" | "unset" {
  return value ? "set" : "unset";
}

try {
  const server = getServerEnv();
  const client = getClientEnv();

  console.log("Environment validation: PASSED");
  console.log(`  NEXT_PUBLIC_APP_ENV: ${server.APP_ENV}`);
  console.log("  Future-phase variables (presence only — values are never printed):");
  for (const key of SECRET_SERVER_KEYS) {
    console.log(`    ${key}: ${presence(server[key])}`);
  }
  console.log(`    NEXT_PUBLIC_SUPABASE_URL: ${presence(client.NEXT_PUBLIC_SUPABASE_URL)}`);
  console.log(
    `    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${presence(
      client.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    )}`,
  );
  process.exit(0);
} catch (error) {
  console.error("Environment validation: FAILED");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
