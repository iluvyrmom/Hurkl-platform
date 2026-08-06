import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null | undefined;

/**
 * Returns a Supabase client only when both env vars are actually set;
 * otherwise null, which every repository factory treats as "use the
 * in-memory repository" rather than crashing. No real Supabase project has
 * been provisioned for this app yet — see README "What's real vs. stubbed."
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    cachedClient = null;
    return cachedClient;
  }

  cachedClient = createClient(url, anonKey);
  return cachedClient;
}
