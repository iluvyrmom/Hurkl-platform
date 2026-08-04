import { createClient } from "@supabase/supabase-js";
import { getClientEnv, getServerEnv } from "../env";

/**
 * The service-role Supabase client. Bypasses Row-Level Security
 * entirely — this IS "the dedicated, explicitly audited HURKL-admin
 * path used for platform support/billing" SECURITY.md §1 requires, and
 * must never be the same code path a tenant's own request uses.
 *
 * Server-only. Never import this into a Client Component, never pass
 * its client (or the service-role key) to the browser, and never call
 * it from a route a tenant-authenticated user's request can reach —
 * only from dedicated HURKL-admin operations, each of which must be
 * audit-logged per SECURITY.md §6.
 */
export function createSupabaseAdminClient() {
  const clientEnv = getClientEnv();
  const serverEnv = getServerEnv();

  if (!clientEnv.NEXT_PUBLIC_SUPABASE_URL || !serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase admin client is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example). SUPABASE_SERVICE_ROLE_KEY must never be exposed client-side.",
    );
  }

  return createClient(clientEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
