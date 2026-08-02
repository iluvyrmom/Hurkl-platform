import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getClientEnv } from "../env";

let cachedClient: SupabaseClient | null = null;

/**
 * A Supabase client built from the public, RLS-protected publishable key —
 * never the service-role key. Safe to call from server-side code (API
 * routes, Server Components): every operation through this client is still
 * governed by Row-Level Security, exactly as if it ran in the browser.
 *
 * Do not add service-role usage here. If a future feature genuinely needs
 * to bypass RLS, that's a separate, deliberate client using
 * SUPABASE_SERVICE_ROLE_KEY from getServerEnv() — not a change to this one.
 */
export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const env = getClientEnv();
  cachedClient = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { persistSession: false },
    },
  );
  return cachedClient;
}
