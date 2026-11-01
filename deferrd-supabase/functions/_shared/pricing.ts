// DEFERRD Revenue Engine (pricing) — pure functions, no database, no network.
// Port of the Base44 engine with these deliberate changes (see docs/deferrd/MONEY_REVIEW.md):
//  1. All math is in whole cents (no floating-point drift).
//  2. Negative or non-numeric inputs become 0; quantities/recipients are capped.
//  3. An unknown charge type is an ERROR (the old engine passed through a caller-supplied amount).
//  4. Campaign total now INCLUDES the gift card face value (the old total did not charge it).
// Output stays in dollars with the same shape the screens already use.

export type Settings = {
  per_campaign_fee: number; per_recipient_fee: number; flat_service_fee: number;
  percentage_service_fee: number; min_service_fee: number; max_service_fee: number;
  greeting_card_service_fee_percent: number; greeting_card_service_fee_min: number;
  greeting_card_service_fee_max: number; gift_card_service_fee: number;
  protection_reserve_rate: number; premium_feature_price: number; currency: string;
  tax_enabled: boolean; tax_rate: number; promo_enabled: boolean; promo_code: string;
  promo_discount_percent: number;
};

export const LIMITS = { maxQuantity: 1000, maxRecipients: 100000, maxUnitCents: 10_000_000 };

const cents = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};
const count = (v: unknown, min: number, max: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};
const pos = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
// percent of an amount in cents, rounded half-up, percent may have decimals
const pctOf = (amountCents: number, percent: number): number =>
  Math.floor((amountCents * Math.round(pos(percent) * 100) + 5000) / 10000);
const usd = (c: number): number => c / 100;
const money = (c: number): string => (c / 100).toFixed(2);

export type Line = { key: string; label: string; amount: number; revenue?: boolean };
export type Quote = {
  category: string; lines: Line[]; base: number; fees: number; taxes: number; discounts: number;
  total: number; totalCents: number; reserve: number; revenueAmount: number; passThrough: number;
  detail?: Record<string, number>; pricingConfig?: Record<string, number>;
};

function finish(s: Settings, p: any, lines: Line[], baseC: number, feesC: number, subtotalC: number,
  category: string, opts: { reserveC?: number; taxC?: number; passThroughC?: number } = {}): Quote {
  let discountC = 0;
  if (s.promo_enabled && p.promo_code && String(p.promo_code) === String(s.promo_code) && pos(s.promo_discount_percent) > 0) {
    discountC = Math.min(pctOf(baseC, s.promo_discount_percent), baseC);
    if (discountC > 0) lines.push({ key: 'discount', label: `Promo (${s.promo_code})`, amount: -usd(discountC) });
  }
  let taxC = opts.taxC ?? 0;
  if (category !== 'greeting_card' && s.tax_enabled && pos(s.tax_rate) > 0) {
    taxC = pctOf(Math.max(0, baseC + feesC - discountC), s.tax_rate);
    if (taxC > 0) lines.push({ key: 'tax', label: `Tax (${pos(s.tax_rate)}%)`, amount: usd(taxC) });
  }
  const totalC = Math.max(0, subtotalC - discountC + (category === 'greeting_card' ? 0 : taxC));
  const isRev = category === 'subscription' || category === 'premium_feature';
  return {
    category, lines, base: usd(baseC), fees: usd(feesC), taxes: usd(taxC), discounts: usd(discountC),
    total: usd(totalC), totalCents: totalC, reserve: usd(opts.reserveC ?? 0),
    revenueAmount: usd(feesC + (isRev ? baseC : 0) - discountC), passThrough: usd(opts.passThroughC ?? 0),
  };
}

