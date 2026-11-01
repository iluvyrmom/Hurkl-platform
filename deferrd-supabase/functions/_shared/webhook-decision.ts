// Decides what a completed Stripe checkout means. Pure: the glue code applies the result.
// Rule: money received is NEVER the same as a confirmed order. Anything that does not add up
// is recorded as "needs review" and an ops alert is raised — it is not marked confirmed.
import { quote, type Settings } from './pricing.ts';

export type Decision =
  | { action: 'ignore'; reason: string }
  | { action: 'already_processed' }
  | { action: 'confirm'; gifts: GiftWrite[]; ledger: any[] }
  | { action: 'review'; reason: string; detail: Record<string, unknown>; gifts: GiftWrite[]; alert: { severity: 'critical'; category: 'order_failed'; message: string } };

export type GiftWrite = { id: string; patch: Record<string, unknown>; payment?: Record<string, unknown>; activity: Record<string, unknown> };

export function decideGiftCheckout(i: { session: any; gifts: any[]; settings: Settings }): Decision {
  const { session, settings } = i;
  if (session.payment_status !== 'paid') return { action: 'ignore', reason: `payment_status is ${session.payment_status}` };

  const ids = String(session.metadata?.gift_request_ids || '').split(',').map((s) => s.trim()).filter(Boolean);
  const received = Number(session.amount_total);
  const review = (reason: string, detail: Record<string, unknown>, gifts: GiftWrite[] = []): Decision => ({
    action: 'review', reason, detail, gifts,
    alert: { severity: 'critical', category: 'order_failed',
      message: `Payment ${session.id} ($${(received / 100).toFixed(2)}) needs manual review: ${reason}. Money was received; do not treat the order as confirmed.` },
  });
  if (!ids.length) return review('NO_GIFT_IDS', { received });

  const byId = new Map(i.gifts.map((g) => [g.id, g]));
  const gifts = ids.map((id) => byId.get(id));
  if (gifts.some((g) => !g)) return review('GIFT_NOT_FOUND', { ids, received });
  const found = gifts as any[];

  if (found.every((g) => g.payment_status === 'paid' && g.stripe_payment_reference === session.id)) return { action: 'already_processed' };

  const sessionCustomer = session.metadata?.customer_id;
  if (found.some((g) => g.customer_id !== sessionCustomer)) return review('CUSTOMER_MISMATCH', { received });
  if (found.some((g) => g.status !== 'Awaiting Payment')) return review('UNEXPECTED_STATUS', { statuses: found.map((g) => g.status), received });

  // Three numbers must agree: what Stripe collected, what the engine says, what the server stored at checkout.
  let engine = 0, stored = 0;
  const quotes = found.map((g) => {
    const q = quote(settings, { type: 'greeting_card', unit_price: g.original_product_price, quantity: g.original_product_quantity || 1,
      shipping: g.estimated_shipping, per_unit_tax: g.estimated_tax });
    engine += q.totalCents; stored += Math.round((Number(g.total_due_today) || 0) * 100);
    return q;
  });
  const holdAll = (reason: string) => review(reason, { received, engine, stored, currency: session.currency },
    found.map((g) => ({ id: g.id, patch: { stripe_payment_reference: session.id, payment_status: 'paid_needs_review' },
      payment: { gift_request_id: g.id, customer_id: g.customer_id, stripe_payment_reference: `${session.id}:${g.id}`, total_collected: null, payment_status: 'paid_needs_review' },
      activity: { gift_request_id: g.id, customer_id: g.customer_id, action: `Payment received but needs review (${reason})`, previous_status: g.status, new_status: g.status, responsible_user: 'System', notes: `Stripe session: ${session.id}` } })));

  if (String(session.currency || '').toLowerCase() !== String(settings.currency || 'usd').toLowerCase()) return holdAll('CURRENCY_MISMATCH');
  if (!Number.isFinite(received) || received !== engine || received !== stored) return holdAll('AMOUNT_MISMATCH');

  const writes: GiftWrite[] = found.map((g, n) => {
    const d = quotes[n].detail!;
    return {
      id: g.id,
      patch: { status: 'Paid — Monitoring Active', stripe_payment_reference: session.id, payment_status: 'paid',
        product_cost: d.productCost, estimated_shipping: d.estimatedShipping, estimated_tax: d.estimatedTax, service_fee: d.serviceFee,
        protection_reserve: d.protectionReserve, total_due_today: quotes[n].total, refundable_balance: d.protectionReserve },
      payment: { gift_request_id: g.id, customer_id: g.customer_id, stripe_payment_reference: `${session.id}:${g.id}`, product_funds: d.productCost,
        shipping_funds: d.estimatedShipping, estimated_tax: d.estimatedTax, service_fee: d.serviceFee, protection_reserve: d.protectionReserve,
        total_collected: quotes[n].total, refundable_balance: d.protectionReserve, payment_status: 'paid' },
      activity: { gift_request_id: g.id, customer_id: g.customer_id, action: 'Payment confirmed (Stripe)', previous_status: 'Awaiting Payment',
        new_status: 'Paid — Monitoring Active', responsible_user: 'System', notes: `Stripe session: ${session.id}` },
    };
  });
  const ledger = found.map((g, n) => ({ customer_id: g.customer_id, category: 'greeting_card', product_type: 'greeting_card', product_ref: g.id,
    base_amount: quotes[n].detail!.productCost, fee_amount: quotes[n].detail!.serviceFee, total: quotes[n].total, status: 'paid',
    stripe_payment_reference: `${session.id}:${g.id}`, breakdown: { lines: quotes[n].lines, pricing_config: quotes[n].pricingConfig } }));
  return { action: 'confirm', gifts: writes, ledger };
}
