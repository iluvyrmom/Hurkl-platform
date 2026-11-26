// HURKL — lead follow-up worker
//
// Runs the call / call / text / call sequence for leads with followup_status = 'active'.
// Triggered two ways (both send the x-worker-secret header):
//   1. Instantly by angi-lead-webhook for a brand-new lead ({ leadId } body) -> first call in seconds
//   2. Every minute by pg_cron (empty body) -> processes everything that's due, and is the safety
//      net if the instant trigger ever fails.
//
// Safety:
//   - Each lead is "leased" (next_followup_at pushed out 2 min) before work starts, so two
//     overlapping runs can never call the same customer twice.
//   - Calls only happen inside the company's calling hours; otherwise the sequence stops and
//     the owner is alerted.
//   - Every call/text is recorded in lead_contact_attempts and audit_log.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { isWithinCallingHours, toE164NorthAmerica } from "../_shared/lib.ts";
import {
  callGreeting,
  type CallOutcome,
  classifyConversation,
  type Decision,
  decideNext,
  minutesUntilNextCheck,
  smsBody,
} from "../_shared/sequence.ts";
import { customerRespondedSince, getConversation, placeCall, sendSms, type TwilioCreds } from "../_shared/providers.ts";
import { getWorkerSecret } from "../_shared/worker_secret.ts";

const LEASE_MIN = 2;
const MAX_LEADS_PER_RUN = 25;

type Company = {
  id: string;
  name: string;
  timezone: string;
  elevenlabs_agent_id: string | null;
  elevenlabs_phone_number_id: string | null;
  twilio_from_number: string | null;
  auto_callback_enabled: boolean;
  callback_window_start: string;
  callback_window_end: string;
  billing_exempt: boolean;
  billing_enforced: boolean;
  billing_status: string;
  grace_ends_at: string | null;
};

type Lead = {
  id: string;
  company_id: string;
  name: string;
  first_name: string | null;
  phone: string | null;
  service_requested: string | null;
  service_address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  comments: string | null;
  created_at: string;
  followup_step: number;
  callback_attempts: number;
};

type Attempt = { step: number; channel: "call" | "sms"; status: string; provider_ref: string | null; created_at: string; id: string };

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Mirrors public.mason_service_active(): exempt, not yet billed, paid, or still inside the 72-hour grace. */
function masonServiceActive(c: Company): boolean {
  if (c.billing_exempt || !c.billing_enforced) return true;
  if (c.billing_status === "active") return true;
  return c.billing_status === "past_due" && (!c.grace_ends_at || Date.parse(c.grace_ends_at) > Date.now());
}

const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

async function audit(sb: SupabaseClient, companyId: string, leadId: string, action: string, metadata: Record<string, unknown> = {}) {
  const { error } = await sb.from("audit_log").insert({
    company_id: companyId,
    action,
    autonomy_tier: "tier_1_automatic",
    policy_reference: "lead_followup_sequence",
    subject_type: "lead",
    subject_id: leadId,
    metadata,
  });
  if (error) console.error(JSON.stringify({ msg: "audit_insert_failed", action, leadId, error: error.message }));
}

// owner_escalations.reason only allows a fixed set of values, so these alerts use the existing
// 'owner_review_requested' reason and carry the specifics in the summary.
async function alertOwner(sb: SupabaseClient, company: Company, lead: Lead, label: string, detail: string) {
  const summary = `[${label}] ${lead.name} (${lead.phone ?? "no phone"}) — Angi request: ${lead.service_requested ?? "unspecified"}. ${detail}`;
  const { error } = await sb.from("owner_escalations").insert({
    company_id: company.id,
    reason: "owner_review_requested",
    customer_summary: summary.slice(0, 1000),
  });
  if (error) console.error(JSON.stringify({ msg: "owner_escalation_insert_failed", leadId: lead.id, error: error.message }));
}

async function updateLead(sb: SupabaseClient, leadId: string, fields: Record<string, unknown>) {
  const { error } = await sb.from("leads").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", leadId);
  if (error) console.error(JSON.stringify({ msg: "lead_update_failed", leadId, error: error.message }));
}

