// HURKL — owner-billing: in-app billing for the owner app. Signed-in owners only (their own company).
//
// POST { action } with the owner's sign-in token (Authorization: Bearer ...):
//   status        -> plan, status, next charge date, card on file, receipts, open bill
//   start         -> first payment: returns a client secret for Stripe's card form inside the app
//   pay_now       -> pay the open bill with the card on file
//   pay_new_card  -> client secret to pay the open bill with a different card
//   restart_today -> (after a missed payment) restart billing today for plan + $20
//   update_card   -> client secret to save a new card for future charges
//
// Amounts always come from the server (companies.billing_plan_cents), never from the app.
// Secrets: HURKL_STRIPE_SECRET_KEY, HURKL_STRIPE_PUBLISHABLE_KEY (entered by Josh in Supabase).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { keyMode, stripe } from "./_shared/stripe.ts";
import { type BillingCompany, COMPANY_BILLING_COLS, syncCompanyBilling } from "./_shared/billing_sync.ts";

const RESTART_FEE_CENTS = 2000;
const ALLOWED_ORIGINS = ["https://hurkl-mason-app.netlify.app", "http://localhost:8765"];

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

async function productId(sb: SupabaseClient, key: string): Promise<string | null> {
  const cfgKey = `${keyMode(key)}:mason_product_id`;
  const { data } = await sb.from("billing_config").select("value").eq("key", cfgKey).maybeSingle();
  if (data?.value) return data.value;
  const p = await stripe(key, "POST", "/products", { name: "Mason office manager", description: "HURKL AI office manager, monthly service" }, `hurkl-${cfgKey}`);
  if (!p.ok) { console.error(JSON.stringify({ msg: "product_create_failed", error: p.error })); return null; }
  await sb.from("billing_config").upsert({ key: cfgKey, value: p.data.id });
  const { data: again } = await sb.from("billing_config").select("value").eq("key", cfgKey).maybeSingle();
  return again?.value ?? p.data.id;
}

async function openInvoice(key: string, subscriptionId: string) {
  const r = await stripe(key, "GET", "/invoices", { subscription: subscriptionId, status: "open", limit: 1, expand: ["data.payment_intent"] });
  return r.ok ? r.data.data?.[0] ?? null : null;
}

