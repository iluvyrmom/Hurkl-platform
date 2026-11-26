// HURKL — Mason emergency tool: text the caller a picture showing how to shut off water at the meter box.
//
// GET  .../send-shutoff-guide/image.jpg  -> serves the shut-off picture (public; Twilio fetches it for the MMS).
// POST .../send-shutoff-guide             -> called by Mason's ElevenLabs webhook tool during a call.
//   Header: x-mason-tool-secret (must match Vault secret 'mason_tool_secret').
//   Body:   { company_slug, to_phone, conversation_id }
//
// Safety rails: company must have shutoff_guide_enabled; US numbers only; one picture per call (DB unique index);
// max 3 per phone number per 24h; max 40 per company per 24h. Every attempt is logged in shutoff_guide_sends.
// Message includes STOP opt-out language (required by carriers for A2P 10DLC).
// Secrets used: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN. Never logged or returned.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ASSET = "water-shutoff-guide.jpg";
const TWILIO = "https://api.twilio.com/2010-04-01";
const PER_PHONE_DAY = 3;
const PER_COMPANY_DAY = 40;

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let imageCache: Uint8Array | null = null;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("\\x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

async function loadImage(): Promise<Uint8Array | null> {
  if (imageCache) return imageCache;
  const { data, error } = await sb.from("static_assets").select("data").eq("name", ASSET).maybeSingle();
  if (error || !data?.data) {
    console.error(JSON.stringify({ msg: "shutoff_image_load_failed", error: error?.message ?? "missing" }));
    return null;
  }
  imageCache = hexToBytes(String(data.data));
  return imageCache;
}

/** Normalize to +1XXXXXXXXXX or return null. US/Canada numbers only. */
function normalizeUsPhone(raw: unknown): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(ten)) return null;
  return "+1" + ten;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // ---- Public image (Twilio downloads this when it builds the picture text).
  if (req.method === "GET" || req.method === "HEAD") {
    if (!url.pathname.endsWith("/image.jpg")) return json(404, { ok: false, error: "not_found" });
    const img = await loadImage();
    if (!img) return json(503, { ok: false, error: "image_unavailable" });
    return new Response(req.method === "HEAD" ? null : img, {
      status: 200,
      headers: { "Content-Type": "image/jpeg", "Content-Length": String(img.length), "Cache-Control": "public, max-age=86400" },
    });
  }
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  // ---- Auth: only Mason's ElevenLabs tool knows this secret.
  const { data: expected } = await sb.rpc("mason_tool_secret");
  if (typeof expected !== "string" || expected.length < 32) return json(500, { ok: false, error: "not_configured" });
  if (!constantTimeEqual(req.headers.get("x-mason-tool-secret") ?? "", expected)) return json(401, { ok: false, error: "unauthorized" });

  let body: any = {};
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "bad_json" }); }

  const slug = String(body.company_slug ?? "");
  const convId = body.conversation_id ? String(body.conversation_id).slice(0, 120) : null;
  if (!/^[a-z0-9-]{3,64}$/.test(slug)) return json(400, { ok: false, error: "bad_company" });

  const to = normalizeUsPhone(body.to_phone);
  if (!to) {
    return json(200, { ok: false, sent: false, reason: "invalid_number", say: "That number didn't look like a US cell number. Ask the caller for their 10-digit cell number, or just walk them through it by voice." });
  }

  const { data: company } = await sb
    .from("companies")
    .select("id, name, twilio_from_number, shutoff_guide_enabled")
    .eq("website_slug", slug)
    .maybeSingle();
  if (!company?.shutoff_guide_enabled || !company.twilio_from_number) {
    return json(200, { ok: false, sent: false, reason: "not_enabled", say: "Picture texting isn't available. Walk the caller through it by voice." });
  }

  // ---- Rate limits (protect the business from texting costs and abuse).
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ count: phoneCount }, { count: companyCount }] = await Promise.all([
    sb.from("shutoff_guide_sends").select("id", { count: "exact", head: true }).eq("to_phone", to).eq("status", "sent").gte("created_at", since),
    sb.from("shutoff_guide_sends").select("id", { count: "exact", head: true }).eq("company_id", company.id).gte("created_at", since),
  ]);
  if ((phoneCount ?? 0) >= PER_PHONE_DAY) {
    return json(200, { ok: true, sent: false, reason: "already_sent_today", say: "The picture was already texted to that number today. Ask them to check their texts, and walk them through it by voice." });
  }
  if ((companyCount ?? 0) >= PER_COMPANY_DAY) {
    console.warn(JSON.stringify({ msg: "shutoff_company_daily_cap", company: company.id }));
    return json(200, { ok: false, sent: false, reason: "daily_limit", say: "Picture texting isn't available right now. Walk the caller through it by voice." });
  }

  // ---- Claim this call (unique per conversation) so a repeated tool call can't double-text.
  const { data: claim, error: claimErr } = await sb
    .from("shutoff_guide_sends")
    .insert({ company_id: company.id, conversation_id: convId, to_phone: to, status: "pending" })
    .select("id")
    .maybeSingle();
  if (claimErr || !claim) {
    return json(200, { ok: true, sent: false, reason: "already_sent_this_call", say: "The picture was already texted on this call. Ask them to check their texts." });
  }

  const sid = Deno.env.get("TWILIO_ACCOUNT_SID")?.trim() ?? "";
  const token = Deno.env.get("TWILIO_AUTH_TOKEN")?.trim() ?? "";
  if (!sid || !token) {
    await sb.from("shutoff_guide_sends").update({ status: "failed", error: "missing_twilio_secrets" }).eq("id", claim.id);
    return json(200, { ok: false, sent: false, reason: "not_configured", say: "Picture texting isn't available. Walk the caller through it by voice." });
  }

  const imageUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-shutoff-guide/image.jpg`;
  const text =
    `${company.name}: How to shut off your water at the meter.\n` +
    "1. Find the meter box, usually in the front yard by the sidewalk or curb. Pry the lid up with a screwdriver.\n" +
    "2. Find the CUSTOMER valve on the house side of the meter (right side in the picture). Don't touch the city valve on the street side.\n" +
    "3. Turn the handle 1/4 turn clockwise so it goes ACROSS the pipe. That's off.\n" +
    "If you can't find it or it won't turn, call us back. Reply STOP to opt out.";

  let result: { ok: boolean; sid?: string; error?: string };
  try {
    const r = await fetch(`${TWILIO}/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${sid}:${token}`), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: company.twilio_from_number, To: to, Body: text, MediaUrl: imageUrl }),
      signal: AbortSignal.timeout(10_000),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    result = r.ok ? { ok: true, sid: String(j.sid ?? "") } : { ok: false, error: `twilio_${r.status}_${j.code ?? ""}: ${String(j.message ?? "").slice(0, 200)}` };
  } catch (e) {
    result = { ok: false, error: "twilio_request: " + String(e).slice(0, 150) };
  }

  await sb.from("shutoff_guide_sends").update({ status: result.ok ? "sent" : "failed", twilio_sid: result.sid ?? null, error: result.error ?? null }).eq("id", claim.id);
  await sb.from("audit_log").insert({
    company_id: company.id,
    action: result.ok ? "shutoff_guide_texted" : "shutoff_guide_text_failed",
    autonomy_tier: "tier_1_automatic",
    policy_reference: "emergency_shutoff_guide",
    subject_type: "conversation",
    subject_id: null,
    metadata: { conversationId: convId, ...(result.error ? { error: result.error } : {}) },
  }).then(({ error }) => { if (error) console.warn(JSON.stringify({ msg: "audit_insert_failed", error: error.message })); });

  if (!result.ok) {
    console.error(JSON.stringify({ msg: "shutoff_guide_send_failed", company: company.id, error: result.error }));
    return json(200, { ok: false, sent: false, reason: "send_failed", say: "The text didn't go through. Walk the caller through it by voice." });
  }
  return json(200, { ok: true, sent: true, say: "Picture texted. Tell the caller it's on its way to their phone, then walk them through it while they look." });
});
