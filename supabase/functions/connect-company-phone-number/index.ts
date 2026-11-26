// HURKL — connect a client company's Twilio number to its Mason agent in ElevenLabs.
//
// Admin-only: requires the internal x-worker-secret (stored in Supabase Vault; never handled by a human).
// Uses secrets already saved in Edge Function Secrets, so no credential ever passes through chat:
//   ELEVENLABS_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
//
// POST { "slug": "executive-drains" }
// 1. Checks the Twilio credentials directly with Twilio and confirms the number is on this account.
// 2. Imports the Twilio number into ElevenLabs (reuses it if already imported — safe to re-run).
//    If ElevenLabs reports a Twilio auth failure, retries once with an explicit US1 region config.
// 3. Assigns the number to the company's Mason agent.
// 4. Saves elevenlabs_phone_number_id on the company.
// Never returns or logs secret values — only their shape for troubleshooting.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const EL_BASE = "https://api.elevenlabs.io/v1/convai/phone-numbers";
const TWILIO_BASE = "https://api.twilio.com/2010-04-01";
const TIMEOUT_MS = 15_000;

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function shape(v: string) {
  return { length: v.length, hex_only: /^[0-9a-fA-F]+$/.test(v), starts_with_AC: v.startsWith("AC") };
}

async function el(apiKey: string, path: string, method: string, body?: unknown) {
  const res = await fetch(`${EL_BASE}${path}`, {
    method,
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, json, text: text.slice(0, 400) };
}

async function twilioGet(sid: string, token: string, path: string) {
  try {
    const r = await fetch(`${TWILIO_BASE}/Accounts/${sid}${path}`, {
      headers: { Authorization: "Basic " + btoa(`${sid}:${token}`) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = await r.json().catch(() => null);
    return { status: r.status, json };
  } catch (e) {
    return { status: 0, json: null, error: String(e).slice(0, 120) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { ok: false, error: "method_not_allowed" });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: expected } = await sb.rpc("followup_worker_secret");
  if (typeof expected !== "string" || expected.length < 32) return reply(500, { ok: false, error: "not_configured" });
  if (!constantTimeEqual(req.headers.get("x-worker-secret") ?? "", expected)) return reply(401, { ok: false, error: "unauthorized" });

  let slug = "";
  try { slug = String((await req.json())?.slug ?? ""); } catch { /* ignore */ }
  if (!/^[a-z0-9-]{3,64}$/.test(slug)) return reply(400, { ok: false, error: "bad_slug" });

  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID")?.trim();
  const token = Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();
  const missing = [!apiKey && "ELEVENLABS_API_KEY", !sid && "TWILIO_ACCOUNT_SID", !token && "TWILIO_AUTH_TOKEN"].filter(Boolean);
  if (missing.length) return reply(400, { ok: false, error: "missing_secrets", missing });

  const { data: company, error: cErr } = await sb
    .from("companies")
    .select("id, name, twilio_from_number, elevenlabs_agent_id, elevenlabs_phone_number_id")
    .eq("website_slug", slug)
    .maybeSingle();
  if (cErr || !company) return reply(404, { ok: false, error: "company_not_found" });
  if (!company.twilio_from_number || !company.elevenlabs_agent_id) {
    return reply(400, { ok: false, error: "company_missing_number_or_agent" });
  }

  // Direct Twilio checks (read-only).
  const acct = await twilioGet(sid!, token!, ".json");
  const nums = await twilioGet(sid!, token!, `/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(company.twilio_from_number)}`);
  const numberRec = nums.json?.incoming_phone_numbers?.[0] ?? null;
  const diagnostics = {
    sid: shape(sid!),
    token: shape(token!),
    twilio_account_status: acct.status,
    twilio_account_type: acct.json?.type ?? null,
    twilio_account_state: acct.json?.status ?? null,
    twilio_numbers_status: nums.status,
    number_on_account: !!numberRec,
    number_capabilities: numberRec?.capabilities ?? null,
  };
  if (acct.status !== 200) return reply(400, { ok: false, step: "twilio_check", diagnostics });
  if (!numberRec) return reply(400, { ok: false, step: "number_not_on_account", diagnostics });

  try {
    const list = await el(apiKey!, "", "GET");
    if (!list.ok) return reply(502, { ok: false, step: "list_numbers", status: list.status, detail: list.text });
    const items: any[] = Array.isArray(list.json) ? list.json : (list.json?.phone_numbers ?? []);
    let phoneId: string | null = items.find((p) => p?.phone_number === company.twilio_from_number)?.phone_number_id ?? null;
    let imported = false;
    const attempts: Array<{ variant: string; status: number; detail?: string }> = [];

    if (!phoneId) {
      const base = { provider: "twilio", phone_number: company.twilio_from_number, label: company.name, sid, token };
      const variants: Array<[string, Record<string, unknown>]> = [
        ["default", base],
        ["us1_region", { ...base, region_config: { region_id: "us1", token, edge_location: "ashburn" } }],
      ];
      for (const [name, body] of variants) {
        const created = await el(apiKey!, "", "POST", body);
        if (created.ok && created.json?.phone_number_id) {
          phoneId = String(created.json.phone_number_id);
          imported = true;
          attempts.push({ variant: name, status: created.status });
          break;
        }
        attempts.push({ variant: name, status: created.status, detail: created.text.slice(0, 160) });
      }
      if (!phoneId) return reply(502, { ok: false, step: "import_number", attempts, diagnostics });
    }

    const assigned = await el(apiKey!, `/${encodeURIComponent(phoneId)}`, "PATCH", { agent_id: company.elevenlabs_agent_id });
    if (!assigned.ok) return reply(502, { ok: false, step: "assign_agent", status: assigned.status, detail: assigned.text, phone_number_id: phoneId });

    const { error: uErr } = await sb.from("companies").update({ elevenlabs_phone_number_id: phoneId }).eq("id", company.id);
    if (uErr) return reply(500, { ok: false, step: "save_company", error: uErr.message, phone_number_id: phoneId });

    console.log(JSON.stringify({ msg: "company_phone_connected", slug, imported }));
    return reply(200, { ok: true, imported, attempts, phone_number_id: phoneId, number: company.twilio_from_number, agent_id: company.elevenlabs_agent_id });
  } catch (e) {
    console.error(JSON.stringify({ msg: "connect_phone_failed", slug, error: String(e).slice(0, 300) }));
    return reply(500, { ok: false, error: "request_failed", detail: String(e).slice(0, 300) });
  }
});
