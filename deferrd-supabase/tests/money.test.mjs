import test from 'node:test';
import assert from 'node:assert/strict';
import { planCheckout, CheckoutError } from '../functions/_shared/checkout-plan.ts';
import { decideGiftCheckout } from '../functions/_shared/webhook-decision.ts';

const S = { per_campaign_fee: 5, per_recipient_fee: 0.1, flat_service_fee: 0, percentage_service_fee: 5, min_service_fee: 2.99,
  max_service_fee: 49.99, greeting_card_service_fee_percent: 5, greeting_card_service_fee_min: 2.99, greeting_card_service_fee_max: 14.99,
  gift_card_service_fee: 0.5, protection_reserve_rate: 0.1, premium_feature_price: 0, currency: 'usd', tax_enabled: false, tax_rate: 0,
  promo_enabled: false, promo_code: '', promo_discount_percent: 0 };
const gift = (o = {}) => ({ id: 'g1', customer_id: 'u1', status: 'Draft', original_product_price: 40, original_product_quantity: 1,
  estimated_shipping: 6, estimated_tax: 3, original_product_name: 'Mug', requested_delivery_date: '2026-12-20', ...o });
const plan = (gifts, extra = {}) => planCheckout({ gifts, userId: 'u1', settings: S, siteUrl: 'https://deferrd.example',
  newId: () => 'order-1', newOrderNumber: () => 'ORD-AAAAAA', today: new Date('2026-11-01T00:00:00Z'), ...extra });
const fails = (fn, code) => assert.throws(fn, (e) => e instanceof CheckoutError && e.code === code, `expected ${code}`);

test('checkout: Stripe lines add up to exactly what the engine says', () => {
  const p = plan([gift(), gift({ id: 'g2', original_product_price: 19.99, original_product_quantity: 3 })]);
  const sum = p.lineItems.reduce((t, l) => t + l.unitAmount * l.quantity, 0);
  assert.equal(sum, p.totalCents);
  assert.equal(p.updates.length, 2);
  assert.equal(p.updates[0].patch.status, 'Awaiting Payment');
  assert.equal(p.updates[0].patch.target_purchase_date, '2026-12-13');
});

test('checkout: return links come from our config, not the browser', () => {
  const p = plan([gift()]);
  assert.ok(p.successUrl.startsWith('https://deferrd.example/payment-success'));
  fails(() => plan([gift()], { siteUrl: 'http://evil.example' }), 'CONFIG');
  fails(() => plan([gift()], { siteUrl: 'not a url' }), 'CONFIG');
});

test('checkout: refuses someone else\'s request, paid requests, bad prices, empty carts', () => {
  fails(() => plan([gift({ customer_id: 'u2' })]), 'FORBIDDEN');
  fails(() => plan([gift({ status: 'Paid — Monitoring Active' })]), 'NOT_PAYABLE');
  fails(() => plan([gift({ original_product_price: 0 })]), 'BAD_PRICE');
  fails(() => plan([gift({ original_product_price: -5 })]), 'BAD_PRICE');
  fails(() => plan([gift({ original_product_price: 100001 })]), 'BAD_PRICE');
  fails(() => plan([gift({ original_product_quantity: 1001 })]), 'BAD_QUANTITY');
  fails(() => plan([gift({ original_product_quantity: 2.5 })]), 'BAD_QUANTITY');
  fails(() => plan([gift({ original_product_price: 'abc' })]), 'BAD_PRICE');
  fails(() => plan([]), 'NO_ITEMS');
  fails(() => plan(Array.from({ length: 26 }, (_, i) => gift({ id: 'x' + i }))), 'TOO_MANY');
});

test('checkout: a free service fee stops checkout', () => {
  fails(() => planCheckout({ gifts: [gift()], userId: 'u1', siteUrl: 'https://d.example', newId: () => 'o', newOrderNumber: () => 'n', today: new Date(),
    settings: { ...S, greeting_card_service_fee_percent: 0, greeting_card_service_fee_min: 0 } }), 'CONFIG');
});

test('checkout: double-click reuses the same order and idempotency key', () => {
  const first = plan([gift()]);
  const again = planCheckout({ gifts: [gift({ status: 'Awaiting Payment', order_id: 'order-1', order_number: 'ORD-AAAAAA' })], userId: 'u1', settings: S,
    siteUrl: 'https://deferrd.example', newId: () => 'order-2', newOrderNumber: () => 'ORD-BBBBBB', today: new Date() });
  assert.equal(again.orderId, 'order-1');
  assert.equal(again.idempotencyKey, first.idempotencyKey);
});