Deno.serve(async (req: Request) => {
  const headers = { "Content-Type": "application/json", ...cors(req) };
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

  // Who is asking?
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await sb.auth.getUser(jwt);
  if (!auth?.user) return reply(401, { error: "not_signed_in" });
  const { data: profile } = await sb.from("profiles").select("company_id, role").eq("id", auth.user.id).maybeSingle();
  if (!profile?.company_id || !["owner", "hurkl_admin"].includes(String(profile.role))) return reply(403, { error: "owner_only" });

  const { data: company } = await sb.from("companies").select(COMPANY_BILLING_COLS).eq("id", profile.company_id).maybeSingle<BillingCompany>();
  if (!company) return reply(404, { error: "company_not_found" });

  let body: { action?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action ?? "status");

  const key = (Deno.env.get("HURKL_STRIPE_SECRET_KEY") ?? "").trim();
  const publishable = (Deno.env.get("HURKL_STRIPE_PUBLISHABLE_KEY") ?? "").trim();
  const configured = !!key && !!publishable && keyMode(key) === (publishable.startsWith("pk_live_") ? "live" : "test");

  if (company.billing_exempt) return reply(200, { exempt: true, configured });
  if (!configured) return reply(200, { configured: false, plan_cents: company.billing_plan_cents, status: company.billing_status });

  // ---------------- status ----------------
  if (action === "status") {
    let c = company;
    if (c.stripe_subscription_id) {
      await syncCompanyBilling(sb, key, c, "status_check");
      const { data } = await sb.from("companies").select(COMPANY_BILLING_COLS).eq("id", c.id).maybeSingle<BillingCompany>();
      if (data) c = data;
    }
    let card: { brand: string; last4: string } | null = null;
    let receipts: unknown[] = [];
    let open: { id: string; amount_cents: number; created: number } | null = null;
    let nextCharge: number | null = null;
    if (c.stripe_customer_id) {
      const cust = await stripe(key, "GET", `/customers/${encodeURIComponent(c.stripe_customer_id)}`, { expand: ["invoice_settings.default_payment_method"] });
      const pm = cust.ok ? cust.data.invoice_settings?.default_payment_method : null;
      if (pm?.card) card = { brand: pm.card.brand, last4: pm.card.last4 };
      const inv = await stripe(key, "GET", "/invoices", { customer: c.stripe_customer_id, limit: 12 });
      if (inv.ok) {
        receipts = inv.data.data.filter((i: any) => i.status === "paid").map((i: any) => ({
          date: i.status_transitions?.paid_at ?? i.created, amount_cents: i.amount_paid, url: i.hosted_invoice_url,
        }));
        const o = inv.data.data.find((i: any) => i.status === "open");
        if (o) open = { id: o.id, amount_cents: o.amount_due, created: o.created };
      }
    }
    if (c.stripe_subscription_id && c.billing_status === "active") {
      const s = await stripe(key, "GET", `/subscriptions/${encodeURIComponent(c.stripe_subscription_id)}`);
      if (s.ok && !s.data.cancel_at_period_end) nextCharge = s.data.current_period_end;
    }
    return reply(200, {
      configured: true, publishable_key: publishable, plan_cents: c.billing_plan_cents, restart_fee_cents: RESTART_FEE_CENTS,
      status: c.billing_status, grace_ends_at: c.grace_ends_at, paused: c.mason_paused, next_charge: nextCharge,
      card, receipts, open_bill: open,
    });
  }

  // ---------------- start (first payment) ----------------
  if (action === "start") {
    if (["active", "past_due", "paused"].includes(company.billing_status)) return reply(409, { error: "already_started" });
    const prod = await productId(sb, key);
    if (!prod) return reply(502, { error: "billing_unavailable" });

    let customerId = company.stripe_customer_id;
    if (!customerId) {
      const cu = await stripe(key, "POST", "/customers", { name: company.name, email: auth.user.email, metadata: { company_id: company.id } }, `hurkl-customer-${company.id}`);
      if (!cu.ok) return reply(502, { error: "billing_unavailable" });
      customerId = cu.data.id;
      await sb.from("companies").update({ stripe_customer_id: customerId }).eq("id", company.id);
    }

    // Reuse an unfinished first payment instead of creating a second subscription.
    if (company.stripe_subscription_id) {
      const s = await stripe(key, "GET", `/subscriptions/${encodeURIComponent(company.stripe_subscription_id)}`, { expand: ["latest_invoice.payment_intent"] });
      if (s.ok && s.data.status === "incomplete" && s.data.latest_invoice?.payment_intent?.client_secret) {
        return reply(200, { client_secret: s.data.latest_invoice.payment_intent.client_secret, amount_cents: s.data.latest_invoice.amount_due, publishable_key: publishable });
      }
    }

    const sub = await stripe(key, "POST", "/subscriptions", {
      customer: customerId,
      items: [{ price_data: { currency: "usd", product: prod, unit_amount: company.billing_plan_cents, recurring: { interval: "month" } } }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription", payment_method_types: ["card"] },
      expand: ["latest_invoice.payment_intent"],
      metadata: { company_id: company.id },
    }, `hurkl-sub-${company.id}-${Math.floor(Date.now() / 600_000)}`);
    if (!sub.ok) { console.error(JSON.stringify({ msg: "subscription_create_failed", error: sub.error })); return reply(502, { error: "billing_unavailable" }); }
    await sb.from("companies").update({ stripe_subscription_id: sub.data.id }).eq("id", company.id);
    const secret = sub.data.latest_invoice?.payment_intent?.client_secret;
    if (!secret) return reply(502, { error: "billing_unavailable" });
    return reply(200, { client_secret: secret, amount_cents: sub.data.latest_invoice.amount_due, publishable_key: publishable });
  }

  // Everything below needs an existing subscription.
  if (!company.stripe_subscription_id || !company.stripe_customer_id) return reply(409, { error: "not_started" });

  // ---------------- pay the open bill ----------------
  if (action === "pay_now" || action === "pay_new_card") {
    const inv = await openInvoice(key, company.stripe_subscription_id);
    if (!inv) { await syncCompanyBilling(sb, key, company, "nothing_owed"); return reply(200, { paid: true, nothing_owed: true }); }
    if (action === "pay_new_card") {
      const secret = inv.payment_intent?.client_secret;
      return secret ? reply(200, { client_secret: secret, amount_cents: inv.amount_due, publishable_key: publishable }) : reply(502, { error: "billing_unavailable" });
    }
    const paid = await stripe(key, "POST", `/invoices/${encodeURIComponent(inv.id)}/pay`, {}, `hurkl-pay-${inv.id}-${Math.floor(Date.now() / 60_000)}`);
    if (!paid.ok) return reply(402, { error: "card_declined", message: "Your card on file was declined. Try a different card." });
    const status = await syncCompanyBilling(sb, key, company, "pay_now");
    return reply(200, { paid: true, status });
  }

  // ---------------- restart billing today (+$20) ----------------
  if (action === "restart_today") {
    if (!["past_due", "paused"].includes(company.billing_status)) return reply(409, { error: "only_after_missed_payment" });
    const prod = await productId(sb, key);
    if (!prod) return reply(502, { error: "billing_unavailable" });
    // Void the missed bill first so the customer is never charged for both.
    const inv = await openInvoice(key, company.stripe_subscription_id);
    if (inv) {
      const v = await stripe(key, "POST", `/invoices/${encodeURIComponent(inv.id)}/void`, {}, `hurkl-void-${inv.id}`);
      if (!v.ok) return reply(502, { error: "billing_unavailable" });
    }
    const upd = await stripe(key, "POST", `/subscriptions/${encodeURIComponent(company.stripe_subscription_id)}`, {
      billing_cycle_anchor: "now",
      proration_behavior: "none",
      payment_behavior: "allow_incomplete",
      add_invoice_items: [{ price_data: { currency: "usd", product: prod, unit_amount: RESTART_FEE_CENTS } }],
      expand: ["latest_invoice.payment_intent"],
    }, `hurkl-restart-${company.id}-${inv?.id ?? "none"}`);
    if (!upd.ok) { console.error(JSON.stringify({ msg: "restart_failed", error: upd.error })); return reply(502, { error: "billing_unavailable" }); }
    await sb.from("audit_log").insert({ company_id: company.id, action: "billing_restart_today", autonomy_tier: "tier_1_automatic", policy_reference: "hurkl_billing", subject_type: "company", subject_id: company.id, metadata: { voided_invoice: inv?.id ?? null } });
    const latest = upd.data.latest_invoice;
    if (latest?.status === "paid") {
      const status = await syncCompanyBilling(sb, key, company, "restart_today");
      return reply(200, { paid: true, status });
    }
    const secret = latest?.payment_intent?.client_secret;
    return secret ? reply(200, { client_secret: secret, amount_cents: latest.amount_due, publishable_key: publishable }) : reply(502, { error: "billing_unavailable" });
  }

  // ---------------- save a new card for future charges ----------------
  if (action === "update_card") {
    const si = await stripe(key, "POST", "/setup_intents", {
      customer: company.stripe_customer_id, usage: "off_session", payment_method_types: ["card"], metadata: { company_id: company.id },
    });
    if (!si.ok) return reply(502, { error: "billing_unavailable" });
    return reply(200, { client_secret: si.data.client_secret, setup: true, publishable_key: publishable });
  }

  return reply(400, { error: "unknown_action" });
});
