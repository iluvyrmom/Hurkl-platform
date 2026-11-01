// VERBATIM copy of the Base44 quote() (types removed) — used only to prove the new engine matches it.
const round = (v) => Math.round((Number(v) || 0) * 100) / 100;
const num = (v) => Number(v) || 0;
export function oldQuote(settings, params) {
  const type = params.type; const lines = []; let base = 0, fees = 0;
  if (type === 'greeting_card') {
    const qty = Math.max(1, Math.floor(num(params.quantity))); const unit = num(params.unit_price);
    const product = round(unit * qty); const shipping = round(num(params.shipping));
    const productTax = round(num(params.per_unit_tax) * qty);
    const pct = num(settings.greeting_card_service_fee_percent);
    let serviceFee = round(product * (pct / 100));
    const minFee = num(settings.greeting_card_service_fee_min); const maxFee = num(settings.greeting_card_service_fee_max);
    if (minFee > 0) serviceFee = Math.max(serviceFee, round(minFee));
    if (maxFee > 0) serviceFee = Math.min(serviceFee, round(maxFee));
    const reserve = round((product + shipping) * num(settings.protection_reserve_rate));
    base = product;
    lines.push({ key: 'product', amount: product });
    if (shipping > 0) lines.push({ key: 'shipping', amount: shipping });
    if (productTax > 0) lines.push({ key: 'tax', amount: productTax });
    if (serviceFee > 0) lines.push({ key: 'service_fee', amount: serviceFee });
    if (reserve > 0) lines.push({ key: 'protection_reserve', amount: reserve });
    fees = serviceFee;
    const subtotal = round(product + shipping + productTax + serviceFee + reserve);
    const result = finalize(settings, params, lines, base, fees, subtotal, 'greeting_card', reserve, productTax);
    result.detail = { unitPrice: unit, quantity: qty, productCost: product, estimatedShipping: shipping, estimatedTax: productTax, serviceFee, protectionReserve: reserve };
    return result;
  }
  if (type === 'digital_gift_card') {
    const recipients = Math.max(0, Math.floor(num(params.recipients))); const gcValue = num(params.gift_card_value);
    const cardTotal = round(gcValue * recipients); const serviceFee = round(num(settings.gift_card_service_fee) * recipients);
    base = cardTotal; lines.push({ key: 'base', amount: cardTotal });
    if (serviceFee > 0) lines.push({ key: 'service_fee', amount: serviceFee });
    fees = serviceFee; return finalize(settings, params, lines, base, fees, round(cardTotal + serviceFee), 'digital_gift_card');
  }
  if (type === 'campaign') {
    const recipients = Math.max(0, Math.floor(num(params.recipients))); const gcValue = num(params.gift_card_amount);
    const totalGiftValue = round(gcValue * recipients); const campaignFee = round(num(settings.per_campaign_fee));
    const recipientFee = round(num(settings.per_recipient_fee) * recipients); const flatFee = round(num(settings.flat_service_fee));
    let pctFee = round(totalGiftValue * (num(settings.percentage_service_fee) / 100));
    if (num(settings.min_service_fee) > 0) pctFee = Math.max(pctFee, round(num(settings.min_service_fee)));
    if (num(settings.max_service_fee) > 0) pctFee = Math.min(pctFee, round(num(settings.max_service_fee)));
    const gcFee = round(num(settings.gift_card_service_fee) * recipients);
    base = round(campaignFee + recipientFee + flatFee);
    fees = round(flatFee + campaignFee + recipientFee + pctFee + gcFee);
    const subtotal = round(base + pctFee + gcFee);
    return finalize(settings, params, lines, base, fees, subtotal, 'campaign');
  }
  if (type === 'premium_feature') {
    const qty = Math.max(1, Math.floor(num(params.quantity))); const p = round(num(settings.premium_feature_price) * qty);
    return finalize(settings, params, lines, p, 0, p, 'premium_feature');
  }
  if (type === 'subscription') { const p = round(num(params.plan_price)); return finalize(settings, params, lines, p, 0, p, 'subscription'); }
  base = round(num(params.amount)); return finalize(settings, params, lines, base, 0, base, type);
}
function finalize(settings, params, lines, base, fees, subtotal, category, reserve = 0, taxesIn = 0) {
  let discount = 0;
  if (settings.promo_enabled && params.promo_code && String(params.promo_code) === String(settings.promo_code) && num(settings.promo_discount_percent) > 0) {
    discount = round(base * (num(settings.promo_discount_percent) / 100));
  }
  let taxes = taxesIn;
  if (category !== 'greeting_card' && settings.tax_enabled && num(settings.tax_rate) > 0) taxes = round((base + fees - discount) * (num(settings.tax_rate) / 100));
  const total = round(subtotal - discount + (category === 'greeting_card' ? 0 : taxes));
  const revenueAmount = round(fees + (category === 'subscription' || category === 'premium_feature' ? base : 0) - discount);
  return { category, lines, base, fees, taxes, discounts: discount, total, reserve, revenueAmount };
}
