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

## Update (2026-08-11, same day): connecting A-1's existing customer website

The founder's actual customer-facing site is not `/book/a1-best-moving` above — it's the pre-existing `a-1bestmoving.netlify.app` (black/gold branding, real phone number, already live, already getting traffic). That site is a separate, non-git-linked Netlify deployment ("drop deployment," `commit_ref: null`) — no repo backs it, so it cannot be read, edited, or redeployed from this codebase, and this session's network policy also blocks direct HTTP access to any `netlify.app`/`netlify.com`/`supabase.co` host (confirmed again this session, including from a locally-run production build — the block is not limited to CLI deploy hosts).

Rather than building a second site (explicitly ruled out) or attempting an unreachable direct edit, this connects the two at the one point Netlify itself exposes without touching `a-1bestmoving`'s files: its existing `quote-estimate` Netlify Form already collects every field a real estimate needs (name/phone/email/pickup `from`/destination `to`/`move_date`/`move_size`/`rooms`/`access`/`parking`/`notes`, zero submissions so far) and can be pointed at an outgoing webhook from the Netlify dashboard — a URL paste, not a code change.

- **`app/api/leads/netlify-webhook/[secret]/route.ts`** (PR #16, merged, deployed — confirmed via Netlify API: deploy `6a7af83684333a00080bc3e5`, `commit_ref 6621beb`, `state: ready`, `context: production`, secret scan clean) receives that webhook, maps its fields onto the same `submit_lead()` RPC, and never drops unparseable input (e.g. a free-text `move_date` rides along in `notes`). Auth is a secret URL path segment — `A1_NETLIFY_WEBHOOK_SECRET`, generated this session and set on `hurkl-platform`'s Netlify env vars (not committed).
- 7 new tests (field mapping, both documented Netlify payload shapes, honeypot short-circuit, non-2xx on a real failure, secret mismatch, rate limiting) plus the full 157-test suite, typecheck, lint, and a production build all pass.
- **What could not be verified this session:** an actual live HTTP call to the deployed endpoint, or a real click-through submission on `a-1bestmoving.netlify.app`. This session's container cannot reach `netlify.app` or `supabase.co` over the network at all (confirmed via direct curl to both, and via a locally-run production build whose own `/api/health` reported the database itself unreachable) — a hard environment restriction, not a code or config problem. What *was* verified directly against production this session (same day, migration-8 check above) is that `submit_lead()` itself works correctly when called for real; the new route's own logic is covered by the 7 tests above but was never exercised over a real network request.
- **The one remaining step is entirely on Netlify's side, in the dashboard, no code:** `a-1bestmoving` → Site settings → Forms → Form notifications → Add notification → Outgoing webhook → Form: `quote-estimate` → URL: the secret path above → Save. Once set, every real submission on the existing site reaches production without anything else changing.

## Owner action required

1. ~~Apply the new migration to production~~ — done.
2. ~~Verify `/book/a1-best-moving` end-to-end~~ — still open; same network restriction as above prevented it this session too.
3. **The one action that turns on lead capture from the real, already-live site:** in the Netlify dashboard, add an outgoing webhook notification to `a-1bestmoving`'s `quote-estimate` form, pointed at the URL given in chat. Takes under a minute, no code, no file moves.
4. **A-1's real owner needs an account.** The company row exists, but no one is attached to it as `owner` yet (deliberately not automated). Have A-1's owner sign up at `/sign-up` with their real email, then send that email address — attaching them to the seeded A-1 company is a one-time manual step on my end.
5. **A-1's real pricing** (hourly rate, minimum hours, travel charge, any flat rates) — needed before quoting can be anything but manual. Send whenever convenient.
6. **No payment processor is configured** (Stripe/Resend are mock-only) — accepting a paying job still ends in a manual invoice/payment conversation until that's wired up, a deliberate choice per the "never fake a provider" rule above.

## Cross-references

- `ARCHITECTURE.md` §4 — one-paragraph architectural summary of the public-intake pattern.
- `ROADMAP.md` Phase 7 — status note.
