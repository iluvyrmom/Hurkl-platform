// Keeps companies.billing_* in step with the Stripe subscription. Used by the webhook and by owner-billing.
// Billing rules (approved by Josh, Nov 24 2026):
//   - Service starts when the first payment goes through; that day is the billing date every month.
//   - Failed payment: 72-hour grace, Mason keeps working. At 72h Mason pauses (enforce_billing_grace cron).
//   - Paying later turns Mason back on and keeps the original billing date (or $20 to restart billing today).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { stripe } from "./stripe.ts";

export const GRACE_HOURS = 72;

export type BillingCompany = {
  id: string;
  name: string;
  billing_status: string;
  billing_exempt: boolean;
  billing_enforced: boolean;
  billing_plan_cents: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  payment_failed_at: string | null;
  grace_ends_at: string | null;
  mason_paused: boolean;
};

export const COMPANY_BILLING_COLS =
  "id, name, billing_status, billing_exempt, billing_enforced, billing_plan_cents, stripe_customer_id, stripe_subscription_id, payment_failed_at, grace_ends_at, mason_paused";

async function audit(sb: SupabaseClient, companyId: string, action: string, metadata: Record<string, unknown> = {}) {
  const { error } = await sb.from("audit_log").insert({
    company_id: companyId, action, autonomy_tier: "tier_1_automatic", policy_reference: "hurkl_billing",
    subject_type: "company", subject_id: companyId, metadata,
  });
  if (error) console.warn(JSON.stringify({ msg: "billing_audit_failed", action, error: error.message }));
}

export async function alertOwner(sb: SupabaseClient, companyId: string, label: string, text: string) {
  const { error } = await sb.from("owner_escalations").insert({ company_id: companyId, reason: "owner_review_requested", customer_summary: `[${label}] ${text}`.slice(0, 1000) });
  if (error) console.warn(JSON.stringify({ msg: "billing_alert_failed", error: error.message }));
}

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** Pull the subscription from Stripe and update the company row. Returns the new billing_status. */
export async function syncCompanyBilling(sb: SupabaseClient, key: string, c: BillingCompany, reason: string): Promise<string> {
  if (!c.stripe_subscription_id) return c.billing_status;
  const r = await stripe(key, "GET", `/subscriptions/${encodeURIComponent(c.stripe_subscription_id)}`);
  if (!r.ok) {
    console.error(JSON.stringify({ msg: "subscription_fetch_failed", company: c.id, error: r.error }));
    return c.billing_status;
  }
  const sub = r.data;
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
  const now = new Date();
  let update: Record<string, unknown> = { billing_period_end: periodEnd };
  let status = c.billing_status;

  switch (sub.status) {
    case "active":
    case "trialing":
      status = "active";
      update = { ...update, billing_status: "active", payment_failed_at: null, grace_ends_at: null, grace_warning_sent: false, mason_paused: false, mason_paused_at: null };
      if (!c.billing_exempt) update.billing_enforced = true; // paying is what starts the service
      break;
    case "past_due":
    case "unpaid": {
      const failedAt = c.payment_failed_at ?? now.toISOString();
      const graceEnds = c.grace_ends_at ?? new Date(Date.parse(failedAt) + GRACE_HOURS * 3600_000).toISOString();
      // Once the cron has paused Mason, stay paused until a payment goes through.
      status = c.billing_status === "paused" || Date.parse(graceEnds) <= now.getTime() ? "paused" : "past_due";
      update = { ...update, billing_status: status, payment_failed_at: failedAt, grace_ends_at: graceEnds };
      if (status === "paused" && !c.mason_paused) update = { ...update, mason_paused: true, mason_paused_at: now.toISOString() };
      if (!c.payment_failed_at) {
        await alertOwner(sb, c.id, "Billing: payment didn't go through",
          `Your HURKL payment didn't go through. Mason keeps working until ${fmtTime(graceEnds)}. Open Billing in your Mason app to pay or update your card.`);
      }
      break;
    }
    case "canceled":
    case "incomplete_expired":
      status = "canceled";
      update = { ...update, billing_status: "canceled", mason_paused: c.billing_enforced && !c.billing_exempt, mason_paused_at: now.toISOString() };
      break;
    default: // incomplete: first payment not finished yet
      status = c.billing_status === "none" ? "none" : c.billing_status;
  }

  const { error } = await sb.from("companies").update(update).eq("id", c.id);
  if (error) console.error(JSON.stringify({ msg: "company_billing_update_failed", company: c.id, error: error.message }));
  if (status !== c.billing_status) await audit(sb, c.id, `billing_${c.billing_status}_to_${status}`, { reason, stripe_status: sub.status });
  return status;
}

/** Make a card the default for future charges (customer + subscription). */
export async function setDefaultCard(key: string, customerId: string, subscriptionId: string | null, paymentMethodId: string) {
  const a = await stripe(key, "POST", `/customers/${encodeURIComponent(customerId)}`, { invoice_settings: { default_payment_method: paymentMethodId } });
  if (!a.ok) console.warn(JSON.stringify({ msg: "set_customer_default_pm_failed", error: a.error }));
  if (subscriptionId) {
    const b = await stripe(key, "POST", `/subscriptions/${encodeURIComponent(subscriptionId)}`, { default_payment_method: paymentMethodId });
    if (!b.ok) console.warn(JSON.stringify({ msg: "set_subscription_default_pm_failed", error: b.error }));
  }
}
