// HURKL — owner notifier: texts the business owner a job sheet after every finished Mason call,
// and sends any pending owner alerts (e.g. "Mason couldn't reach this Angi lead").
//
// Runs every minute from pg_cron (x-worker-secret from Supabase Vault). Per company, only when:
//   owner_texts_enabled = true, owner_alert_phone set, twilio_from_number set, elevenlabs_agent_id set.
// Only calls that START after companies.owner_texts_since are texted (test calls before go-live never are).
// Idempotent: call_job_sheets has UNIQUE(company_id, conversation_id); a row is claimed before texting,
// so overlapping runs can never text the same call twice.
//
// Test mode (no DB writes, owner not texted): POST { "test_to": "+1...", "slug": "...", "conversation_id": "conv_..." }
//
// Secrets used: ELEVENLABS_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN. Never logged or returned.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

const EL = "https://api.elevenlabs.io/v1/convai";
const TWILIO = "https://api.twilio.com/2010-04-01";
const TIMEOUT_MS = 12_000;
const MAX_PER_RUN = 20;
const SMS_MAX = 900; // keeps texts to ~6 segments

type Company = {
  id: string;
  name: string;
  timezone: string;
  elevenlabs_agent_id: string;
  twilio_from_number: string;
  owner_alert_phone: string;
  owner_name: string | null;
  owner_texts_since: string | null;
};

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function prettyPhone(raw: unknown): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return ten.length === 10 ? `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}` : String(raw ?? "unknown");
}

function localTime(unixSecs: number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(unixSecs * 1000));
}

