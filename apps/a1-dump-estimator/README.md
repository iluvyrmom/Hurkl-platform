# A-1 Dump Estimator

A fast, mobile-first dump-run estimating app — Phase 1 of a future nationwide
junk-removal marketplace. Built for a crew standing at a customer's property:
add items (or a quick load-size preset), tap "Use My Location," and get a
low/recommended/premium price in under two minutes, backed by a real facility
database and dump-pricing engine.

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
  (`.env.example` in this directory, not the root one).
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

Nothing below was activated with paid credentials to build this — no paid
infrastructure was turned on. Everything runs with zero external cost out of
the box:

| Capability | Default (no config) | Real provider (requires keys in `.env.local`) |
|---|---|---|
| Database | In-memory (resets on server restart) | Supabase — schema written in `supabase/migrations/`, **not yet applied to a live project** |
| Photo AI analysis | Mock — honestly reports "needs manual review," never fabricates a detected item | `lib/providers/photo-analysis/openai-vision-provider.ts` — written against OpenAI's documented Vision API shape, **not executed against a live key in this environment** |
| Maps / routing | Haversine-distance estimate (no live traffic) | `lib/providers/maps/google-maps-provider.ts` — Distance Matrix API, **not executed against a live key** |
| Payments | Records an intent in memory, no money moves | `lib/providers/payments/stripe-provider.ts` — PaymentIntents flow, **not executed against a live Stripe account** |
| Receipt OCR | No extraction, defers to manual entry | Not built yet — interface only (`lib/providers/ocr/`) |
| SMS/Email notifications | Logs instead of sending | Not built yet — interface only (`lib/providers/notifications/`) |
| Photo storage | Local object URLs (browser-only preview, not persisted) | Not built yet — needs a Supabase Storage bucket |
| Facility data | 3 clearly-labeled `Example …` facilities seeded near Portland, OR, with illustrative (not verified current) pricing | Real facility data goes in `facilities`/`facility_pricing_rules`/`facility_special_fees` once sourced |

**Every "real provider" file throws a clear `ProviderNotConfiguredError`
instead of silently no-oping or fabricating a result if you select it without
the required env var.** Set `PHOTO_ANALYSIS_PROVIDER=openai` +
`OPENAI_API_KEY`, or add `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`,
etc., to switch a given capability from mock to real — see `.env.example`
for the full list. The Settings page (`/settings`) shows which provider is
active for each capability at runtime.

**What's been verified, concretely:** `npm run build`, `npm run lint`,
`npm run typecheck`, and `npm run test` (11 unit tests covering the
dump-pricing engine, facility selection, and the estimator engine) all pass.
The full flow — new estimate → GPS capture → add items → calculate →
low/recommended/premium quote → navigate-to-facility link → schedule pickup
→ job detail → jobs list → schedule → customers → settings — was clicked
through end-to-end in a real browser (Playwright/Chromium) against the local
dev server with zero console errors. What has **not** been verified: any
real Supabase/Stripe/OpenAI/Google Maps integration (no credentials were
available/activated), and no real facility pricing data.

## Architecture

Modular by design — UI, estimator engine, dump-pricing engine, facility
database, payments, customers, scheduling, photo analysis, maps, OCR, and
notifications are all separate, swappable pieces:

```
app/                    Next.js App Router pages (mobile-first Tailwind UI)
components/              Shared UI + feature components
lib/domain/              Dependency-free TypeScript types (Facility, Estimate, Job, Marketplace…)
lib/providers/           Swappable external-service interfaces + mock/real implementations
  photo-analysis/        AI vision abstraction (OpenAI Vision or any future provider)
  maps/                  Routing/distance abstraction (Google Maps or any future provider)
  payments/               Stripe or any future processor
  ocr/                    Receipt OCR abstraction
  notifications/          SMS/email quote delivery abstraction
lib/pricing/              Dump-fee calculation against a facility's priced categories
lib/facilities/           Best-facility selection (legal-acceptance filter + cost scoring)
lib/estimator/            The core pricing engine: weight/volume/labor/crew/travel/fees → 3 tiers
lib/repository/           Data access — Supabase-backed when configured, in-memory otherwise
lib/customers/, lib/scheduling/, lib/jobs/, lib/quotes/, lib/learning/
                          Thin service layer over the repositories
lib/api.ts                The stable external-integration surface (createEstimate, bookJob, …)
supabase/migrations/      Facility DB, customers, estimates, jobs, job completions, learning records
```

Nothing imports "A-1," "Portland," or a specific facility name outside
`lib/config/business.ts` (the one seeded business record) and the seed data
in `lib/repository/facility-repository.ts` — expanding to another city or
business is a data change, not a platform rewrite.

### The estimator (`lib/estimator/engine.ts`)

For a given load (items or a load-size preset) and crew size, the engine:

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
| `npm run test` | Vitest unit tests (pricing engine, facility selection, estimator) |
| `npm run format` | Prettier, writes fixes |

## What's genuinely done vs. genuinely not (Phase 1 honesty check)

**Done and verified:** estimator/dump-pricing/facility-selection engines
(unit-tested), full New Estimate → Quote → Book Job → Jobs/Schedule/Customers
flow (browser-verified), Supabase schema (written, migration files present,
not yet applied to a live project), provider abstractions for every external
service the product spec calls for, mobile-first UI with large touch
targets, GPS-based location capture, printable quote view, job completion
gated on clean-site photo + dump receipt, and a learning-record table wired
to job completion.

**Explicitly not done (future work, not silently skipped):** no live
Supabase/Stripe/OpenAI/Google Maps project connected; no photo storage
upload (photos are local-only previews); no real OCR; no SMS/email sending;
no authentication/RBAC (single seeded business, no login); no automatic
feedback loop from learning records back into the estimator's defaults; no
independent-contractor marketplace runtime (contracts only); real A-1 brand
colors/logo not supplied — placeholder navy/orange palette is in
`app/globals.css`, swap `@theme` there when real brand assets exist; real
facility data not sourced — the three seeded facilities are clearly labeled
`Example …` placeholders, not verified real dump sites or pricing.
