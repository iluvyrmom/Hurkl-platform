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

1. **Apply the new migration to production.** This needs either Supabase access being restored in a future session, or the founder running `supabase/migrations/00000000000008_leads_and_company_profile.sql` directly (e.g. via the Supabase dashboard's SQL editor) — copy-paste the file's contents and run it once. Phone-friendly version: reply "apply the migration" once you're back at a Supabase-accessible session and it'll happen automatically; if you want it done from your phone in the meantime, paste that one file into the Supabase dashboard's SQL editor and hit Run.
2. **A-1's real owner needs an account.** The company row exists, but no one is attached to it as `owner` yet (this was deliberately not automated — creating a real login is not something to do without knowing who's actually running A-1's day-to-day). Once the migration above is live: have A-1's owner sign up at `/sign-up` with their real email, then tell me that email address — attaching them to the seeded A-1 company (rather than the normal "create a brand-new company" onboarding flow, which doesn't apply here since A-1 already exists) is a one-time manual step on my end once I have production access again.
3. **A-1's real pricing** (hourly rate, minimum hours, travel charge, any flat rates) — needed before quoting can be anything but manual. Send it whenever convenient; no rush tonight.

## 2026-08-13 update: A-1's existing site source, and a branded `/book/a1-best-moving`

The founder provided the actual source of A-1's existing customer-facing site (`a-1bestmoving.netlify.app`) — the "separate, non-git-linked deployment with no repo this codebase can reach" note above is now out of date for the *source*, though that site is still a distinct, separately-deployed Netlify project this repo doesn't build or redeploy.

What changed here as a result:
- `supabase/migrations/00000000000009_company_branding.sql` adds optional `logo_url`/`hero_eyebrow`/`hero_headline` columns to `companies` (additive, generic — any company can set these, not just A-1) and seeds A-1's with its real logo path and hero copy, matching the existing site's look.
- `public/companies/a1-best-moving/logo.png` and `public/mason/avatar.jpg` — A-1's real logo and Mason's portrait, sourced from that site's assets. Mason's portrait is treated as one consistent, shared HURKL brand asset across all companies' pages, not per-tenant.
- `app/book/[slug]/page.tsx` + `app/globals.css` — the public booking page now uses a navy/gold hero layout (masthead logo, eyebrow/headline, Mason portrait, trust badges) matching A-1's existing site's design language, while staying slug-generic: a company with no logo/hero copy set still renders the same layout with plain-text fallbacks.
- ~~The "Talk to Mason" and "Schedule Your Move" buttons on this page are anchors to the real lead form below (`#estimate`), not a live AI chat~~ — **superseded a few hours later the same day; see the update immediately below.** At the time this was written, this platform's public page had no AI chat wired, unlike A-1's *existing* site, whose `mason-chat.js`/`mason-speak.js` Netlify functions call Anthropic directly with their own embedded prompt and pricing. That standalone implementation is still outside this platform's `AIModelProvider` and still unresolved as a duplicate-systems question (retire it in favor of one integration point, or leave the two coexisting deliberately) — not touched by the work below, which built this platform's *own* chat rather than removing A-1's existing one.
- That existing site's `mason-chat.js` prompt also contains A-1's real, working rate card (not previously known to this system): $50/hr 1 mover, $100/hr 2 movers, $130/hr 3 movers, flat 8-hour-day options, and a discount schedule (25th–5th of the month is a no-discount premium window; Fri–Sun outside that window saves $50; Mon–Thu saves $75). This is now seeded as `companies.known_facts` (see below) and stated directly by Mason in the real chat.

## 2026-08-13 (continued): Mason's public chat replaces the structured form

Same day, the founder asked for more than a lookalike page: a real Mason conversation that gathers what the structured form used to ask for, gives real prices, and moves toward booking — "not just giving out my phone number." Also confirmed (no code change needed, already true): Mason's intelligence stays in this codebase and HAL's future specialist hierarchy; the A-1-facing page shows only A-1's branding, never HURKL's — `lib/mason/system-prompt.ts` already enforced this for every non-internal channel before today.

**Shipped:**
- `supabase/migrations/00000000000010_web_public_chat.sql` — a new `web_public` channel value on `conversations.channel`, a `conversations.lead_id` column (prevents double-submitting a lead if a conversation continues after one's already been sent), and `companies.known_facts text[]` (verified, owner-published facts Mason may state as fact — seeded with A-1's real rate card and policies above).
- `lib/communications/adapter.ts` / `inbound.ts` — the `web_public` channel: an anonymous sender (no `telegram_links`-style identity), a company resolved directly by public slug rather than a linked profile, and a hard 40-message per-conversation cap independent of the existing HURKL-wide/per-company Anthropic spend guard (both apply; this just bounds one unauthenticated visitor's worst case). Reuses the exact same `receiveMessage()` pipeline, `buildMasonSystemPrompt()`, `AIModelProvider`, and spend guard Telegram already uses — no second AI-calling code path.
- `lib/mason/system-prompt.ts` — two new optional context fields: `businessFacts` (verified facts Mason may state, never fabricated) and `leadIntake` (instructs Mason to gather naturally, give a quick price straight from the known facts if that's all the customer wants, and end a reply with a `LEAD_READY:` JSON marker once he has at least a name and a way to reach them). Also added the standing "don't default to giving out the phone number, escalate to the owner only as a last resort" rule for every channel — see `docs/business-intelligence/PRINCIPLES.md` **028**.
- `lib/mason/lead-intake.ts` — parses the `LEAD_READY` marker, strips it from what the customer sees regardless of whether it parses, and maps it onto `LeadSubmission`'s known fields.
- `app/api/mason/chat/[slug]/route.ts` — public, rate-limited (30/10min/IP, in addition to the turn cap and spend guard), resolves the company by slug, calls `receiveMessage()`, returns Mason's reply and whether a lead was just submitted.
- `app/book/[slug]/mason-chat.tsx` + `app/book/[slug]/page.tsx` — the chat UI replaces the structured form **only when `ANTHROPIC_API_KEY` is actually configured** (`lib/mason/providers/get-ai-model-provider.ts`); falls back to the original form otherwise. Same reasoning as this doc's original "no AI chat" decision above: never ship a chat widget that silently degrades to "having trouble responding" on every message.

**Deliberately not built, and why (same discipline as the original launch):**
- **Taking a real deposit.** No Stripe (or any payment processor) credentials exist anywhere in this environment. Faking a charge or a success response would violate `CLAUDE.md`'s payment-handling and cost-policy rules outright — this needs the founder to connect a real processor first, not a judgment call to make alone.
- **Mason "going out and finding jobs."** That's the already-roadmapped Opportunity Engine / outbound business-development capability (`PRODUCT.md`), not something to improvise inside a landing-page chat feature.
- **Real HAL specialist execution.** The founder's "hierarchy of specialists" framing matches HAL exactly (`lib/domain/hal.ts`, `HAL_SPECIALIST_WORKFORCE.md`), but running specialist agents in production is explicitly deferred pending its own milestone (Knowledge Capture Session 009). Today, "hierarchy" is honestly: Mason answers from known facts → reasons harder himself on judgment calls → owner as absolute last resort — real, but not full HAL execution.
- **An "accurate quote" derived from a room-by-room item checklist.** Mason states A-1's real rate card and gathers real details conversationally; a firm, itemized estimate from a structured inventory walkthrough is a larger feature not built in this pass.

**Verified:** 180 unit tests + 38 integration tests (real local Postgres) passing, typecheck/lint/build clean. **Not verified:** no real Anthropic reply has ever been sent (no `ANTHROPIC_API_KEY` configured in this environment or confirmed in production) — the chat UI, prompt content, and lead-extraction logic are tested against mocked/fake AI responses, not a real model.

## Owner action required (in addition to the items above)

4. **Raise A-1's spend ceiling before relying on this in production.** `lib/mason/budget-config.ts`'s defaults (`$2`/day, `$20`/month per company) were sized for one internal dev Telegram channel — a real public chat will likely need `ANTHROPIC_COMPANY_DAILY_SPEND_CEILING_USD` / `ANTHROPIC_COMPANY_MONTHLY_SPEND_CEILING_USD` raised for A-1 specifically once this is live, or real customers will start hitting the budget-blocked fallback reply.

## Cross-references

- `ARCHITECTURE.md` §4 — one-paragraph architectural summary of the public-intake pattern.
- `ROADMAP.md` Phase 7 — status note.
- `docs/business-intelligence/JOURNAL.md` (2026-08-13 entry) and `PRINCIPLES.md` **028** — the phone-avoidance/escalation rule and scope-boundary reasoning behind this build.
