# DEFERRD money review and port (Nov 1, 2026)

Scope: the pricing engine, the greeting-card checkout, and the Stripe payment handling of the old Base44
app, read line by line and rebuilt on the new stack (`deferrd-supabase/functions/_shared/`).
Status: **logic written and tested; not deployed.** The glue that talks to Stripe and the database
(edge functions) is the next step and has not been written.

## Findings in the old code (ranked)

1. **Corporate campaigns never charged for the gift cards themselves (revenue leak, high).** The campaign
   quote included fees only. A $25 gift card to 100 people charged about $115, while the fulfillment
   function would later order $2,500 of gift cards from Tremendous. Dormant today (zero campaigns,
   Tremendous not configured) but it would have fired on the first real campaign.
   *Fixed in the new engine:* the face value is a separate pass-through line and is included in the
   total. Test: old $114.99 becomes $2,614.99 for that example.
2. **Stripe payment amount was never checked** against what the server calculated. *Fixed:* the amount,
   currency, the engine's number and the total stored at checkout must all agree, or the payment is
   held as "needs review" with a critical alert. Money received is never marked as a confirmed order.
3. **Customers could change price and quantity after checkout started** (they could edit requests in
   "Awaiting Payment"). *Fixed in the database:* a request is locked once checkout starts.
4. **Return links were taken from the browser** (`app_url`), allowing a redirect to any website.
   *Fixed:* links are built from our own configured site address only.
5. **Duplicate-event protection was check-then-write** (two simultaneous retries could both pass).
   *Fixed:* events are claimed in the database; a crashed worker's event can be taken over after
   5 minutes, a failed one retried, a finished one never repeated.
6. **The pricing function accepted any "unknown" charge type with a caller-supplied amount.** *Fixed:*
   unknown types are an error.
7. **Order numbers and confirmation numbers used the browser/random generator.** *Fixed:* made on
   the server (confirmation numbers by a database sequence).
8. **Double-click created two Stripe sessions and two orders.** *Fixed:* the same open order is reused,
   with an idempotency key.
9. **Silent trimming:** prices above the cap would have been quietly reduced. *Fixed:* out-of-range
   prices and quantities are rejected.
10. **Float math** could drift by a cent. *Fixed:* everything is whole cents; half-cent ties round up.
    The old engine rounded ties unpredictably; about 8% of random test orders land on an exact tie,
    and those can differ from the old app by one to three cents. All other orders match to the cent.
11. **Reports read only the latest 1,000 transactions**, so totals go wrong after 1,000. To fix with a
    database summary when reports are rebuilt.

## Founder decisions (Nov 1, 2026)

- **Customers pay for the gift cards up front.** Confirmed. DEFERRD never fronts gift card money.
- **Shipping and tax are worked out by the system from the customer's information (delivery address), not typed by the customer.** Needs a tax/shipping source: Stripe Tax is the planned tax source once DEFERRD has its own Stripe account; shipping needs a server-side estimate rule (to design). Until built, the checkout must not trust customer-typed shipping or tax.
- **No public promo codes.** Codes only for the founder personally and for family members the founder chooses. To build as admin-created, limited-use codes (use limit, optional expiry, note on who it is for), not one shared code in settings.
- **DEFERRD gets its own Stripe account.** The old Base44 app was using the A-1 Best Moving Stripe account; DEFERRD money must not flow through A-1's account. Account to be created by the founder (test mode first).

## Still open

- **Pricing numbers** ($5 campaign, $0.10 per recipient, 5% and $2.99 to $14.99 consumer fee, $0.50 per gift card) are the old placeholders, not confirmed.
- **Campaign service-fee minimum applies even with no gift cards** (a $2.99 minimum on a 0% base), as in the old app. Keep or remove?
- **AI stock checks** (order monitoring) should be shown to staff as estimates only, with call limits.
- Which legal entity owns the DEFERRD Stripe account (needed for Stripe business verification before going live; not needed for test mode).

## What is tested

- 9 pricing tests: 5,000 random greeting-card orders and 5,000 random campaigns compared with a verbatim
  copy of the old engine; hostile inputs; lines add up to the total exactly.
- 11 checkout and payment tests: tampered amounts, wrong customer, wrong currency, replays, double-click,
  bad prices, tampered stored totals.
- 58 database tests (in-memory Postgres) covering who can see or change what, the checkout lock and the
  Stripe event claims. Event claims were also verified on the real free-plan project.

## Not done yet

Edge-function glue (Stripe session creation, webhook endpoint, ledger writes), logins, the gift request
screens, subscription and campaign payment flows, refunds. No Stripe account has been connected.
