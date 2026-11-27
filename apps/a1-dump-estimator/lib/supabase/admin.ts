import { createClient } from "@supabase/supabase-js";
import { ProviderNotConfiguredError } from "@/lib/providers/errors";

/**
 * The service-role Supabase client. Bypasses Row-Level Security entirely —
 * used ONLY by the Stripe webhook handler (app/api/stripe/webhook/route.ts),
 * which has no signed-in business member session to act as (Stripe calls
 * it directly), so it cannot go through the normal RLS-respecting client in
 * lib/supabase/server.ts.
 *
 * Server-only. Never import this into a Client Component, never pass its
 * client (or SUPABASE_SERVICE_ROLE_KEY) to the browser, and never call it
 * from any route a business member's own request reaches — every other
 * repository in this app uses the session-aware client precisely so a bug
 * can't accidentally bypass tenant isolation the way this client can.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new ProviderNotConfiguredError("Supabase admin client", [
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