async function elGet(apiKey: string, path: string): Promise<any | null> {
  try {
    const r = await fetch(`${EL}${path}`, { headers: { "xi-api-key": apiKey, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) {
      console.warn(JSON.stringify({ msg: "elevenlabs_get_failed", path: path.split("?")[0], status: r.status }));
      return null;
    }
    return await r.json();
  } catch (e) {
    console.warn(JSON.stringify({ msg: "elevenlabs_get_error", error: String(e).slice(0, 120) }));
    return null;
  }
}

async function sendSms(sid: string, token: string, from: string, to: string, body: string): Promise<{ ok: boolean; sid?: string; error?: string }> {
  try {
    const r = await fetch(`${TWILIO}/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${sid}:${token}`), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: from, To: to, Body: body }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const j = await r.json().catch(() => ({})) as Record<string, unknown>;
    if (!r.ok) return { ok: false, error: `twilio_${r.status}_${j.code ?? ""}: ${String(j.message ?? "").slice(0, 200)}` };
    return { ok: true, sid: String(j.sid ?? "") };
  } catch (e) {
    return { ok: false, error: "twilio_request: " + String(e).slice(0, 150) };
  }
}

/** Pull the fields Mason collected (ElevenLabs data collection) into a flat object. */
function collected(conv: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const dc = conv?.analysis?.data_collection_results ?? {};
  for (const [k, v] of Object.entries<any>(dc)) {
    if (v && v.value !== undefined && v.value !== null && v.value !== "") out[k] = v.value;
  }
  return out;
}

/** Build the owner's job-sheet text. Returns null when nothing is worth texting. */
export function buildJobSheet(conv: any, company: Company): { message: string | null; summary: Record<string, unknown> } {
  const meta = conv?.metadata ?? {};
  const direction = meta?.phone_call?.direction ?? "unknown";
  const caller = meta?.phone_call?.external_number ?? conv?.user_id ?? null;
  const started = Number(meta?.start_time_unix_secs ?? 0);
  const duration = Number(meta?.call_duration_secs ?? 0);
  const f = collected(conv);
  const when = started ? localTime(started, company.timezone || "America/Los_Angeles") : "";
  const summary = { direction, caller, started, duration, fields: f, call_summary: conv?.analysis?.transcript_summary ?? null };

  const hasJob = Boolean(f.caller_name || f.problem_description || f.service_address);
  const reachedPerson = f.reached_live_person !== false;

  // Outbound Angi callbacks that never reached a person: the follow-up sequence already handles those.
  if (direction === "outbound" && (!reachedPerson || !hasJob)) return { message: null, summary };

  const lines: string[] = [];
  if (!hasJob) {
    // Inbound call that ended before Mason got details: still worth a callback.
    if (duration < 3) return { message: null, summary };
    lines.push(`${company.name}: missed caller`);
    lines.push(`${prettyPhone(caller)} called ${when} and hung up before giving details (${duration}s).`);
    lines.push("Worth a quick call back.");
  } else {
    const urgency = String(f.urgency ?? "ROUTINE").toUpperCase();
    const tag = urgency === "EMERGENCY" ? "EMERGENCY - " : urgency === "URGENT" ? "URGENT - " : urgency === "GAS_SAFETY" ? "GAS SMELL REPORTED - " : "";
    lines.push(`${tag}New job for ${company.name} (from Mason, ${when})`);
    const phone = f.callback_phone ? prettyPhone(f.callback_phone) : prettyPhone(caller);
    lines.push(`${f.caller_name ?? "Name not given"} | ${phone}`);
    if (f.service_address) lines.push(String(f.service_address));
    if (f.problem_description) lines.push(`Problem: ${f.problem_description}`);
    if (f.preferred_times) lines.push(`Times: ${f.preferred_times}`);
    const extras: string[] = [];
    if (f.property_type_and_ownership) extras.push(String(f.property_type_and_ownership));
    if (f.access_notes) extras.push(`Access: ${f.access_notes}`);
    if (f.will_text_photos === true) extras.push("Will text photos");
    if (f.came_from_angi === true || direction === "outbound") extras.push("Angi lead");
    if (extras.length) lines.push(extras.join(" | "));
    lines.push("Customer was told you'll call or text to lock in the time.");
  }
  let message = lines.join("\n");
  if (message.length > SMS_MAX) message = message.slice(0, SMS_MAX - 3) + "...";
  return { message, summary };
}

async function processCompany(sb: SupabaseClient, c: Company, env: { el: string; sid: string; token: string }) {
  const result = { company: c.name, new_calls: 0, texted: 0, skipped: 0, failed: 0, alerts_sent: 0 };
  const sinceUnix = Math.floor(Date.parse(c.owner_texts_since!) / 1000);
  // Only look back 6 hours at most each run (older calls were already handled or are pre-go-live).
  const lookback = Math.max(sinceUnix, Math.floor(Date.now() / 1000) - 6 * 3600);

  const list = await elGet(env.el, `/conversations?agent_id=${encodeURIComponent(c.elevenlabs_agent_id)}&call_start_after_unix=${lookback}&page_size=30`);
  const convs: any[] = (list?.conversations ?? []).filter((x: any) => x?.status === "done" && Number(x?.start_time_unix_secs ?? 0) >= sinceUnix);

  if (convs.length) {
    const ids = convs.map((x) => String(x.conversation_id));
    const { data: seen } = await sb.from("call_job_sheets").select("conversation_id").eq("company_id", c.id).in("conversation_id", ids);
    const seenSet = new Set((seen ?? []).map((r: any) => r.conversation_id));

    for (const item of convs.filter((x) => !seenSet.has(String(x.conversation_id))).slice(0, MAX_PER_RUN)) {
      const convId = String(item.conversation_id);
      // Claim the call first so a parallel run can't text it too.
      const { data: claimed, error: claimErr } = await sb
        .from("call_job_sheets")
        .insert({ company_id: c.id, conversation_id: convId, sms_status: "pending" })
        .select("id")
        .maybeSingle();
      if (claimErr || !claimed) continue; // already claimed (unique) or insert failed
      result.new_calls++;

      const conv = await elGet(env.el, `/conversations/${encodeURIComponent(convId)}`);
      if (!conv) {
        // Couldn't load details: release the claim so the next run retries.
        await sb.from("call_job_sheets").delete().eq("id", claimed.id);
        continue;
      }
      const { message, summary } = buildJobSheet(conv, c);
      const base = {
        direction: (summary as any).direction,
        caller_phone: (summary as any).caller ?? null,
        call_started_at: (summary as any).started ? new Date((summary as any).started * 1000).toISOString() : null,
        call_duration_secs: (summary as any).duration ?? null,
        summary,
        message,
      };
      if (!message) {
        await sb.from("call_job_sheets").update({ ...base, sms_status: "skipped" }).eq("id", claimed.id);
        result.skipped++;
        continue;
      }
      const sms = await sendSms(env.sid, env.token, c.twilio_from_number, c.owner_alert_phone, message);
      await sb.from("call_job_sheets").update({ ...base, sms_status: sms.ok ? "sent" : "failed", sms_sid: sms.sid ?? null, sms_error: sms.error ?? null }).eq("id", claimed.id);
      await sb.from("audit_log").insert({
        company_id: c.id,
        action: sms.ok ? "owner_job_sheet_texted" : "owner_job_sheet_text_failed",
        autonomy_tier: "tier_1_automatic",
        policy_reference: "owner_job_sheet",
        subject_type: "conversation",
        subject_id: null,
        metadata: { conversationId: convId, ...(sms.error ? { error: sms.error } : {}) },
      }).then(({ error }) => { if (error) console.warn(JSON.stringify({ msg: "audit_insert_failed", error: error.message })); });
      if (sms.ok) result.texted++; else result.failed++;
    }
  }

  // Pending owner alerts (no-answer leads, after-hours leads, stopped follow-ups).
  const { data: alerts } = await sb
    .from("owner_escalations")
    .select("id, customer_summary, created_at")
    .eq("company_id", c.id)
    .is("notified_at", null)
    .gte("created_at", c.owner_texts_since!)
    .order("created_at")
    .limit(10);
  for (const a of alerts ?? []) {
    // Claim: only one run may send each alert.
    const { data: got } = await sb.from("owner_escalations").update({ notified_at: new Date().toISOString() }).eq("id", a.id).is("notified_at", null).select("id").maybeSingle();
    if (!got) continue;
    const body = `${c.name} alert from Mason:\n${String(a.customer_summary ?? "").slice(0, SMS_MAX - 60)}`;
    const sms = await sendSms(env.sid, env.token, c.twilio_from_number, c.owner_alert_phone, body);
    if (sms.ok) result.alerts_sent++;
    else {
      // Release so it retries next minute, and record why.
      await sb.from("owner_escalations").update({ notified_at: null, notify_error: sms.error ?? "unknown" }).eq("id", a.id);
      result.failed++;
    }
  }
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { ok: false, error: "method_not_allowed" });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: expected } = await sb.rpc("followup_worker_secret");
  if (typeof expected !== "string" || expected.length < 32) return reply(500, { ok: false, error: "not_configured" });
  if (!constantTimeEqual(req.headers.get("x-worker-secret") ?? "", expected)) return reply(401, { ok: false, error: "unauthorized" });

  const env = {
    el: Deno.env.get("ELEVENLABS_API_KEY") ?? "",
    sid: Deno.env.get("TWILIO_ACCOUNT_SID")?.trim() ?? "",
    token: Deno.env.get("TWILIO_AUTH_TOKEN")?.trim() ?? "",
  };
  if (!env.el || !env.sid || !env.token) return reply(500, { ok: false, error: "missing_secrets" });

  let body: any = {};
  try { body = await req.json(); } catch { /* cron sends {} */ }

  const cols = "id, name, timezone, elevenlabs_agent_id, twilio_from_number, owner_alert_phone, owner_name, owner_texts_since";

  // ---- Test mode: build a real job sheet from one call and text it to a test number only.
  if (body.test_to) {
    const to = String(body.test_to);
    if (!/^\+1\d{10}$/.test(to) || !/^[a-z0-9-]{3,64}$/.test(String(body.slug ?? "")) || !body.conversation_id) {
      return reply(400, { ok: false, error: "bad_test_input" });
    }
    const { data: c } = await sb.from("companies").select(cols).eq("website_slug", body.slug).maybeSingle<Company>();
    if (!c?.twilio_from_number) return reply(400, { ok: false, error: "company_not_ready" });
    const conv = await elGet(env.el, `/conversations/${encodeURIComponent(String(body.conversation_id))}`);
    if (!conv) return reply(502, { ok: false, error: "conversation_not_loaded" });
    const { message } = buildJobSheet(conv, c);
    if (!message) return reply(200, { ok: true, sent: false, reason: "nothing_to_text" });
    const sms = await sendSms(env.sid, env.token, c.twilio_from_number, to, `[TEST - not sent to owner]\n${message}`);
    return reply(sms.ok ? 200 : 502, { ok: sms.ok, preview: message, error: sms.error ?? null });
  }

  // ---- Normal run (cron).
  const { data: companies, error } = await sb
    .from("companies")
    .select(cols)
    .eq("owner_texts_enabled", true)
    .not("owner_alert_phone", "is", null)
    .not("twilio_from_number", "is", null)
    .not("elevenlabs_agent_id", "is", null)
    .not("owner_texts_since", "is", null)
    .returns<Company[]>();
  if (error) return reply(500, { ok: false, error: "company_lookup_failed" });

  const results = [];
  for (const c of companies ?? []) {
    try {
      results.push(await processCompany(sb, c, env));
    } catch (e) {
      console.error(JSON.stringify({ msg: "owner_notifier_company_failed", company: c.id, error: String(e).slice(0, 200) }));
    }
  }
  return reply(200, { ok: true, results });
});
