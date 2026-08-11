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

## The one blocker: production database access

**Supabase MCP access disconnected mid-session and did not reconnect before this work was finished.** Migration 8 is written and fully verified against local, disposable Postgres (10 integration tests, all passing) but has **not been applied to the real `Hurkl-production` database**, and the code that depends on it (the `/book/a1-best-moving` page, `POST /api/leads`) will not work in production until it is. This is a credential/access gap, not a code gap — see the founder action required below.

## Owner action required

1. ~~Apply the new migration to production.~~ **Done.** Migration 8 is live on `Hurkl-production` (confirmed via `list_migrations`/`list_tables` — `companies.website_slug`/`phone`/`email`/`slogan`, the seeded A-1 row, `leads`, `submit_lead()`, and `get_company_public_profile()` all present and RLS-enabled).
2. **A-1's real owner needs an account.** Still open. The company row exists, but no one is attached to it as `owner` yet — deliberately not automated. Have A-1's owner sign up at `/sign-up` with their real email, then tell me that email address so I can attach them to the seeded A-1 company. **In the meantime this does not block owner visibility**: Josh's own `hurkl_admin` account can already see every tenant's leads (including A-1's) on `/dashboard` today, because `leads_select_own_company`'s RLS policy explicitly allows `is_hurkl_admin()` through — confirmed by reading `app/api/leads/route.ts` (GET has no extra `company_id` filter beyond RLS) and `app/dashboard/page.tsx`/`leads-panel.tsx`.
3. **A-1's real pricing** (hourly rate, minimum hours, travel charge, any flat rates) — still needed before quoting can be anything but manual. Send it whenever convenient.

## Session update — 2026-08-11, later the same day: webhook secret was missing in production

Before this session, the webhook route shipped in commit `6621beb` (`app/api/leads/netlify-webhook/[secret]/route.ts`) had never actually been reachable: **`A1_NETLIFY_WEBHOOK_SECRET` was never set on `hurkl-platform`'s production Netlify environment**, and the route always 404s when it's unset (by design — "unset means the route always 404s, not unauthenticated"). Confirmed via the Netlify API (`manage-env-vars` listed every other secret — `TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, etc. — but not this one), and confirmed the currently-live deploy (`6a7af836...`) is built from commit `6621beb`, i.e. the code has been live and silently unreachable.

**Fixed this session:** generated a new random secret and set `A1_NETLIFY_WEBHOOK_SECRET` on the `hurkl-platform` Netlify site (production context, `functions`/`runtime`/`builds` scopes) via the Netlify API.

**Still open — needs the founder, cannot be done from this session:**

1. **Wire the actual outgoing webhook notification.** The Netlify MCP tools available in this session can read/manage env vars, forms, and project/deploy metadata, but expose no operation for a site's Forms notification settings, and this session's network policy blocks direct HTTP/CLI access to any `*.netlify.app` host (confirmed: `curl`, the official `@netlify/mcp` CLI relay, and `WebFetch` were all rejected by the egress proxy). So whether the A-1 site's `quote-estimate` form actually has an outgoing webhook pointed anywhere could not be confirmed or configured here. Founder action: in the `a-1bestmoving` Netlify project → **Project Configuration → Forms → Form notifications → Add notification → Outgoing webhook** → event "New form submission" → form `quote-estimate` → URL: `https://hurkl-platform.netlify.app/api/leads/netlify-webhook/<the secret>`.
   The real secret value is **not written here** (this repository is public — see `CLAUDE.md`'s "Protect secrets") — it was shared with the founder directly in chat and is visible in the `hurkl-platform` Netlify site's env vars (`A1_NETLIFY_WEBHOOK_SECRET`, production context) for anyone who needs to reconfigure this later.
2. **If a real submission still fails after that**, trigger a fresh deploy of `hurkl-platform` (Netlify dashboard → Deploys → **Trigger deploy → Deploy site**) so the running Function is guaranteed to have picked up the newly-set secret — this session could not trigger that redeploy itself (same network block as above; the Netlify `deploy-site` tool only hands back a local CLI command, and running it here was rejected with `403 Forbidden`).
3. One test lead already sits in production (`leads` row, name starting `[TEST LEAD — safe to delete]`, `source: manual_verification`, created 2026-08-11 12:18 UTC by an earlier verification pass that called `submit_lead()` directly — proving the DB-level path works end-to-end, including the `lead_received` audit-log entry). It was left in place rather than deleted: `leads` has no DELETE RLS policy anywhere, by deliberate append-only design, and CLAUDE.md requires asking before any destructive database operation. Founder call on whether/how to remove it.
4. **Scheduling/calendar reuse, checked this session:** confirmed by full-repo search that no scheduling/calendar/availability code exists anywhere in this codebase. This matches this doc's original "Deliberately NOT built tonight" reasoning (no real crew-capacity data exists) and was not built now either — "Schedule Your Move" still means "submit the same lead/quote-request form," which the owner turns into an actual booking manually.
5. **Visual cleanup of the live A-1 site was requested this session and not attempted.** This session cannot read the live site's actual HTML/CSS/JS: `a-1bestmoving.netlify.app` is blocked by this session's network egress policy for both `curl` and `WebFetch`, there is no Lovable or Base44 project for this site, and the Netlify MCP tools available here expose deploy/form/env metadata but not file contents (`has_source_zip: true` on the live deploy, but no tool here can retrieve it). Per explicit instruction, nothing was guessed or reconstructed from the earlier screenshot-based description — the founder needs to supply real source access (e.g. deploy zip, a git-linked copy, or Netlify CLI access from a machine that can reach netlify.app) before that work can happen safely.

## Cross-references

- `ARCHITECTURE.md` §4 — one-paragraph architectural summary of the public-intake pattern.
- `ROADMAP.md` Phase 7 — status note.