// ---------- webhook decisions
function paidSession(p, extra = {}) {
  return { id: 'cs_1', payment_status: 'paid', amount_total: p.totalCents, currency: 'usd',
    metadata: { gift_request_ids: p.metadata.gift_request_ids, customer_id: 'u1' }, ...extra };
}
function awaiting(g, p) { const u = p.updates.find((x) => x.id === g.id).patch; return { ...g, ...u }; }

test('webhook: correct payment confirms the order and writes ledger rows', () => {
  const g = gift(); const p = plan([g]);
  const d = decideGiftCheckout({ session: paidSession(p), gifts: [awaiting(g, p)], settings: S });
  assert.equal(d.action, 'confirm');
  assert.equal(d.gifts[0].patch.status, 'Paid — Monitoring Active');
  assert.equal(d.ledger[0].total, p.totalCents / 100);
});

test('webhook: wrong amount is NOT confirmed — it is held for review with a critical alert', () => {
  const g = gift(); const p = plan([g]);
  for (const amount of [p.totalCents - 1, p.totalCents + 1, 1, 0, NaN]) {
    const d = decideGiftCheckout({ session: paidSession(p, { amount_total: amount }), gifts: [awaiting(g, p)], settings: S });
    assert.equal(d.action, 'review', `amount ${amount}`);
    assert.equal(d.reason, 'AMOUNT_MISMATCH');
    assert.equal(d.gifts[0].patch.payment_status, 'paid_needs_review');
    assert.equal(d.alert.severity, 'critical');
    assert.ok(!('status' in d.gifts[0].patch), 'order status must not advance');
  }
});

test('webhook: stored total tampered after checkout is caught', () => {
  const g = gift(); const p = plan([g]); const a = awaiting(g, p);
  const d = decideGiftCheckout({ session: paidSession(p), gifts: [{ ...a, total_due_today: 1 }], settings: S });
  assert.equal(d.action, 'review');
});

test('webhook: price changed after the session was made is caught', () => {
  const g = gift(); const p = plan([g]); const a = awaiting(g, p);
  const d = decideGiftCheckout({ session: paidSession(p), gifts: [{ ...a, original_product_price: 5 }], settings: S });
  assert.equal(d.action, 'review');
});

test('webhook: unpaid, replayed, wrong customer, wrong currency, missing gift, wrong state', () => {
  const g = gift(); const p = plan([g]); const a = awaiting(g, p);
  assert.equal(decideGiftCheckout({ session: paidSession(p, { payment_status: 'unpaid' }), gifts: [a], settings: S }).action, 'ignore');
  assert.equal(decideGiftCheckout({ session: paidSession(p), gifts: [{ ...a, payment_status: 'paid', stripe_payment_reference: 'cs_1' }], settings: S }).action, 'already_processed');
  assert.equal(decideGiftCheckout({ session: paidSession(p, { metadata: { gift_request_ids: 'g1', customer_id: 'evil' } }), gifts: [a], settings: S }).reason, 'CUSTOMER_MISMATCH');
  assert.equal(decideGiftCheckout({ session: paidSession(p, { currency: 'eur' }), gifts: [a], settings: S }).reason, 'CURRENCY_MISMATCH');
  assert.equal(decideGiftCheckout({ session: paidSession(p), gifts: [], settings: S }).reason, 'GIFT_NOT_FOUND');
  assert.equal(decideGiftCheckout({ session: paidSession(p, { metadata: { customer_id: 'u1' } }), gifts: [a], settings: S }).reason, 'NO_GIFT_IDS');
  assert.equal(decideGiftCheckout({ session: paidSession(p), gifts: [{ ...a, status: 'Canceled' }], settings: S }).reason, 'UNEXPECTED_STATUS');
});

test('webhook: multi-item order must match the sum of all items', () => {
  const gs = [gift(), gift({ id: 'g2', original_product_price: 55.5 })]; const p = plan(gs);
  const stored = gs.map((g) => awaiting(g, p));
  assert.equal(decideGiftCheckout({ session: paidSession(p), gifts: stored, settings: S }).action, 'confirm');
  assert.equal(decideGiftCheckout({ session: paidSession(p, { amount_total: p.totalCents - 100 }), gifts: stored, settings: S }).action, 'review');
});
