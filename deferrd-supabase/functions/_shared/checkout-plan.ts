// Plans a greeting-card checkout. Pure: no database, no Stripe. The glue code loads the
// gift requests, calls this, writes `updates`, and creates the Stripe session from `lineItems`.
import { quote, type Settings } from './pricing.ts';

export class CheckoutError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message: string) { super(message); this.code = code; this.status = status; }
}

export type PlanInput = {
  gifts: any[]; userId: string; settings: Settings; siteUrl: string;
  newId: () => string; newOrderNumber: () => string; today: Date;
};

const day = (d: Date) => d.toISOString().slice(0, 10);
const MAX_ITEMS = 25;

export function planCheckout(i: PlanInput) {
  if (!i.gifts.length) throw new CheckoutError('NO_ITEMS', 400, 'Nothing to check out');
  if (i.gifts.length > MAX_ITEMS) throw new CheckoutError('TOO_MANY', 400, 'Too many items in one checkout');

  // Return links come from OUR configuration, never from the browser (prevents redirect tricks).
  let site: URL;
  try { site = new URL(i.siteUrl); } catch { throw new CheckoutError('CONFIG', 500, 'Site URL is not configured'); }
  if (site.protocol !== 'https:' && site.hostname !== 'localhost') throw new CheckoutError('CONFIG', 500, 'Site URL must be https');
  const base = site.origin;

  const priced = i.gifts.map((g) => {
    if (g.customer_id !== i.userId) throw new CheckoutError('FORBIDDEN', 403, 'Not your request');
    if (g.status !== 'Draft' && g.status !== 'Awaiting Payment') throw new CheckoutError('NOT_PAYABLE', 400, 'One or more items are not available for checkout');
    // Refuse bad input outright — the engine's own caps are a last-resort safety net, not a way to "fix" an order.
    const rawPrice = Number(g.original_product_price), rawQty = Number(g.original_product_quantity || 1);
    if (!Number.isFinite(rawPrice) || rawPrice <= 0 || rawPrice > 100000) throw new CheckoutError('BAD_PRICE', 400, 'Invalid pricing: product price must be between $0.01 and $100,000');
    if (!Number.isInteger(rawQty) || rawQty < 1 || rawQty > 1000) throw new CheckoutError('BAD_QUANTITY', 400, 'Invalid quantity');
    const q = quote(i.settings, { type: 'greeting_card', unit_price: g.original_product_price, quantity: g.original_product_quantity || 1,
      shipping: g.estimated_shipping, per_unit_tax: g.estimated_tax });
    if (q.detail!.productCost <= 0) throw new CheckoutError('BAD_PRICE', 400, 'Invalid pricing: product cost must be positive');
    if (q.detail!.productCost > 100000) throw new CheckoutError('BAD_PRICE', 400, 'Product cost exceeds maximum allowed ($100,000)');
    // Founder rule: the service is never free. A zero fee means the settings are broken: stop.
    if (q.detail!.serviceFee <= 0) throw new CheckoutError('CONFIG', 503, 'Checkout is temporarily unavailable. Please try again later.');
    return { g, q };
  });

  // Reuse the same order if every item already belongs to one open order (double-click safe).
  const orderIds = new Set(priced.map(({ g }) => g.order_id || ''));
  const reuse = orderIds.size === 1 && [...orderIds][0] && priced.every(({ g }) => g.status === 'Awaiting Payment');
  const orderId = reuse ? priced[0].g.order_id : i.newId();
  const orderNumber = reuse ? (priced[0].g.order_number || i.newOrderNumber()) : i.newOrderNumber();

  const C = (d: number) => Math.round(d * 100);
  const lineItems: { name: string; unitAmount: number; quantity: number }[] = [];
  let ship = 0, tax = 0, fee = 0, reserve = 0, expected = 0;
  for (const { g, q } of priced) {
    const d = q.detail!;
    lineItems.push({ name: g.original_product_name ? `${g.original_product_name}${d.quantity > 1 ? ` (×${d.quantity})` : ''}` : `Product (${d.quantity} × $${d.unitPrice.toFixed(2)})`,
      unitAmount: C(d.unitPrice), quantity: d.quantity });
    ship += C(d.estimatedShipping); tax += C(d.estimatedTax); fee += C(d.serviceFee); reserve += C(d.protectionReserve);
    expected += q.totalCents;
  }
  if (ship > 0) lineItems.push({ name: 'Shipping (passed through at cost)', unitAmount: ship, quantity: 1 });
  if (tax > 0) lineItems.push({ name: 'Estimated sales tax (estimate)', unitAmount: tax, quantity: 1 });
  if (fee > 0) lineItems.push({ name: 'Deferrd service fee', unitAmount: fee, quantity: 1 });
  if (reserve > 0) lineItems.push({ name: 'Purchase Protection Reserve (refundable)', unitAmount: reserve, quantity: 1 });

  // What Stripe will charge must equal what the engine says. If not, refuse.
  const charged = lineItems.reduce((t, l) => t + l.unitAmount * l.quantity, 0);
  if (charged !== expected) throw new CheckoutError('PRICING_MISMATCH', 500, 'Pricing check failed');

  const updates = priced.map(({ g, q }) => {
    const d = q.detail!;
    const delivery = g.requested_delivery_date ? new Date(g.requested_delivery_date) : null;
    const patch: Record<string, unknown> = {
      status: 'Awaiting Payment', order_id: orderId, order_number: orderNumber,
      product_cost: d.productCost, estimated_shipping: d.estimatedShipping, estimated_tax: d.estimatedTax,
      service_fee: d.serviceFee, protection_reserve: d.protectionReserve, total_due_today: q.total, payment_status: 'pending',
      last_observed_original_price: d.unitPrice,
    };
    if (delivery && !Number.isNaN(delivery.getTime())) {
      patch.target_purchase_date = day(new Date(delivery.getTime() - 7 * 86400000));
      patch.next_product_check_date = day(new Date(i.today.getTime() + 3 * 86400000));
      patch.final_purchase_deadline = day(new Date(delivery.getTime() - 2 * 86400000));
    }
    return { id: g.id as string, patch };
  });

  return {
    orderId, orderNumber, updates, lineItems, totalCents: expected, currency: i.settings.currency || 'usd',
    successUrl: `${base}/payment-success?order_id=${encodeURIComponent(orderId)}`,
    cancelUrl: `${base}/schedule?cart=1`,
    idempotencyKey: `checkout-${orderId}-${expected}`,
    metadata: { gift_request_ids: i.gifts.map((g) => g.id).join(','), order_id: orderId, order_number: orderNumber, customer_id: i.userId },
  };
}
