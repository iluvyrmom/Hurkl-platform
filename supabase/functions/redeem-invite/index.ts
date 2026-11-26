// HURKL — redeem-invite: turns a one-time invite link into a signed-in session on the owner's phone.
// POST { token } -> { email, code }; the app then signs in with that code right away.
// The link works once (used_at is set atomically) and expires after 7 days.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ALLOWED_ORIGINS = ["https://hurkl-mason-app.netlify.app", "http://localhost:8765"];

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  let body: { token?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const token = String(body.token ?? "");
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return reply(400, { error: "invalid_link" });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))].map((b) => b.toString(16).padStart(2, "0")).join("");

  // Claim the invite: only one request can ever use it.
  const { data: inv } = await sb.from("owner_invites")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", hash).is("used_at", null).gt("expires_at", new Date().toISOString())
    .select("id, company_id, email").maybeSingle();
  if (!inv) return reply(410, { error: "link_used_or_expired" });

  const { data: link, error } = await sb.auth.admin.generateLink({ type: "magiclink", email: inv.email });
  const code = link?.properties?.email_otp;
  if (error || !code) {
    await sb.from("owner_invites").update({ used_at: null }).eq("id", inv.id); // let them try again
    console.error(JSON.stringify({ msg: "redeem_generate_failed", error: error?.message }));
    return reply(502, { error: "try_again" });
  }
  await sb.from("audit_log").insert({ company_id: inv.company_id, action: "owner_invite_redeemed", autonomy_tier: "tier_1_automatic", policy_reference: "owner_invite", subject_type: "invite", subject_id: inv.id, metadata: {} });
  return reply(200, { email: inv.email, code });
});
