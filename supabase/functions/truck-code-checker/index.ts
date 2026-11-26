// HURKL — truck-code-checker: confirms every truck rental code on the rental company's official page.
// Runs daily from pg_cron (x-worker-secret). For each code:
//   - expired, page unreachable, or the code text is gone from the official page -> code paused, owner alerted
//   - still there -> marked checked (Mason may share it for 7 days from the last good check)
// A paused code is never turned back on automatically; the owner approves it again.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { getWorkerSecret } from "./_shared/worker_secret.ts";

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function pageHasText(url: string, text: string): Promise<{ ok: boolean; note: string }> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HURKL-code-check/1.0)", Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return { ok: false, note: `page_status_${r.status}` };
    const html = (await r.text()).toLowerCase();
    return html.includes(text.toLowerCase()) ? { ok: true, note: "code_found_on_official_page" } : { ok: false, note: "code_not_found_on_official_page" };
  } catch (e) {
    return { ok: false, note: "page_unreachable: " + String(e).slice(0, 100) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const expected = await getWorkerSecret(sb);
  if (!expected) return reply(500, { error: "not_configured" });
  if (!constantTimeEqual(req.headers.get("x-worker-secret") ?? "", expected)) return reply(401, { error: "unauthorized" });

  const { data: codes, error } = await sb.from("truck_rental_codes")
    .select("id, company_id, provider, code, offer, source_url, verify_text, expires_on, status")
    .in("status", ["active", "pending_review"]);
  if (error) return reply(500, { error: "lookup_failed" });

  const today = new Date().toISOString().slice(0, 10);
  const results = [];
  for (const c of codes ?? []) {
    const expired = c.expires_on && c.expires_on < today;
    const check = expired ? { ok: false, note: "expired" } : await pageHasText(c.source_url, c.verify_text);
    const update: Record<string, unknown> = { last_checked_at: new Date().toISOString(), last_check_ok: check.ok, last_check_note: check.note, updated_at: new Date().toISOString() };
    if (!check.ok && c.status === "active") {
      update.status = "paused";
      await sb.from("owner_escalations").insert({
        company_id: c.company_id,
        reason: "owner_review_requested",
        customer_summary: `[Truck code paused] ${c.provider} ${c.code ?? ""} (${c.offer}) could not be confirmed on the official page (${check.note}), so Mason stopped sharing it. Review it before turning it back on.`.slice(0, 1000),
      });
    }
    await sb.from("truck_rental_codes").update(update).eq("id", c.id);
    results.push({ provider: c.provider, code: c.code, ok: check.ok, note: check.note });
  }
  return reply(200, { checked: results.length, results });
});
