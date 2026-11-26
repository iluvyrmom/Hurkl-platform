// Shared secret between angi-lead-webhook, pg_cron and lead-followup-worker.
// Generated inside the database and stored encrypted in Supabase Vault; read via a
// service-role-only SQL function, so no human ever handles it. Cached per function instance.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

let cached: string | null = null;

export async function getWorkerSecret(sb: SupabaseClient): Promise<string | null> {
  if (cached) return cached;
  const { data, error } = await sb.rpc("followup_worker_secret");
  if (error || typeof data !== "string" || data.length < 32) {
    console.error(JSON.stringify({ msg: "worker_secret_unavailable", error: error?.message ?? "empty" }));
    return null;
  }
  cached = data;
  return cached;
}
