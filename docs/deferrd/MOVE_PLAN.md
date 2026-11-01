# DEFERRD: Move Off Base44 (Plan)

Status: **plan approved by founder Nov 1, 2026. Step 2 database design written and tested on a throwaway in-memory database (`deferrd-supabase/`). Nothing has been applied to any real project, and no data has been moved.** Founder decision (Nov 1, 2026): DEFERRD should eventually leave Base44. This document is based on reading the app's actual code (read-only) on Nov 1, 2026. Items marked **Not checked** have not been read yet.

## Goal

Run DEFERRD on the stack HURKL already uses (Supabase for data, logins and server functions; Netlify for the web pages), keep what works, and fix known weak spots on the way. The old app keeps running until the new one is proven. Nothing is switched off early.

## What exists today (verified)

| Piece | Count / notes |
|---|---|
| Web pages (React + Vite) | About 30 pages: public, customer, admin, corporate, and the new `/card/:token` |
| Data tables | 22 (gift requests, payments, campaigns, recipients, contacts, plans, ledger, alerts, and more) |
| Server functions | 15, plus 2 shared modules |
| Scheduled jobs | 3 (trial expiry, order monitoring, campaign fulfillment every 15 minutes) |
| Payments | Stripe checkout, subscriptions, campaign payments, signed webhook |
| Gift cards | Tremendous (currently pointed at its **sandbox**; inactive until two secrets are set) |
| Email | Base44's built-in email (admin-triggered, plain text) |
| Logins | Base44 sign-in (email and Google) |

Current data: zero campaigns. Live gift-request count **not checked**.

## What is good and must be kept

- **One Revenue Engine.** All prices come from one shared module. `corporate-pricing` only wraps it, and `corporate-revenue` is admin settings and plan editing plus reporting. (An earlier guess that three functions overlap was wrong: they are not duplicates.)
- Stripe webhook verifies the signature.
- Tremendous orders use a per-recipient idempotency key; fulfillment is capped per run and raises an ops alert instead of faking success.
- Server-side admin checks on admin functions.

## Weak spots found (fix while moving)

1. **Webhook never compares the amount Stripe collected to the amount the server calculated.** It recomputes the price and records that, but does not check `session.amount_total` against it. Add the check; on mismatch, hold the order and alert.
2. **Webhook duplicate protection is check-then-write, not atomic.** Two retries arriving together could both pass. Replace with a table of processed Stripe event IDs with a unique constraint.
3. **Webhook marks a gift paid on `checkout.session.completed` without checking `payment_status`.** Require `paid`.
4. **Confirmation numbers are made in the browser** with a random generator. Move to the server, with a uniqueness guarantee.
5. **Order monitoring asks an AI model to read retailer pages and decide stock and price**, then changes order status from the answer. That can be wrong and costs money every run. Keep it as an *estimate shown to staff*, never a fact; a human confirms before any status that implies a real retailer fact. Add per-run and per-day call caps and cost logging.
6. **Access rules:** most tables are admin-only. Rebuild with explicit per-customer and per-company rules, tenant isolation, and tests.
7. **Gift card fulfillment says "sent" when the provider accepted the order.** Keep statuses separate: payment confirmed, gift card ordered, gift card delivered. Do not show "ordered" until the provider confirms.
8. **Old placeholder cards** (9 seed records, no images) are removed; the animated cards become the first real card types.
9. Emails are plain text and admin-triggered only. New email goes through one provider with unsubscribe handling and a CAN-SPAM check **before** any automated sending.

## Target design

- **Web pages:** Netlify. Same React code, with the Base44 client swapped for a thin data layer so the pages barely change.
- **Database and logins:** Supabase Postgres with row-level security, Supabase Auth (email and Google).
- **Server functions:** Supabase Edge Functions. One per existing function, same names, rewritten one at a time.
- **Scheduled jobs:** Supabase scheduled functions, with run logging.
- **Payments:** same Stripe account; webhook endpoint pointed at the new function only at cutover.
- **Email:** one transactional provider, chosen later. Not activated without founder approval (paid service).
- **Holiday cards:** self-contained pages with recorded audio files, loaded by secret recipient token through a function that returns only first name, company name, card style and gift amount.
- **Cost rule:** use free tiers first. No paid plan is turned on without founder approval.

## Order of work (each step is its own branch and review)

1. This plan (done when approved).
2. Export the table definitions and any real data from Base44. Build the same tables in a **new, private** Supabase project. Add row-level security and tests for who can see what. No real data yet.
3. Data layer plus logins. Web pages running on Netlify against the test database.
4. Rewrite server functions, money first: Revenue Engine, checkout, webhook (with the fixes above), refunds. Tests for each, including duplicate webhook delivery and amount mismatch.
5. Campaigns, contacts, card page, gift card fulfillment (sandbox only), scheduled jobs.
6. Full fake-campaign run end to end with Stripe test mode and Tremendous sandbox. No real emails, no real money.
7. Founder reviews on phone. Then: copy real data, switch the Stripe webhook, switch the domain, keep Base44 as read-only fallback for a set period, then retire it.

## Open questions for the founder

- Which email provider, and the sending domain.
- Final pricing for card campaigns (RevenueSettings values are unconfirmed).
- Is the Tremendous account approved for production yet?
- Sleigh-bell audio: founder says it was free and nothing else is needed (settled; license text not checked).
- Any live customer gift requests that must carry over?

## Not checked yet

The remaining functions (campaign, contact, org, subscription, checkout, refund, product search and parse, retailer comparison, customer actions), the shared campaign-payment module, the frontend data calls, and the other two scheduled jobs.

## Related

- `docs/deferrd/HOLIDAY_CARDS.md` (card rules and the decision to leave Base44).
