// HURKL — owner-invite: give a business owner access to the HURKL app.
//
// POST { company_slug, email, full_name }   (x-worker-secret required; HURKL staff only, run from SQL via pg_net)
//   - creates the login if it doesn't exist (no email is sent)
//   - links it to the company as role "owner" (refuses if that login already belongs to another company)
//   - returns a one-time sign-in code (valid about 1 hour) to hand to the owner in person
//
// Owners stay signed in on their phone after that; this is only for first sign-in or a new phone.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { getWorkerSecret } from "./_shared/worker_secret.ts";

const APP_URL = "https://hurkl-mason-app.netlify.app";

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

  const expected = await getWorkerSecret(sb);
  if (!expected) return reply(500, { error: "not_configured" });
  if (!constantTimeEqual(req.headers.get("x-worker-secret") ?? "", expected)) return reply(401, { error: "unauthorized" });

  let body: { company_slug?: string; email?: string; full_name?: string; create_link?: boolean } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const email = String(body.email ?? "").trim().toLowerCase();
  const slug = String(body.company_slug ?? "").trim();
  const fullName = String(body.full_name ?? "").trim().slice(0, 120) || null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[a-z0-9-]{3,64}$/.test(slug)) return reply(400, { error: "bad_input" });

  const { data: company } = await sb.from("companies").select("id, name").eq("website_slug", slug).maybeSingle();
  if (!company) return reply(404, { error: "company_not_found" });

  // generateLink creates the user if needed and returns a one-time code without sending email.
  const { data: link, error: linkErr } = await sb.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr || !link?.user) {
    console.error(JSON.stringify({ msg: "generate_link_failed", error: linkErr?.message }));
    return reply(502, { error: "could_not_create_login" });
  }
  const userId = link.user.id;

  const { data: existing } = await sb.from("profiles").select("company_id, role").eq("id", userId).maybeSingle();
  if (existing && existing.company_id && existing.company_id !== company.id) {
    return reply(409, { error: "login_belongs_to_another_company" });
  }
  const { error: profErr } = existing
    ? await sb.from("profiles").update({ company_id: company.id, role: existing.role === "hurkl_admin" ? "hurkl_admin" : "owner", ...(fullName ? { full_name: fullName } : {}) }).eq("id", userId)
    : await sb.from("profiles").insert({ id: userId, company_id: company.id, role: "owner", full_name: fullName });
  if (profErr) {
    console.error(JSON.stringify({ msg: "profile_upsert_failed", error: profErr.message }));
    return reply(500, { error: "profile_failed" });
  }

  await sb.from("audit_log").insert({
    company_id: company.id,
    action: "owner_app_access_granted",
    autonomy_tier: "tier_1_automatic",
    policy_reference: "owner_invite",
    subject_type: "user",
    subject_id: userId,
    metadata: { email_domain: email.split("@")[1] },
  });

  // Invite link: valid 7 days, works once. Only a hash of the token is stored.
  if (body.create_link) {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const token = btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const { error: invErr } = await sb.from("owner_invites").insert({ company_id: company.id, email, token_hash: hash });
    if (invErr) return reply(500, { error: "invite_failed" });
    return reply(200, { ok: true, company: company.name, email, link: `${APP_URL}/?invite=${token}`, note: "Link works once and expires in 7 days." });
  }

  return reply(200, { ok: true, company: company.name, email, code: link.properties?.email_otp ?? null, note: "Code works once and expires in about an hour." });
});
