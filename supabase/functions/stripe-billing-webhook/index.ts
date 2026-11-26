// HURKL — stripe-billing-webhook: Stripe tells us about payments; we update the company's billing state.
// Signed by Stripe (HURKL_STRIPE_WEBHOOK_SECRET). Each event is handled once (stripe_events).
//
// Events: invoice.paid, invoice.payment_failed, customer.subscription.created|updated|deleted,
//         setup_intent.succeeded

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { stripe, verifyStripeSignature } from "./_shared/stripe.ts";
import { type BillingCompany, COMPANY_BILLING_COLS, setDefaultCard, syncCompanyBilling } from "./_shared/billing_sync.ts";

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function companyFor(sb: SupabaseClient, customerId: string | null, companyId: string | null): Promise<BillingCompany | null> {
  if (customerId) {
    const { data } = await sb.from("companies").select(COMPANY_BILLING_COLS).eq("stripe_customer_id", customerId).maybeSingle<BillingCompany>();
    if (data) return data;
  }
  if (companyId && /^[0-9a-f-]{36}$/i.test(companyId)) {
    const { data } = await sb.from("companies").select(COMPANY_BILLING_COLS).eq("id", companyId).maybeSingle<BillingCompany>();
    if (data) return data;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
  const key = (Deno.env.get("HURKL_STRIPE_SECRET_KEY") ?? "").trim();
  const whsec = (Deno.env.get("HURKL_STRIPE_WEBHOOK_SECRET") ?? "").trim();
  if (!key || !whsec) return reply(500, { error: "not_configured" });

  const raw = await req.text();
  if (!(await verifyStripeSignature(raw, req.headers.get("stripe-signature"), whsec))) return reply(400, { error: "bad_signature" });

  let event: any;
  try { event = JSON.parse(raw); } catch { return reply(400, { error: "bad_json" }); }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

  // Handle each event once.
  const { error: dupErr } = await sb.from("stripe_events").insert({ id: String(event.id), type: String(event.type) });
  if (dupErr) {
    if (dupErr.code === "23505") return reply(200, { ok: true, duplicate: true });
    return reply(500, { error: "event_log_failed" }); // Stripe will retry
  }

  try {
    const obj = event.data?.object ?? {};
    const customerId: string | null = typeof obj.customer === "string" ? obj.customer : obj.customer?.id ?? null;
    const company = await companyFor(sb, customerId, obj.metadata?.company_id ?? obj.subscription_details?.metadata?.company_id ?? null);
    if (!company) return reply(200, { ok: true, ignored: "unknown_customer" });

    switch (event.type) {
      case "invoice.paid": {
        // A new card used to pay becomes the card on file.
        if (obj.payment_intent) {
          const pi = await stripe(key, "GET", `/payment_intents/${encodeURIComponent(String(obj.payment_intent))}`);
          if (pi.ok && pi.data.payment_method && company.stripe_customer_id) {
            await setDefaultCard(key, company.stripe_customer_id, company.stripe_subscription_id, String(pi.data.payment_method));
          }
        }
        await syncCompanyBilling(sb, key, company, event.type);
        break;
      }
      case "invoice.payment_failed":
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncCompanyBilling(sb, key, company, event.type);
        break;
      case "setup_intent.succeeded":
        if (obj.payment_method && company.stripe_customer_id) {
          await setDefaultCard(key, company.stripe_customer_id, company.stripe_subscription_id, String(obj.payment_method));
        }
        break;
    }
    return reply(200, { ok: true });
  } catch (e) {
    // Let Stripe retry: forget the event so the retry is processed.
    await sb.from("stripe_events").delete().eq("id", String(event.id));
    console.error(JSON.stringify({ msg: "webhook_failed", type: event.type, error: String(e).slice(0, 200) }));
    return reply(500, { error: "processing_failed" });
  }
});
