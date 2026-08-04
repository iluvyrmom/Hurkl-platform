"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getClientEnv } from "../env";

/**
 * The browser-side Supabase client — used only for Supabase Auth calls
 * (sign up, sign in, sign out) from Client Components. Every actual
 * data operation (customers, companies) goes through an API route using
 * lib/supabase/server.ts instead, never direct browser-to-Postgrest
 * calls for tenant data, so every write passes through this app's own
 * validation and audit logging (see app/api/customers/route.ts and
 * app/api/companies/route.ts).
 */
export function createSupabaseBrowserClient() {
  const env = getClientEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).",
    );
  }
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
