# A-1 Best Moving — emergency revenue launch (2026-08-11)

Status of the first real production company on HURKL. This is an implementation record, not a design proposal — see `ARCHITECTURE.md` §4's status note for the one-paragraph architectural summary and cross-reference.

## What shipped tonight

**The smallest complete revenue loop that could be built and verified without fabricating anything:** a real customer can reach A-1's public page, submit a real lead with real move details, get it durably recorded against A-1's real company row, and the owner can see it on the dashboard. Nothing here is mocked or faked.

- `supabase/migrations/00000000000008_leads_and_company_profile.sql`:
  - `companies` gains `phone`, `email`, `slogan`, `website_slug` — previously nowhere for a tenant's own contact info to live as real, queryable data.
  - A-1 Best Moving LLC is seeded as a real company row (`website_slug = 'a1-best-moving'`, phone `971-777-6660`, email `A1BESTMOVING@gmail.com`, slogan "The best move you'll make.").
  - `leads` table: name/phone/email/pickup/destination/move date/preferred time/property type/access notes/inventory notes/special items/packing needs/notes/status, company-scoped RLS (staff select/update, no delete — same append-preferred convention as `customers`).
  - `submit_lead()` — the one thing an anonymous website visitor can do to a tenant's data. `SECURITY DEFINER`, resolves the company by public slug (never an internal id), validates required fields itself (never trusts the caller), writes the lead and a `lead_received` audit entry.
  - `get_company_public_profile()` — read-only, public-safe subset of a company's row for the public page to render.
- `app/book/[slug]/page.tsx` + `lead-form.tsx` — a real, mobile-first, unauthenticated marketing + lead-capture page. Works for any company with a `website_slug`, not hardcoded to A-1; A-1's is reachable at `/book/a1-best-moving` once deployed.
- `app/api/leads/route.ts` — `POST` (public, rate-limited 5/10min per IP, validates via `lib/leads/leads.ts`) and `GET` (authenticated, company-scoped, for the dashboard).
- `app/dashboard/leads-panel.tsx` — owner-visible list of incoming leads, same page as the existing customers panel.
- `lib/leads/leads.ts`, `lib/http/rate-limit.ts`, `lib/companies/a1-best-moving.ts` — supporting application code.
- Tests: `lib/leads/leads.test.ts` (validation + RPC wrapper unit tests), `app/api/leads/route.test.ts` (route behavior, rate limiting, error mapping), `lib/db/leads.integration.test.ts` (real RLS/security-definer proof against local Postgres — anon can submit a lead and read the public profile, anon and authenticated both fail to bypass `submit_lead()` with a direct INSERT, cross-tenant isolation holds, no DELETE policy exists).

## What was already working (not built tonight)

Real auth/RBAC/tenant isolation, `customers`/`audit_log`, the Telegram pipeline with real Anthropic reasoning + the hard spend-ceiling guard (billing still unfunded as of the last session), company onboarding (`create_company_and_assign_owner`), the billing-exemption/`account_type` system, invoice math (`lib/mason/skills/invoice.ts`, pure calculation, not yet wired to a DB table or UI).

## Deliberately NOT built tonight (and why)

- **Quoting/pricing** — A-1's actual hourly rate, minimum hours, travel/supply charges, and discount policy are not known to this system. Building an automatic quote engine would mean either fabricating numbers (explicitly forbidden) or shipping a quote flow that always says "ask the owner," which isn't a real quote flow. `calculateInvoice()` already exists and is ready to use the moment real pricing exists.
- **Booking/scheduling** — no calendar/availability data model exists yet, and one shouldn't be invented under time pressure without knowing A-1's actual crew capacity/hours.
- **Invoicing/payment** — `PaymentProvider`/`EmailProvider` are mock-only; no Stripe or Resend credentials are configured. Building a "real" payment flow without a real processor would mean either handling money unsafely or faking success — both forbidden.
- **AI chat on the public page** — Mason's real reasoning (Anthropic) is built and spend-guarded but, per the last session's status, the Anthropic account still has no funded credits, so no real AI reply has ever been sent. The public page therefore uses a structured form (real, working, no AI required) instead of a chat widget that would silently fall back to a "having trouble responding" message on every message. This is the "safe fallback" instruction 7 in the launch spec explicitly asked for: ship what's real, don't block on what isn't.
- **Outbound business-development tooling** (property managers, referral partners, etc.) — no channel/credential exists for any of this yet; building it now would mean guessing at contact mechanisms instead of a real integration.