export function quote(s: Settings, p: any): Quote {
  const type = p?.type;

  if (type === 'greeting_card') {
    const qty = count(p.quantity, 1, LIMITS.maxQuantity);
    const unitC = Math.min(cents(p.unit_price), LIMITS.maxUnitCents);
    const productC = unitC * qty;
    const shipC = cents(p.shipping);
    const taxC = cents(p.per_unit_tax) * qty;
    let feeC = pctOf(productC, s.greeting_card_service_fee_percent);
    const minC = cents(s.greeting_card_service_fee_min), maxC = cents(s.greeting_card_service_fee_max);
    if (minC > 0) feeC = Math.max(feeC, minC);
    if (maxC > 0) feeC = Math.min(feeC, maxC);
    const reserveC = pctOf(productC + shipC, pos(s.protection_reserve_rate) * 100);
    const lines: Line[] = [{ key: 'product', label: `Product (${qty} × $${money(unitC)})`, amount: usd(productC) }];
    if (shipC > 0) lines.push({ key: 'shipping', label: 'Shipping (passed through)', amount: usd(shipC) });
    if (taxC > 0) lines.push({ key: 'tax', label: 'Estimated sales tax', amount: usd(taxC) });
    if (feeC > 0) lines.push({ key: 'service_fee', label: `Service fee (${pos(s.greeting_card_service_fee_percent)}%)`, amount: usd(feeC), revenue: true });
    if (reserveC > 0) lines.push({ key: 'protection_reserve', label: 'Purchase protection reserve', amount: usd(reserveC) });
    const r = finish(s, p, lines, productC, feeC, productC + shipC + taxC + feeC + reserveC, 'greeting_card', { reserveC, taxC });
    r.detail = { unitPrice: usd(unitC), quantity: qty, productCost: usd(productC), estimatedShipping: usd(shipC),
      estimatedTax: usd(taxC), serviceFee: usd(feeC), protectionReserve: usd(reserveC) };
    r.pricingConfig = { service_fee_percent: pos(s.greeting_card_service_fee_percent), service_fee_min: usd(minC),
      service_fee_max: usd(maxC), protection_reserve_rate: pos(s.protection_reserve_rate) };
    return r;
  }

  if (type === 'digital_gift_card') {
    const n = count(p.recipients, 0, LIMITS.maxRecipients);
    const valueC = cents(p.gift_card_value);
    const cardsC = valueC * n;
    const feeC = cents(s.gift_card_service_fee) * n;
    const lines: Line[] = [{ key: 'base', label: `Gift cards (${n} × $${money(valueC)})`, amount: usd(cardsC) }];
    if (feeC > 0) lines.push({ key: 'service_fee', label: `Gift card service fee (${n} × $${money(cents(s.gift_card_service_fee))})`, amount: usd(feeC), revenue: true });
    return finish(s, p, lines, cardsC, feeC, cardsC + feeC, 'digital_gift_card', { passThroughC: cardsC });
  }

  if (type === 'campaign') {
    const n = count(p.recipients, 0, LIMITS.maxRecipients);
    const valueC = cents(p.gift_card_amount);
    const fundsC = valueC * n;                       // face value of the gift cards: collected, passed through
    const campaignFeeC = cents(s.per_campaign_fee);
    const recipientFeeC = cents(s.per_recipient_fee) * n;
    const flatC = cents(s.flat_service_fee);
    let pctFeeC = pctOf(fundsC, s.percentage_service_fee);
    const minC = cents(s.min_service_fee), maxC = cents(s.max_service_fee);
    if (minC > 0) pctFeeC = Math.max(pctFeeC, minC);
    if (maxC > 0) pctFeeC = Math.min(pctFeeC, maxC);
    const gcFeeC = cents(s.gift_card_service_fee) * n;
    const baseC = campaignFeeC + recipientFeeC + flatC;
    const lines: Line[] = [];
    if (fundsC > 0) lines.push({ key: 'gift_card_funds', label: `Gift cards (${n} × $${money(valueC)})`, amount: usd(fundsC) });
    if (flatC > 0) lines.push({ key: 'flat_fee', label: 'Flat service fee', amount: usd(flatC), revenue: true });
    if (campaignFeeC > 0) lines.push({ key: 'campaign_fee', label: 'Campaign fee', amount: usd(campaignFeeC), revenue: true });
    if (recipientFeeC > 0) lines.push({ key: 'recipient_fee', label: `Recipient fee (${n} × $${money(cents(s.per_recipient_fee))})`, amount: usd(recipientFeeC), revenue: true });
    if (pctFeeC > 0) lines.push({ key: 'service_fee', label: `Service fee (${pos(s.percentage_service_fee).toFixed(0)}%)`, amount: usd(pctFeeC), revenue: true });
    if (gcFeeC > 0) lines.push({ key: 'giftcard_fee', label: `Gift card fee (${n} × $${money(cents(s.gift_card_service_fee))})`, amount: usd(gcFeeC), revenue: true });
    const feesC = campaignFeeC + recipientFeeC + flatC + pctFeeC + gcFeeC;
    const r = finish(s, p, lines, baseC, feesC, baseC + pctFeeC + gcFeeC + fundsC, 'campaign', { passThroughC: fundsC });
    r.pricingConfig = { per_campaign_fee: pos(s.per_campaign_fee), per_recipient_fee: pos(s.per_recipient_fee),
      percentage_service_fee: pos(s.percentage_service_fee), min_service_fee: usd(minC), max_service_fee: usd(maxC),
      gift_card_service_fee: pos(s.gift_card_service_fee), flat_service_fee: pos(s.flat_service_fee) };
    return r;
  }

  if (type === 'premium_feature') {
    const qty = count(p.quantity, 1, LIMITS.maxQuantity);
    const c = cents(s.premium_feature_price) * qty;
    return finish(s, p, [{ key: 'base', label: `Premium feature${qty > 1 ? ` ×${qty}` : ''}`, amount: usd(c), revenue: true }], c, 0, c, 'premium_feature');
  }

  if (type === 'subscription') {
    const c = cents(p.plan_price);
    return finish(s, p, [{ key: 'base', label: `Subscription (${p.billing_cycle || 'monthly'})`, amount: usd(c), revenue: true }], c, 0, c, 'subscription');
  }

  throw new Error(`Unknown charge type: ${String(type)}`);
}
