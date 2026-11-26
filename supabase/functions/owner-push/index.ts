// HURKL — owner-push: phone notifications for the owner app.
//
//   GET  ?public-key            -> { publicKey } (the app needs it to subscribe; it is public by design)
//   POST { kind, id }           -> sends one notification (called by DB triggers with x-worker-secret)
//        kind: "lead" | "attention" | "announcement"
//
// Each (kind, id) is sent at most once (push_deliveries unique). Expired subscriptions are removed.
// VAPID keys are generated on first use and kept in Supabase Vault; the private key never leaves the server.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { generateVapidKeys, sendPush, type VapidKeys } from "../_shared/webpush.ts";
import { getWorkerSecret } from "../_shared/worker_secret.ts";

const SUBJECT = "mailto:josh@hurkl.com";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

let cachedKeys: VapidKeys | null = null;
async function vapidKeys(sb: SupabaseClient): Promise<VapidKeys | null> {
  if (cachedKeys) return cachedKeys;
  const read = async () => {
    const { data } = await sb.rpc("owner_push_vapid_keys");
    return typeof data === "string" && data ? JSON.parse(data) as VapidKeys : null;
  };
  let keys = await read();
  if (!keys) {
    const fresh = await generateVapidKeys();
    const { error } = await sb.rpc("owner_push_store_vapid_keys", { keys_json: JSON.stringify(fresh) });
    if (error) console.error(JSON.stringify({ msg: "vapid_store_failed", error: error.message }));
    keys = await read(); // another instance may have won the race; always use the stored pair
  }
  cachedKeys = keys;
  return keys;
}

type Note = { companyIds: string[] | "all"; title: string; body: string; url: string; tag: string };

function firstName(name: string | null): string {
  const n = (name ?? "").trim();
  return !n || n === "Angi customer" ? "New customer" : n.split(/\s+/)[0];
}

async function buildNote(sb: SupabaseClient, kind: string, id: string): Promise<Note | null> {
  if (kind === "lead") {
    const { data: l } = await sb.from("leads").select("company_id, name, first_name, service_requested, city, source").eq("id", id).maybeSingle();
    if (!l) return null;
    const who = l.first_name ?? firstName(l.name);
    const parts = [who, l.service_requested, l.city].filter(Boolean).join(" · ");
    const from = String(l.source ?? "").toLowerCase().includes("angi") ? "New Angi lead" : "New lead";
    return { companyIds: [l.company_id], title: from, body: `${parts}. Mason is on it.`, url: `/#lead-${id}`, tag: `lead-${id}` };
  }
  if (kind === "attention") {
    const { data: e } = await sb.from("owner_escalations").select("company_id, customer_summary").eq("id", id).maybeSingle();
    if (!e) return null;
    const label = String(e.customer_summary ?? "").match(/^\[([^\]]+)\]/)?.[1];
    const text = String(e.customer_summary ?? "").replace(/^\[[^\]]+\]\s*/, "");
    return { companyIds: [e.company_id], title: label ? `Needs you: ${label.replace(/^Angi lead:\s*/i, "")}` : "Needs your attention", body: text.slice(0, 180), url: "/#attention", tag: `attention-${id}` };
  }
  if (kind === "announcement") {
    const { data: a } = await sb.from("hurkl_announcements").select("company_id, title, body, published, notify").eq("id", id).maybeSingle();
    if (!a || !a.published || !a.notify) return null;
    return { companyIds: a.company_id ? [a.company_id] : "all", title: `From HURKL: ${a.title}`, body: String(a.body).slice(0, 180), url: "/#hurkl", tag: `hurkl-${id}` };
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

  if (req.method === "GET") {
    const keys = await vapidKeys(sb);
    return keys ? reply(200, { publicKey: keys.publicKey }) : reply(500, { error: "not_configured" });
  }
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const expected = await getWorkerSecret(sb);
  if (!expected) return reply(500, { error: "not_configured" });
  if (!constantTimeEqual(req.headers.get("x-worker-secret") ?? "", expected)) return reply(401, { error: "unauthorized" });

  let body: { kind?: string; id?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const kind = String(body.kind ?? "");
  const id = String(body.id ?? "");
  if (!["lead", "attention", "announcement"].includes(kind) || !/^[0-9a-f-]{36}$/i.test(id)) return reply(400, { error: "bad_input" });

  const keys = await vapidKeys(sb);
  if (!keys) return reply(500, { error: "vapid_unavailable" });

  const note = await buildNote(sb, kind, id);
  if (!note) return reply(200, { sent: 0, reason: "nothing_to_send" });

  let subsQuery = sb.from("push_subscriptions").select("id, company_id, endpoint, p256dh, auth, failure_count");
  if (note.companyIds !== "all") subsQuery = subsQuery.in("company_id", note.companyIds);
  const { data: subs, error: subsErr } = await subsQuery;
  if (subsErr) return reply(500, { error: "subscription_lookup_failed" });
  if (!subs?.length) return reply(200, { sent: 0, reason: "no_subscribers" });

  // Claim: each notification goes out once, even if the trigger fires twice.
  const claimCompany = note.companyIds === "all" ? subs[0].company_id : note.companyIds[0];
  const { data: claim, error: claimErr } = await sb.from("push_deliveries")
    .insert({ company_id: claimCompany, kind, ref_id: id }).select("id").maybeSingle();
  if (claimErr || !claim) return reply(200, { sent: 0, reason: "already_sent" });

  let sent = 0;
  for (const s of subs) {
    const r = await sendPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, { title: note.title, body: note.body, url: note.url, tag: note.tag }, keys, SUBJECT);
    if (r.ok) {
      sent++;
      await sb.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq("id", s.id);
    } else if (r.gone) {
      await sb.from("push_subscriptions").delete().eq("id", s.id);
    } else {
      console.warn(JSON.stringify({ msg: "push_failed", status: r.status, error: r.error }));
      await sb.from("push_subscriptions").update({ failure_count: (s.failure_count ?? 0) + 1 }).eq("id", s.id);
    }
  }
  await sb.from("push_deliveries").update({ sent_count: sent }).eq("id", claim.id);
  return reply(200, { sent, total: subs.length });
});