## Known limitation: rate limiting

`lib/http/rate-limit.ts` is an in-memory, single-process limiter — real protection against casual abuse, but a Netlify Function can run multiple warm instances, each with its own counter, so the effective ceiling under real traffic is looser than "5 per 10 minutes." Fine for launch; revisit with a shared store if abuse becomes real.

## Update (2026-08-11, follow-up session): migration applied, code merged and deployed

The blocker above is resolved. In a follow-up session with working Supabase MCP access:

- **Migration 8 applied to `Hurkl-production`** (`atwaixmsvzehheotdymf`). Verified before applying that all referenced objects already existed (`companies.account_type`, `current_company_id()`, `is_hurkl_admin()`, `audit_log` schema). Verified after applying: the new `companies` columns, the seeded A-1 row (`website_slug = 'a1-best-moving'`), `get_company_public_profile('a1-best-moving')` returns the correct row, and `submit_lead()` was called directly against production (real insert into `leads` + a `lead_received` audit_log row), then the verification row was deleted.
- **PR #14 merged to `main`** (fast-forward, no conflicts).
- **Deployed to production** via Netlify (site `hurkl-platform`, `atwaixmsvzehheotdymf`'s git-linked auto-deploy triggered by the push to `main`). Confirmed via the Netlify API: deploy `6a7aea55bbaf1000085f72a3`, `commit_ref` = `393cb5ec4159a68589fa9563f36b1d8f1a20f107` (the merge commit), `state: ready`, `context: production`, secret scan clean, `/book/a1-best-moving`'s Next.js server handler and edge function both deployed.

**What could not be verified this session: the live page itself.** The session's container has an org-level network egress policy that blocks all `netlify.app` and `netlify.com` hosts outright (confirmed via the proxy's own status endpoint — not a token or credential issue, a destination-not-allowed policy denial, so it was not retried further per this environment's operating rules). This means `/book/a1-best-moving` was never actually loaded in a browser, no request went through the real `POST /api/leads` route, and the dashboard's leads panel was never viewed rendering a real submission. The `submit_lead()` proof above exercises the same RPC the live form calls, but it bypasses the Next.js route, the rate limiter, and the page itself — so it is DB-level evidence, not a substitute for the real end-to-end check.

## Owner action required

1. ~~Apply the new migration to production~~ — done, see above.
2. **Do the one remaining check yourself (or in a session without this network restriction):** open `https://hurkl-platform.netlify.app/book/a1-best-moving`, submit a real test lead, and confirm it shows up in the dashboard's leads panel. This is the only step standing between "verified in the database" and "verified as a real customer would experience it."
3. **A-1's real owner needs an account.** The company row exists, but no one is attached to it as `owner` yet (this was deliberately not automated — creating a real login is not something to do without knowing who's actually running A-1's day-to-day). Have A-1's owner sign up at `/sign-up` with their real email, then send that email address — attaching them to the seeded A-1 company (rather than the normal "create a brand-new company" onboarding flow, which doesn't apply here since A-1 already exists) is a one-time manual step.
4. **A-1's real pricing** (hourly rate, minimum hours, travel charge, any flat rates) — needed before quoting can be anything but manual. Send it whenever convenient; no rush.

## Cross-references

- `ARCHITECTURE.md` §4 — one-paragraph architectural summary of the public-intake pattern.
- `ROADMAP.md` Phase 7 — status note.
