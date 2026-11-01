import test from 'node:test';
import assert from 'node:assert/strict';
import { quote } from '../functions/_shared/pricing.ts';
import { oldQuote } from './old_quote.reference.mjs';

const S = { per_campaign_fee: 5, per_recipient_fee: 0.1, flat_service_fee: 0, percentage_service_fee: 5,
  min_service_fee: 2.99, max_service_fee: 49.99, greeting_card_service_fee_percent: 5,
  greeting_card_service_fee_min: 2.99, greeting_card_service_fee_max: 14.99, gift_card_service_fee: 0.5,
  protection_reserve_rate: 0.1, premium_feature_price: 0, currency: 'usd', tax_enabled: false, tax_rate: 0,
  promo_enabled: false, promo_code: '', promo_discount_percent: 0 };

// small seeded random so failures are repeatable
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const cents = (max) => Math.floor(rnd() * max) / 100;           // whole-cent dollars
const pick = (a) => a[Math.floor(rnd() * a.length)];
const near = (a, b) => Math.abs(a - b) <= 0.0101;
const C = (d) => Math.round(d * 100);
// A "tie" is a percentage that lands exactly on half a cent. The old engine's float math rounded
// those unpredictably (sometimes down); the new engine always rounds half up. Everything else must match exactly.
const isTie = (amountC, pct) => (amountC * Math.round(pct * 100)) % 10000 === 5000;

test('greeting cards match the old engine on 5,000 random orders (exact unless a half-cent tie)', () => {
  let exact = 0, tied = 0;
  for (let i = 0; i < 5000; i++) {
    const s = { ...S, greeting_card_service_fee_percent: pick([0, 3, 5, 5.5, 8]), protection_reserve_rate: pick([0, 0.05, 0.1]) };
    const p = { type: 'greeting_card', unit_price: cents(50000) + 0.01, quantity: 1 + Math.floor(rnd() * 5),
      shipping: pick([0, cents(3000)]), per_unit_tax: pick([0, cents(500)]) };
    const o = oldQuote(s, p), n = quote(s, p);
    const productC = C(p.unit_price) * p.quantity;
    const tie = isTie(productC, s.greeting_card_service_fee_percent) || isTie(productC + C(p.shipping), s.protection_reserve_rate * 100);
    const tol = tie ? 0.0201 : 0.00001;
    for (const k of ['total', 'fees', 'base', 'reserve', 'revenueAmount']) assert.ok(Math.abs(o[k] - n[k]) <= tol, `${k}: old ${o[k]} new ${n[k]} tie=${tie} ${JSON.stringify(p)}`);
    tie ? tied++ : exact++;
  }
  console.log(`  greeting card: ${exact} orders matched to the cent, ${tied} had a half-cent tie`);
});

test('campaigns equal old total PLUS the gift card face value (exact unless a half-cent tie)', () => {
  let exact = 0, tied = 0;
  for (let i = 0; i < 5000; i++) {
    const s = { ...S, tax_enabled: pick([false, true]), tax_rate: pick([0, 6.5, 8.25]),
      promo_enabled: true, promo_code: 'SAVE', promo_discount_percent: pick([0, 10, 15]) };
    const p = { type: 'campaign', recipients: Math.floor(rnd() * 400), gift_card_amount: pick([0, 10, 25, 50, 100]), promo_code: pick(['', 'SAVE']) };
    const o = oldQuote(s, p), n = quote(s, p);
    const funds = p.recipients * p.gift_card_amount;
    const baseC = C(n.base), feesC = C(n.fees), discC = C(n.discounts);
    const tie = isTie(C(funds), 5)
      || (p.promo_code === 'SAVE' && s.promo_discount_percent > 0 && isTie(baseC, s.promo_discount_percent))
      || (s.tax_enabled && s.tax_rate > 0 && isTie(baseC + feesC - discC, s.tax_rate));
    const tol = tie ? 0.0301 : 0.00001;
    assert.ok(Math.abs(n.total - (o.total + funds)) <= tol, `total old ${o.total} + ${funds} vs new ${n.total} tie=${tie} ${JSON.stringify(p)}`);
    assert.ok(Math.abs(n.fees - o.fees) <= tol, `fees old ${o.fees} new ${n.fees}`);
    assert.ok(Math.abs(n.passThrough - funds) < 0.00001);
    tie ? tied++ : exact++;
  }
  console.log(`  campaign: ${exact} matched to the cent, ${tied} had a half-cent tie`);
});