async function finish(sb: SupabaseClient, company: Company, lead: Lead, status: "answered" | "responded" | "exhausted" | "stopped", reason?: string) {
  await updateLead(sb, lead.id, { followup_status: status, next_followup_at: null, ...(status === "answered" || status === "responded" ? { status: "contacted" } : {}) });
  await audit(sb, company.id, lead.id, `lead_followup_${status}`, reason ? { reason } : {});
  if (status === "exhausted") {
    await alertOwner(sb, company, lead, "Angi lead: no response", "Mason called 3 times and sent a text with no answer. Please try reaching them yourself.");
  } else if (status === "stopped") {
    const detail = reason === "service_paused"
      ? "Mason is paused because the HURKL payment didn't go through, so Mason didn't call. Please call them yourself, and pay in the Billing section to turn Mason back on."
      : `Automatic follow-up stopped (${reason ?? "unknown reason"}). Please follow up yourself.`;
    await alertOwner(sb, company, lead, "Angi lead: follow-up stopped", detail);
  }
}

async function processLead(sb: SupabaseClient, lead: Lead, company: Company, env: { elevenKey?: string; twilio?: TwilioCreds }) {
  const toNumber = toE164NorthAmerica(lead.phone);
  if (!toNumber) return finish(sb, company, lead, "stopped", "invalid_phone");
  if (!company.auto_callback_enabled) return finish(sb, company, lead, "stopped", "auto_callback_disabled");
  if (!masonServiceActive(company)) return finish(sb, company, lead, "stopped", "service_paused");
  if (!env.elevenKey || !company.elevenlabs_agent_id || !company.elevenlabs_phone_number_id) {
    return finish(sb, company, lead, "stopped", "callback_not_configured");
  }

  const { data: attempts } = await sb
    .from("lead_contact_attempts")
    .select("id, step, channel, status, provider_ref, created_at")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: true })
    .returns<Attempt[]>();
  const history = attempts ?? [];
  const lastCall = [...history].reverse().find((a) => a.channel === "call");

  // 1. Did the last call connect?
  let lastOutcome: CallOutcome | null = null;
  if (lastCall && lead.followup_step > 0) {
    if (lastCall.status === "failed") {
      lastOutcome = "no_answer";
    } else {
      const conv = lastCall.provider_ref ? await getConversation(env.elevenKey, lastCall.provider_ref) : null;
      lastOutcome = classifyConversation(conv, Date.parse(lastCall.created_at), Date.now());
      await sb.from("lead_contact_attempts").update({ outcome: lastOutcome, checked_at: new Date().toISOString() }).eq("id", lastCall.id);
    }
  }

  // 2. Did they call or text back?
  const responded = env.twilio && company.twilio_from_number && lead.followup_step > 0
    ? await customerRespondedSince(env.twilio, company.twilio_from_number, toNumber, Date.parse(lead.created_at))
    : false;

  // 3. Decide.
  const decision: Decision = decideNext(lead.followup_step, lastOutcome, responded);

  if (decision.type === "finish") return finish(sb, company, lead, decision.status);
  if (decision.type === "wait") return updateLead(sb, lead.id, { next_followup_at: minutesFromNow(decision.minutes) });

  // Every outbound contact must respect calling hours.
  if (!isWithinCallingHours(company)) return finish(sb, company, lead, "stopped", "outside_calling_hours");

  const firstName = lead.first_name ?? (lead.name !== "Angi customer" ? lead.name.split(/\s+/)[0] : null);
  const service = lead.service_requested ?? "service";
  const nextStep = lead.followup_step + 1;

  if (decision.type === "call") {
    const result = await placeCall({
      apiKey: env.elevenKey,
      agentId: company.elevenlabs_agent_id,
      phoneNumberId: company.elevenlabs_phone_number_id,
      toNumber,
      firstMessage: callGreeting(decision.attempt, firstName, company.name, service),
      dynamicVariables: {
        call_type: "angi_callback",
        customer_first_name: firstName ?? "",
        service_requested: service,
        lead_id: lead.id,
        attempt_number: String(decision.attempt),
        // Angi-verified details, so Mason never re-asks for them.
        service_address: [lead.service_address, lead.city, [lead.state, lead.postal_code].filter(Boolean).join(" ")]
          .filter(Boolean).join(", "),
        customer_comments: (lead.comments ?? "").slice(0, 500),
      },
    });
    await sb.from("lead_contact_attempts").insert({
      company_id: company.id,
      lead_id: lead.id,
      step: nextStep,
      channel: "call",
      status: result.ok ? "placed" : "failed",
      provider_ref: result.ok ? result.value.conversationId : null,
      error: result.ok ? null : result.error,
    });
    await audit(sb, company.id, lead.id, result.ok ? "lead_call_placed" : "lead_call_failed", {
      attempt: decision.attempt,
      ...(result.ok ? { conversationId: result.value.conversationId } : { error: result.error }),
    });

    // A failed FIRST call usually means a setup problem; don't keep hammering. Stop and tell the owner.
    if (!result.ok && decision.attempt === 1) {
      await updateLead(sb, lead.id, { callback_status: "failed", callback_error: result.error });
      return finish(sb, company, lead, "stopped", "first_call_failed");
    }
    return updateLead(sb, lead.id, {
      followup_step: nextStep,
      callback_attempts: lead.callback_attempts + 1,
      last_contact_at: new Date().toISOString(),
      next_followup_at: minutesFromNow(minutesUntilNextCheck(decision, null)),
      ...(decision.attempt === 1 ? { callback_status: "called", callback_error: null } : {}),
      ...(result.ok ? { callback_conversation_id: result.value.conversationId, callback_call_sid: result.value.callSid } : {}),
    });
  }

  // decision.type === "sms"
  const call2 = history.find((a) => a.channel === "call" && a.step === 2);
  const minutesSinceCall2 = call2 ? (Date.now() - Date.parse(call2.created_at)) / 60_000 : null;
  let smsResult: { ok: boolean; ref: string | null; error: string | null };
  if (!env.twilio || !company.twilio_from_number) {
    smsResult = { ok: false, ref: null, error: "twilio_not_configured" };
  } else {
    const r = await sendSms(env.twilio, company.twilio_from_number, toNumber, smsBody(firstName, company.name, service));
    smsResult = r.ok ? { ok: true, ref: r.value.sid, error: null } : { ok: false, ref: null, error: r.error };
  }
  await sb.from("lead_contact_attempts").insert({
    company_id: company.id,
    lead_id: lead.id,
    step: nextStep,
    channel: "sms",
    status: smsResult.ok ? "sent" : "failed",
    provider_ref: smsResult.ref,
    error: smsResult.error,
  });
  await audit(sb, company.id, lead.id, smsResult.ok ? "lead_sms_sent" : "lead_sms_failed", smsResult.error ? { error: smsResult.error } : {});
  // A failed text does not stop the sequence: call #3 still happens on schedule.
  return updateLead(sb, lead.id, {
    followup_step: nextStep,
    last_contact_at: smsResult.ok ? new Date().toISOString() : undefined,
    next_followup_at: minutesFromNow(minutesUntilNextCheck(decision, minutesSinceCall2)),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const expected = await getWorkerSecret(sb);
  if (!expected) return reply(500, { error: "Not configured" });
  if (!constantTimeEqual(req.headers.get("x-worker-secret") ?? "", expected)) return reply(401, { error: "Unauthorized" });

  let body: { leadId?: string } = {};
  try { body = await req.json(); } catch { /* cron sends an empty body */ }

  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const env = { elevenKey: Deno.env.get("ELEVENLABS_API_KEY"), twilio: sid && token ? { accountSid: sid, authToken: token } : undefined };

  // Find due leads.
  let query = sb.from("leads").select("id").eq("followup_status", "active").lte("next_followup_at", new Date().toISOString());
  if (body.leadId) query = query.eq("id", body.leadId);
  const { data: due, error: dueErr } = await query.order("next_followup_at").limit(MAX_LEADS_PER_RUN);
  if (dueErr) {
    console.error(JSON.stringify({ msg: "due_lookup_failed", error: dueErr.message }));
    return reply(500, { error: "Lookup failed" });
  }

  let processed = 0;
  for (const { id } of due ?? []) {
    // Lease: only one run may work on a lead at a time.
    const { data: lead } = await sb
      .from("leads")
      .update({ next_followup_at: minutesFromNow(LEASE_MIN) })
      .eq("id", id)
      .eq("followup_status", "active")
      .lte("next_followup_at", new Date().toISOString())
      .select("id, company_id, name, first_name, phone, service_requested, service_address, city, state, postal_code, comments, created_at, followup_step, callback_attempts")
      .maybeSingle<Lead>();
    if (!lead) continue;

    const { data: company } = await sb
      .from("companies")
      .select("id, name, timezone, elevenlabs_agent_id, elevenlabs_phone_number_id, twilio_from_number, auto_callback_enabled, callback_window_start, callback_window_end, billing_exempt, billing_enforced, billing_status, grace_ends_at")
      .eq("id", lead.company_id)
      .maybeSingle<Company>();
    if (!company) continue;

    try {
      await processLead(sb, lead, company, env);
      processed++;
    } catch (e) {
      // Lease expires in 2 min, so the lead is retried automatically.
      console.error(JSON.stringify({ msg: "process_lead_crashed", leadId: lead.id, error: String(e) }));
    }
  }

  return reply(200, { processed });
});
