// HURKL — admin-only, read-only: delivery status of the last few outbound texts (no message bodies returned).
// Auth: internal x-worker-secret (Supabase Vault).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function eq(a: string, b: string) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: expected } = await sb.rpc("followup_worker_secret");
  if (typeof expected !== "string" || !eq(req.headers.get("x-worker-secret") ?? "", expected)) return reply(401, { ok: false });
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID")!.trim();
  const token = Deno.env.get("TWILIO_AUTH_TOKEN")!.trim();
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json?PageSize=5`, { headers: { Authorization: "Basic " + btoa(`${sid}:${token}`) } });
  const j: any = await r.json().catch(() => ({}));
  const messages = (j.messages ?? []).map((m: any) => ({ to_last4: String(m.to ?? "").slice(-4), status: m.status, error_code: m.error_code, error_message: m.error_message, date_sent: m.date_sent, date_created: m.date_created }));
  return reply(r.ok ? 200 : 502, { ok: r.ok, messages });
});