test('half-cent ties round up, always', () => {
  // $183.10 x 5% = $9.155 -> $9.16 (the old float math gave $9.15)
  const q = quote(S, { type: 'greeting_card', unit_price: 36.62, quantity: 5 });
  assert.equal(q.detail.serviceFee, 9.16);
});

test('digital gift cards, subscriptions, premium match the old engine', () => {
  for (let i = 0; i < 2000; i++) {
    const s = { ...S, premium_feature_price: pick([0, 4.99, 9.99]) };
    for (const p of [{ type: 'digital_gift_card', recipients: Math.floor(rnd() * 300), gift_card_value: pick([10, 25, 100]) },
      { type: 'subscription', plan_price: pick([49, 470, 19.99]), billing_cycle: 'monthly' },
      { type: 'premium_feature', quantity: 1 + Math.floor(rnd() * 4) }]) {
      const o = oldQuote(s, p), n = quote(s, p);
      assert.ok(near(o.total, n.total) && near(o.fees, n.fees), JSON.stringify(p));
    }
  }
});

test('the old leak is closed: a $25 x 100 campaign charges the $2,500 of gift cards', () => {
  const p = { type: 'campaign', recipients: 100, gift_card_amount: 25 };
  const o = oldQuote(S, p), n = quote(S, p);
  console.log(`  old total $${o.total} -> new total $${n.total}`);
  assert.equal(n.total - o.total, 2500);
  assert.equal(n.passThrough, 2500);
  assert.equal(n.fees, o.fees);
});

test('an unknown charge type is refused, not passed through', () => {
  assert.throws(() => quote(S, { type: 'mystery', amount: 0.01 }), /Unknown charge type/);
  assert.throws(() => quote(S, {}), /Unknown charge type/);
});

test('hostile inputs cannot make a price negative or free', () => {
  for (const bad of [-100, 'abc', NaN, Infinity, null, undefined, -0.01]) {
    const q = quote(S, { type: 'greeting_card', unit_price: bad, quantity: bad, shipping: bad, per_unit_tax: bad });
    assert.ok(q.total >= 0 && Number.isFinite(q.total));
    const c = quote(S, { type: 'campaign', recipients: bad, gift_card_amount: bad });
    assert.ok(c.total >= 0 && Number.isFinite(c.total));
  }
  const big = quote(S, { type: 'campaign', recipients: 1e12, gift_card_amount: 1e9 });
  assert.ok(Number.isFinite(big.total));
  const neg = quote(S, { type: 'greeting_card', unit_price: 100, quantity: 1, shipping: -50, per_unit_tax: -50 });
  assert.equal(neg.detail.estimatedShipping, 0);
  assert.equal(neg.detail.estimatedTax, 0);
});

test('cents add up exactly: line amounts sum to the total', () => {
  for (let i = 0; i < 3000; i++) {
    const p = i % 2 ? { type: 'greeting_card', unit_price: cents(90000) + 0.01, quantity: 1 + (i % 4), shipping: cents(2000), per_unit_tax: cents(300) }
      : { type: 'campaign', recipients: i % 300, gift_card_amount: pick([10, 25, 33.33]) };
    const q = quote({ ...S, tax_enabled: true, tax_rate: 7.25 }, p);
    const sum = Math.round(q.lines.reduce((t, l) => t + l.amount * 100, 0));
    assert.equal(sum, q.totalCents - 0, `${JSON.stringify(p)}: lines ${sum} vs total ${q.totalCents}`);
  }
});

test('a free service fee cannot slip through on a normal card', () => {
  const q = quote(S, { type: 'greeting_card', unit_price: 40, quantity: 1 });
  assert.ok(q.detail.serviceFee >= 2.99);
});
