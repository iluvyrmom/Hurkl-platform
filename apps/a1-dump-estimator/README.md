# A-1 Dump Estimator

A fast, mobile-first dump-run estimating app — Phase 1 of a future nationwide
junk-removal marketplace, built for **A-1 Best Moving** ("The best move
you'll make.", 971-777-6660, A1BESTMOVING@gmail.com). Built for a crew
standing at a customer's property: add items (or a quick load-size preset),
tap "Use My Location," and get a low/recommended/premium price in under two
minutes, backed by a real facility database and dump-pricing engine.

## Relationship to the rest of this repository

**This app is isolated by design.** `hurkl-platform` is the home of a
different, unrelated, already-in-progress product — **Mason**, HURKL's
industry-neutral AI Office Manager (see the root `PRODUCT.md`,
`ARCHITECTURE.md`, `SECURITY.md`, `CLAUDE.md`). Mason's platform rules
explicitly forbid hardcoding any one industry into its core code; this app
*is* industry-specific (junk removal) by design, which is exactly why it
lives here as a fully separate app rather than inside Mason's `app/`/`lib/`:

- Own `package.json`, own `node_modules`, own build (`next.config.ts` pins
  `turbopack.root` so it never gets swept into the parent repo's build).
- Own Supabase project (not provisioned yet — see below), own env vars
  (`.env.example` in this directory, not the root one), own auth
  (`proxy.ts`, `lib/auth/`) — completely independent of Mason's session model.
- No import from, or into, Mason's `app/`/`lib/` — the only thing shared is
  the git repository and this top-level `CLAUDE.md`'s general engineering
  discipline (verify before claiming done, never commit secrets, etc.),
  which this app follows too.
- Mason is explicitly **not** integrated here, per the build spec this app
  was built from. `lib/api.ts` exposes a clean, typed service surface
  (`createEstimate`, `bookJob`, `schedulePickup`, `lookupCustomer`,
  `calculatePrice`) specifically so a future integration (Mason or
  otherwise) has something stable to call without needing to know anything
  about Next.js, Supabase, or this app's internals.

If this becomes its own product long-term, it's a clean `git subtree
split`/extraction away from being its own repository — nothing here assumes
it has to stay nested in `hurkl-platform`.

## What's real vs. stubbed (read this before demoing or deploying)

No paid infrastructure was activated to build this — no live Supabase
project, no Stripe account, no Google Maps or OpenAI API key exists in this
environment. Everything runs with zero external cost out of the box in
**mock/dev mode**, and every "real provider" is fully coded against its
documented API but has never been executed against live credentials:

| Capability | Default (no config) | Real provider (requires keys in `.env.local`) |
|---|---|---|
| Database + Auth + RLS | In-memory, no login required | Supabase — schema + RLS + a storage bucket in `supabase/migrations/`, **written but not applied to a live project** (see "Supabase" below) |
| Photo AI analysis | Mock — honestly reports "needs manual review," never fabricates a detected item | `lib/providers/photo-analysis/openai-vision-provider.ts`, gated behind `PHOTO_ANALYSIS_PROVIDER=openai` — **not executed against a live key** |
| Geocoding + routing | Haversine-distance estimate (no live traffic); address geocoding returns null (GPS capture required) | `lib/providers/maps/google-maps-provider.ts` — Distance Matrix + Geocoding APIs, **not executed against a live key** |
| Payments | Records a `pending` payment row, no money moves, no real checkout link | `lib/providers/payments/stripe-provider.ts` — Checkout Sessions + Refunds, webhook-authoritative (`app/api/stripe/webhook`) — **not executed against a live Stripe account** |
| Receipt OCR | No extraction, defers to manual entry | `lib/providers/ocr/openai-provider.ts`, gated behind `OCR_PROVIDER=openai` — **not executed against a live key** |
| Duplicate-receipt detection | **Fully real** — SHA-256 image hash + OCR ticket-number matching, works identically in mock and real OCR mode | Same code path; more accurate with real OCR configured |
| SMS/Email notifications | Logs instead of sending | Not built yet — interface only (`lib/providers/notifications/`) |
| Photo storage | Local object URLs / data URLs, sent to the server only for analysis, never persisted anywhere | Not built yet — the Storage bucket + RLS policies exist in the schema (`job-photos`), but no upload code writes to it |
| Facility data | 2 real Portland-area facilities (Metro Central & Metro South Transfer Stations), sourced via web search, every fact tagged `requiresVerification` | Replace with independently-confirmed data once sourced — see "Facility data" below |

**Every "real provider" file throws a clear `ProviderNotConfiguredError`
instead of silently no-oping or fabricating a result if you select it without
the required env var.** The Settings page (`/settings`) shows which provider
is active for each capability at runtime.

**What's been verified, concretely:** `npm run build`, `npm run lint`,
`npm run typecheck`, and `npm run test` (20 unit tests — pricing engine,
facility selection, estimator engine, Stripe webhook signature verification,
duplicate-receipt hashing) all pass. In a real browser (Playwright/Chromium)
against the local dev server, with zero console errors: the full New
Estimate → GPS capture → photo analysis (mock) → Quote → Book Job flow;
Job → Payment (cash record → paid → refund button); Job → Complete (photo +
receipt → OCR extraction → duplicate-receipt detection blocking a reused
receipt → explicit override → completion). What has **not** been verified:
any real Supabase/Stripe/OpenAI/Google Maps integration (no credentials
exist in this environment), and the facility data below still needs a human
to confirm against the live source.

### Supabase (auth, RLS, storage)

`supabase/migrations/` defines the full schema: businesses, facilities +
pricing, customers, estimates, jobs, job completions, payments, and —
critically — `business_members` (links a Supabase Auth user to a business
with a role) plus Row-Level Security on every business-scoped table via a
`is_business_member()` helper, and a private `job-photos` storage bucket
with matching path-prefixed policies. `proxy.ts` (Next 16's middleware
convention) redirects unauthenticated requests to `/sign-in` once
`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` are set; every
repository in `lib/repository/` switches from the in-memory store to a
per-request, cookie-aware Supabase client (`lib/supabase/server.ts`) at that
same point — nothing to change in application code. **No live Supabase
project has been provisioned or had these migrations applied** — this
session had access to one Supabase organization (`Hurkl`, the same one
Mason's own project lives under) but did not create a new project in it
without checking first; see the session's final report for that question.

### Facility data

`lib/repository/facility-repository.ts` seeds **Metro Central Transfer
Station** and **Metro South Transfer Station** — real Metro-operated
Portland-area facilities, not invented placeholders. However:
`oregonmetro.gov` itself was blocked by this session's network egress
policy and could not be fetched directly, so every fact (address, phone,
hours, the $162.14/ton FY2025-26 tip fee, the graduated tire fee, the
free-mattress policy) came from a search-engine summary that *cites*
oregonmetro.gov rather than a page this session rendered and verified
itself. Every fact carries a `verification` field
(`sourceUrl`/`lastVerifiedDate`/`requiresVerification`/`verificationNotes`)
— `requiresVerification: true` everywhere right now — and the Quote page
shows an explicit "Needs verification" banner when a quote used
unconfirmed pricing. **Do not use this data for a real customer quote
without a human confirming it against the live oregonmetro.gov page first.**
A previously-seeded third (fabricated scrap-yard) facility was removed
rather than kept as invented data.

## Architecture

Modular by design — UI, estimator engine, dump-pricing engine, facility
database, payments, customers, scheduling, photo analysis, maps, OCR, and
notifications are all separate, swappable pieces:

```
app/                    Next.js App Router pages (mobile-first Tailwind UI)
  api/stripe/webhook/    Stripe webhook — the only path allowed to confirm a payment
  sign-in/               Supabase Auth sign-in
components/              Shared UI + feature components
lib/domain/              Dependency-free TypeScript types (Facility, Estimate, Job, Payment, Marketplace…)
lib/providers/           Swappable external-service interfaces + mock/real implementations
  photo-analysis/        AI vision abstraction (OpenAI Vision or any future provider)
  maps/                  Routing/distance/geocoding abstraction (Google Maps or any future provider)
  payments/               Stripe Checkout/Refunds or any future processor
  ocr/                    Receipt OCR abstraction (OpenAI Vision-based extraction)
  notifications/          SMS/email quote delivery abstraction
lib/pricing/              Dump-fee calculation against a facility's priced categories
lib/facilities/           Best-facility selection (legal-acceptance filter + cost scoring)
lib/estimator/            The core pricing engine: weight/volume/labor/crew/travel/fees → 3 tiers
lib/payments/             Checkout/cash/refund orchestration + webhook-authoritative confirmation
lib/receipts/             Duplicate-receipt detection (image hashing)
lib/auth/                 "Which business does this signed-in user belong to" — dev-mode-aware
lib/supabase/             Session-aware (server.ts), browser (browser.ts), and service-role (admin.ts) clients
lib/repository/           Data access — Supabase-backed (RLS-respecting) when configured, in-memory otherwise
lib/customers/, lib/scheduling/, lib/jobs/, lib/quotes/, lib/learning/
                          Thin service layer over the repositories
lib/api.ts                The stable external-integration surface (createEstimate, bookJob, …)
supabase/migrations/      Full schema: facility DB, auth/RLS/storage, payments, receipt OCR + duplicates
```

Nothing imports "A-1," "Portland," or a specific facility name outside
`lib/config/business.ts` (the one seeded business record) and the seed data
in `lib/repository/facility-repository.ts` — expanding to another city or
business is a data change, not a platform rewrite.

### The estimator (`lib/estimator/engine.ts`)

For a given load (items, photo-detected items, or a quick load-size preset)
and crew size, the engine:

1. Aggregates items into weight/volume per debris category (`aggregate-load.ts`).
2. Picks the best facility: filters out any facility that legally can't
   accept a requested category, scores the rest by dump fee + round-trip
   travel cost, and flags a partial-match facility rather than hiding it
   (`lib/facilities/service.ts`).
3. Computes labor hours/cost, travel fuel + drive-time labor cost, the
   facility's dump fee + special item fees, then layers a contingency and
   margin on top — three times, once per tier (low/recommended/premium),
   using different contingency/margin rates (`lib/estimator/constants.ts`).

Every default number in `constants.ts` (average item weight/volume, labor
rate, hours-per-yard, fuel cost, contingency/margin rates) is a documented
starting assumption, not a measured fact — that's what the learning system
(`lib/learning/service.ts`, `learning_records` table) exists to eventually
tighten from real completed-job data. Phase 1 records the estimated-vs-actual
comparison on every completed job; it does not yet feed that back into the
estimator automatically.

### Photo analysis — confidence and manual confirmation, never a silent exact weight

The New Estimate form's "Analyze Photos" button sends each photo (as a
`data:` URL, not uploaded to Storage — see "Photo storage" above) to the
active photo-analysis provider. Every detected item shows its confidence
percentage and requires an explicit "Add" tap before it becomes part of the
priced load — nothing is auto-added, and the mock provider always reports
`requiresManualReview: true` with zero detections rather than inventing one.

### Payments (Stripe Checkout, webhook-authoritative)

`lib/payments/service.ts` creates a Stripe Checkout session per charge
attempt and a `pending` row in the `payments` table (unique
`idempotency_key`, also passed as Stripe's `Idempotency-Key` header so a
network retry can't double-charge). **Only `app/api/stripe/webhook/route.ts`
— after manually verifying the HMAC-SHA256 signature
(`lib/payments/stripe-webhook-verify.ts`, no Stripe SDK dependency) — is
allowed to move a payment from `pending` to `paid`/`failed`.** A customer
closing the browser tab after paying is never trusted as proof of payment.
Refunds go through Stripe's Refunds API and update a `refunded_amount` on
the same row (partial refunds supported). Cash stays an owner-recorded
fallback: `recordCashPaymentForJob` marks the job `paid` immediately, since
an in-person cash payment has no webhook to wait for.

### Receipt OCR + duplicate-receipt detection

Job completion (`components/job/CompleteJobForm.tsx`) sends the receipt
photo (as a `data:` URL) to the OCR provider, which extracts facility name,
ticket number, date/time, gross/tare/net weight, and amount charged —
always flagged `requiresManualReview: true`, never presented as
authoritative on its own. The same request computes a SHA-256 hash of the
receipt image and checks it (plus the OCR-extracted ticket number as a
secondary signal) against every other completed job's receipt in the
business. A match **blocks completion** with a specific error
(`DuplicateReceiptError`) until a crew member explicitly confirms it isn't
a mistake — verified end-to-end with a real browser test (same photo
submitted for two jobs → blocked → explicit override → completed). The
original receipt image path is never overwritten once a job is completed,
which is what "preserve the original receipt" means in practice here.

### Marketplace future-proofing

`lib/domain/marketplace.ts` defines dependency-free contracts for the future
independent-contractor marketplace (`ReliabilityScore`, `MarketplaceOffer`,
`ContractorPayout`, `ContractorProfile`) — types only, mirroring the same
"contracts ahead of implementation" pattern the root Mason codebase uses in
its own `lib/domain/*.ts`. Reliability is modeled from completed jobs,
customer rating, receipt/photo compliance, and *post-acceptance*
cancellation rate only — declining a job before accepting it never counts
against it, per the product spec this was built from. None of this is wired
into the Phase 1 estimator flow.

## Local development

```bash
cd apps/a1-dump-estimator
npm install
cp .env.example .env.local   # optional — the app works with zero config
npm run dev                  # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest unit tests (pricing engine, facility selection, estimator, Stripe webhook verification, duplicate-receipt hashing) |
| `npm run format` | Prettier, writes fixes |

## What's genuinely done vs. genuinely not (Phase 1 honesty check)

**Done and verified:** estimator/dump-pricing/facility-selection engines
(unit-tested); full New Estimate → Quote → Book Job → Payment →
Completion → Jobs/Schedule/Customers/Settings flow (browser-verified);
Supabase schema including auth/RLS/storage/payments (written, not yet
applied to a live project); real (not example) Portland facility data with
explicit unverified-pricing flags; provider abstractions for every external
service the product spec calls for; mobile-first UI with large touch
targets; GPS capture + address geocoding (with fallback); photo analysis
with confidence + required manual confirmation; Stripe Checkout + webhook-
authoritative confirmation + idempotency + refunds; owner-recorded cash
fallback; receipt OCR extraction; duplicate-receipt detection that actually
blocks completion until overridden; a learning-record table wired to job
completion; real A-1 Best Moving brand colors — exact values from the
founder-confirmed color chart (gold #D4AF37 on near-black #111111,
"The best move you'll make.") — see `app/globals.css`'s `@theme` block and
`lib/config/business.ts`.

**Explicitly not done (future work, not silently skipped):** no live
Supabase/Stripe/OpenAI/Google Maps project connected (no credentials exist
in this environment); no photo storage upload (photos are sent for
analysis/OCR but never persisted to Storage); no SMS/email sending; no
automatic feedback loop from learning records back into the estimator's
defaults; no independent-contractor marketplace runtime (contracts only);
facility pricing still needs independent human verification
against the live source before real customer use; no public no-login
customer-facing quote view (a shareable quote link needs its own
deliberate RLS design, not an ad hoc public-read policy — see the comment
in `proxy.ts`).
