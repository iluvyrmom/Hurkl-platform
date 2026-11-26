// HURKL — Angi lead webhook
//
// URL:  POST https://<project>.supabase.co/functions/v1/angi-lead-webhook/<company website_slug>
// Auth: Angi sends the company's key in the `x-api-key` header. Only its SHA-256 hash is stored
//       (public.lead_source_credentials).
//
// Flow:
//   1. Verify company + key.
//   2. Save the lead into public.leads (idempotent on Angi's leadOid, so Angi retries never duplicate).
//   3. Reply {"status":"success"} immediately (Angi expects a reply within ~2-5s).
//   4. If the company has auto-callback on and it's inside calling hours, start the follow-up
//      sequence and kick lead-followup-worker instantly (first call within seconds).
//      If the instant kick ever fails, pg_cron runs the worker every minute as a safety net.
//      Every step is written to public.audit_log.
//
// Deployed with verify_jwt = false because Angi cannot send a Supabase JWT;
// the x-api-key check below is the authentication.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { isWithinCallingHours, mapAngiPayload, toE164NorthAmerica } from "../_shared/lib.ts";
import { getWorkerSecret } from "../_shared/worker_secret.ts";

const SOURCE = "angi";
const MAX_BODY_BYTES = 256 * 1024;
const MAX_KEY_LENGTH = 160; // Angi's documented key limit
const WORKER_PATH = "/functions/v1/lead-followup-worker";
const WORKER_KICK_TIMEOUT_MS = 8_000;

type Company = {
  id: string;
  name: string;
  timezone: string;
  elevenlabs_agent_id: string | null;
  elevenlabs_phone_number_id: string | null;
  twilio_from_number: string | null;
  auto_callback_enabled: boolean;
  callback_window_start: string; // "08:00:00"
  callback_window_end: string;
};

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Write to the shared HURKL audit log. Never throws. */
async function audit(sb: SupabaseClient, companyId: string, leadId: string, action: string, metadata: Record<string, unknown> = {}) {
  const { error } = await sb.from("audit_log").insert({
    company_id: companyId,
    action,
    autonomy_tier: "tier_1_automatic",
    policy_reference: "angi_lead_intake",
    subject_type: "lead",
    subject_id: leadId,
    metadata,
  });
  if (error) console.error(JSON.stringify({ msg: "audit_insert_failed", action, leadId, error: error.message }));
}

type InitialState =
  | { followup: true; callback_status: "pending" }
  | { followup: false; callback_status: "skipped" | "queued"; reason: string };

/** Decide up front whether Mason should start calling this lead. */
function initialState(company: Company, phone: string | null): InitialState {
  if (!company.auto_callback_enabled) return { followup: false, callback_status: "skipped", reason: "auto_callback_disabled" };
  if (!company.elevenlabs_agent_id || !company.elevenlabs_phone_number_id || !Deno.env.get("ELEVENLABS_API_KEY")) {
    return { followup: false, callback_status: "skipped", reason: "callback_not_configured" };
  }
  if (!toE164NorthAmerica(phone)) return { followup: false, callback_status: "skipped", reason: "invalid_phone" };
  if (!isWithinCallingHours(company)) return { followup: false, callback_status: "queued", reason: "outside_calling_hours" };
  return { followup: true, callback_status: "pending" };
}

