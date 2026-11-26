// HURKL — admin-only test: have a company's Mason place ONE Angi-style callback to a given number.
// Uses the exact same ElevenLabs outbound-call request and greeting as lead-followup-worker,
// so it proves the real callback path without creating a lead or turning auto-callback on.
// Auth: internal x-worker-secret (Supabase Vault). Body: { slug, to, first_name?, service? }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

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

function toE164(raw: unknown): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { ok: false, error: "method_not_allowed" });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: expected } = await sb.rpc("followup_worker_secret");
  if (typeof expected !== "string" || expected.length < 32) return reply(500, { ok: false, error: "not_configured" });
  if (!constantTimeEqual(req.headers.get("x-worker-secret") ?? "", expected)) return reply(401, { ok: false, error: "unauthorized" });

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const slug = String(body.slug ?? "");
  const to = toE164(body.to);
  if (!/^[a-z0-9-]{3,64}$/.test(slug) || !to) return reply(400, { ok: false, error: "bad_input" });
  const firstName = body.first_name ? String(body.first_name).slice(0, 40) : null;
  const service = body.service ? String(body.service).slice(0, 80) : "service";

  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) return reply(400, { ok: false, error: "missing_elevenlabs_key" });

  const { data: company } = await sb
    .from("companies")
    .select("id, name, elevenlabs_agent_id, elevenlabs_phone_number_id")
    .eq("website_slug", slug)
    .maybeSingle();
  if (!company?.elevenlabs_agent_id || !company?.elevenlabs_phone_number_id) return reply(400, { ok: false, error: "company_not_ready" });

  const hi = `Hi${firstName ? ` ${firstName}` : ""}`;
  const greeting = `${hi}, this is Mason with ${company.name}. I'm calling about the ${service} request you just sent us through Angi. Is now a good time?`;

  const res = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "xi-api-key": apiKey },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      agent_id: company.elevenlabs_agent_id,
      agent_phone_number_id: company.elevenlabs_phone_number_id,
      to_number: to,
      conversation_initiation_client_data: {
        dynamic_variables: {
          call_type: "angi_callback",
          customer_first_name: firstName ?? "",
          service_requested: service,
          lead_id: "test-call",
          attempt_number: "1",
        },
        conversation_config_override: { agent: { first_message: greeting } },
      },
    }),
  });
  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { /* ignore */ }
  console.log(JSON.stringify({ msg: "test_callback", slug, status: res.status, ok: res.ok }));
  return reply(res.ok ? 200 : 502, { ok: res.ok && json.success !== false, status: res.status, conversation_id: json.conversation_id ?? null, detail: res.ok ? null : text.slice(0, 300) });
});