/** Fire the worker for this one lead right now. Failures are fine: pg_cron picks it up within a minute. */
async function kickWorker(sb: SupabaseClient, leadId: string): Promise<void> {
  const secret = await getWorkerSecret(sb);
  if (!secret) {
    console.warn(JSON.stringify({ msg: "worker_kick_skipped_no_secret", leadId }));
    return;
  }
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}${WORKER_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-worker-secret": secret },
      body: JSON.stringify({ leadId }),
      signal: AbortSignal.timeout(WORKER_KICK_TIMEOUT_MS),
    });
    if (!res.ok) console.warn(JSON.stringify({ msg: "worker_kick_non_200", leadId, status: res.status }));
  } catch (e) {
    console.warn(JSON.stringify({ msg: "worker_kick_failed", leadId, error: String(e) }));
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { status: "error", message: "Method not allowed" });

  const slug = new URL(req.url).pathname.split("/").filter(Boolean).at(-1) ?? "";
  if (slug === "angi-lead-webhook" || !/^[a-z0-9-]{3,64}$/.test(slug)) {
    return reply(404, { status: "error", message: "Unknown endpoint" });
  }

  const providedKey = req.headers.get("x-api-key") ?? "";
  if (!providedKey || providedKey.length > MAX_KEY_LENGTH) return reply(401, { status: "error", message: "Unauthorized" });

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return reply(413, { status: "error", message: "Payload too large" });
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: company, error: companyErr } = await sb
    .from("companies")
    .select("id, name, timezone, elevenlabs_agent_id, elevenlabs_phone_number_id, twilio_from_number, auto_callback_enabled, callback_window_start, callback_window_end")
    .eq("website_slug", slug)
    .maybeSingle<Company>();
  if (companyErr) {
    console.error(JSON.stringify({ msg: "company_lookup_failed", slug, error: companyErr.message }));
    return reply(500, { status: "error", message: "Temporary error, please retry" });
  }
  if (!company) return reply(401, { status: "error", message: "Unauthorized" });

  const { data: creds, error: credErr } = await sb
    .from("lead_source_credentials")
    .select("api_key_hash")
    .eq("company_id", company.id)
    .eq("provider", SOURCE)
    .eq("active", true);
  if (credErr) {
    console.error(JSON.stringify({ msg: "credential_lookup_failed", companyId: company.id, error: credErr.message }));
    return reply(500, { status: "error", message: "Temporary error, please retry" });
  }
  const providedHash = await sha256Hex(providedKey);
  if (!(creds ?? []).some((c) => constantTimeEqual(c.api_key_hash, providedHash))) {
    console.warn(JSON.stringify({ msg: "unauthorized_lead_post", companyId: company.id }));
    return reply(401, { status: "error", message: "Unauthorized" });
  }

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) return reply(413, { status: "error", message: "Payload too large" });

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    payload = parsed;
  } catch {
    return reply(400, { status: "error", message: "Body must be a JSON object" });
  }

  const mapped = mapAngiPayload(payload);
  if (!mapped.external_id) return reply(400, { status: "error", message: "Missing leadOid" });

  const start = initialState(company, mapped.phone);
  const row = {
    company_id: company.id,
    source: SOURCE,
    status: "new",
    callback_status: start.callback_status,
    callback_error: start.followup ? null : start.reason,
    followup_status: start.followup ? "active" : null,
    followup_step: 0,
    next_followup_at: start.followup ? new Date().toISOString() : null,
    raw_payload: payload,
    ...mapped,
  };

  const { data: inserted, error: insErr } = await sb
    .from("leads")
    .upsert(row, { onConflict: "company_id,source,external_id", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (insErr) {
    console.error(JSON.stringify({ msg: "lead_insert_failed", companyId: company.id, externalId: mapped.external_id, error: insErr.message }));
    return reply(500, { status: "error", message: "Temporary error, please retry" });
  }

  if (!inserted) {
    // Angi retry/resend of a lead we already have: acknowledge so Angi stops retrying.
    const { data: existing } = await sb
      .from("leads")
      .select("id")
      .eq("company_id", company.id)
      .eq("source", SOURCE)
      .eq("external_id", mapped.external_id)
      .maybeSingle();
    return reply(200, { status: "success", message: "Duplicate lead ignored", leadId: existing?.id ?? null });
  }

  await audit(sb, company.id, inserted.id, "lead_received", { source: SOURCE, externalId: mapped.external_id });
  if (start.followup) {
    EdgeRuntime.waitUntil(kickWorker(sb, inserted.id));
  } else {
    await audit(sb, company.id, inserted.id, `lead_callback_${start.callback_status}`, { reason: start.reason });
    if (start.callback_status === "queued") {
      // Arrived outside calling hours: make sure the owner sees it first thing.
      const { error } = await sb.from("owner_escalations").insert({
        company_id: company.id,
        reason: "owner_review_requested", // reason has a fixed allowed list; specifics go in the summary
        customer_summary: `[Angi lead: after hours] ${mapped.name} (${mapped.phone ?? "no phone"}) — Angi request: ${mapped.service_requested ?? "unspecified"}. Arrived outside calling hours; Mason did not call.`.slice(0, 1000),
      });
      if (error) console.error(JSON.stringify({ msg: "owner_escalation_insert_failed", leadId: inserted.id, error: error.message }));
    }
  }
  console.log(JSON.stringify({ msg: "lead_received", companyId: company.id, leadId: inserted.id, followup: start.followup }));

  return reply(200, { status: "success", message: "Lead received", leadId: inserted.id });
});
