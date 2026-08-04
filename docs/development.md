# docs/development.md — Local Development Setup

This covers running the HURKL/Mason platform app locally. See `ARCHITECTURE.md` for why these choices were made, `SECURITY.md` for the secrets policy this setup implements, and `PHASE_1_PLAN.md` for what each milestone unlocks.

## Prerequisites

- Node.js 22.x (this repo was scaffolded and verified against `v22.22.2`)
- npm (ships with Node)

## First-time setup

```bash
git clone <repo-url>
cd Hurkl-platform
npm install
cp .env.example .env.local
```

Then edit `.env.local` and set at minimum:

```
NEXT_PUBLIC_APP_ENV=local
```

That's the only variable Phase 1 actually requires — see "What's required right now" below.

## Running the app

| Command | What it does |
|---|---|
| `npm run dev` | Starts the local dev server (`http://localhost:3000`) |
| `npm run build` | Production build |
| `npm run start` | Runs a built app (`npm run build` first) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no output emitted (`tsc --noEmit`) |
| `npm run format` | Prettier, writes fixes (code only — `.md` docs are intentionally excluded, see `.prettierignore`) |
| `npm run format:check` | Prettier, check-only (used in CI) |
| `npm run test` | Vitest, runs once (`vitest run`) — unit tests only, no database needed |
| `npm run test:integration` | Real RLS/tenant-isolation and company-onboarding tests against a real local Postgres — see "Database" below |
| `npm run db:test-reset` | Manually reset the local integration-test database to a clean schema (useful for poking around with `psql`) |

Run `npm run build && npm run lint && npm run typecheck && npm run test` before considering any change done — this mirrors what CI will check once M1.3 stands it up.

## Database: migrations, local testing, and connecting the real Supabase project

### Local integration tests (no Supabase account needed)

`lib/db/*.integration.test.ts` proves Row-Level Security tenant isolation and the atomic company-onboarding function against a **real, local, disposable Postgres** — not Supabase, not mocked. Requires PostgreSQL 16 reachable locally (or via `TEST_DATABASE_URL`):

```bash
# one-time / whenever it's stopped
sudo service postgresql start
sudo -u postgres createdb hurkl_test          # first time only
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"   # first time only

npm run test:integration
```

These tests reset and reapply the whole schema on every run (`lib/db/test-support/apply-schema.ts`), so `hurkl_test` is always disposable — never point `TEST_DATABASE_URL` at anything holding real data.

### Applying migrations to the real Supabase project

`supabase/migrations/` contains exactly what a real Supabase project needs — nothing in it is local-test-specific. (The local-only `auth` schema stand-in lives separately, in `lib/db/test-support/`, and is never applied to a real project — a real Supabase project already provides `auth.users`/`auth.uid()` and the `authenticated` role natively.)

To apply them, once you have the project's credentials:

1. Get connection details from the Supabase dashboard: Project Settings → API (URL/keys the app uses) and Project Settings → Database (direct connection string the CLI uses).
2. Link once: `npx supabase link --project-ref <project-ref>`.
3. Push: `npx supabase db push`.

Or without the CLI: open the dashboard's SQL Editor and run the files in `supabase/migrations/` **in filename order** (`00000000000001_...`, then `00000000000002_...`, then `00000000000003_...`) — later files reference tables/roles the earlier ones create.

**As of this writing, this has not been run against the real `Hurkl-production` project.** See `docs/production-migration-plan.md` for the full migration review (schema inventory, dependency order, destructive-behavior findings), the disposable-environment verification results, and the step-by-step production plan (not yet executed) — required reading before applying these migrations for real.

### `/api/health` — Supabase connectivity check

`GET /api/health` proves the app can reach the configured Supabase project, using the same RLS-respecting client (`lib/supabase/server.ts`) every real tenant-scoped route uses — not the service-role client, since this only needs to prove the app's own request path works, not bypass RLS. It queries a deliberately nonexistent table (`__health_check_no_such_table__`) — Postgres/PostgREST responding with "relation does not exist" (`42P01`/`PGRST205`) proves a live, authenticated round trip to the database without needing any real application table to exist. Responses are intentionally minimal: `{ status, database, timestamp }`, where `database` is one of `connected` / `unreachable` / `misconfigured` — never a raw provider error, stack trace, URL, or key.

### Manual end-to-end verification (once the real project is migrated)

Real Supabase Auth (sign-up/sign-in) can't be exercised automatically in a sandboxed environment without either Docker or a connected real project — neither is available where this was built. Once `.env.local` has real values and the migrations above have been applied, verify by hand:

1. `curl <app-url>/api/health` — expect `{"status":"ok","database":"connected",...}`. If this fails, stop here; nothing past this point can work either.
2. Visit `/sign-up`, create an account with a real email/password.
3. Confirm the email if Supabase Auth's email-confirmation setting is on (check the dashboard's Auth logs if nothing arrives in dev).
4. Sign in at `/sign-in` — should land on `/onboarding` (no company yet).
5. Fill in the company form and submit — should redirect to `/dashboard`.
6. In the dashboard's Table Editor, confirm: a `companies` row exists; the `profiles` row for your user has that `company_id` and `role = 'owner'`; an `audit_log` row exists with `action = 'company_created_owner_assigned'`.
7. On `/dashboard`, add a customer — confirm it appears, and a `customer_created` audit_log row exists.
8. Sign out, create a **second** account and a **second** company. Confirm that account's `/dashboard` shows zero customers — not the first company's. This is RLS enforced over a real HTTP request, not just the local integration tests.
9. Re-submit the company-creation form for an account that already has one (e.g. via the browser back button) — expect a clear `409`, not a second company.

## What's required right now (Phase 1)

The app validates its environment at startup via `instrumentation.ts`, which calls `lib/env.ts`'s `getServerEnv()` once when the server process starts (Next.js's official `register()` hook — stable since Next.js 15, no config flag needed). As of Phase 1, exactly one variable is required:

- `NEXT_PUBLIC_APP_ENV` — must be `local`, `test`, `staging`, or `production`. Missing or invalid values throw a clear, aggregated error immediately at startup rather than failing confusingly later inside some feature. `test` is the CI-safe placeholder value (see `npm run env:check` and `.github/workflows/ci.yml`) — it's not a real deployed environment, just a valid, honest value for automated builds/tests that don't correspond to an actual site.

Every other variable in `.env.example` is optional today and stays that way until the milestone that wires up its provider — see the phase comments in both `.env.example` and `lib/env.ts`. Do not set a future-phase variable's real value just because it's listed; leave it blank until that milestone actually needs it.

### Server-only vs. public variables

`lib/env.ts` exports two functions on purpose:

- `getServerEnv()` — reads every variable, including secrets. Server-only code (API routes, Server Components, the future Voice Gateway) uses this. Never pass its return value as a prop into a Client Component, and never import it from a file with a `"use client"` directive — that would bundle secrets into client-side JavaScript.
- `getClientEnv()` — reads only `NEXT_PUBLIC_`-prefixed variables. This is what's safe to reference from Client Components or to render in the browser.

Only prefix a variable `NEXT_PUBLIC_` when it is **intentionally** safe for public delivery (e.g., `NEXT_PUBLIC_APP_ENV`, or later the Supabase project URL and publishable key, both of which Supabase itself designs to be client-safe). Everything else — Anthropic, ElevenLabs, Deepgram, Twilio, Trigger.dev, Resend, Sentry DSN, the Supabase service-role key — stays server-only, unprefixed.

### Build and test environments

Once a variable becomes required in a later phase (e.g., Supabase's URL once M1.4 lands), CI and any build/test environment must supply either the real value (via that environment's secret store — see the table below) or an explicit, clearly-fake placeholder recognized as test-only. Never silently bypass or weaken the validation to make a build pass — if a build can't get a real or explicitly-fake value, that's a real gap to fix, not something to route around.

## Local / staging / production separation

`NEXT_PUBLIC_APP_ENV` is the single source of truth for which environment the app thinks it's running in:

| Value | Where it's set | Purpose |
|---|---|---|
| `local` | Your own `.env.local`, never committed | Your machine, `npm run dev` |
| `test` | Set inline in the GitHub Actions workflow (not a secret — it's a fixed, safe placeholder) | CI runs of `npm run env:check`, `npm test`, and `npm run build` — no real environment exists for these |
| `staging` | Netlify environment variables for the staging site (M1.8) | Fake/test data only, `STAGING` banner, `noindex`/`nofollow` — per the founder-approved staging requirements in `ARCHITECTURE.md` |
| `production` | Netlify environment variables for the production site (later phase) | Real tenants, real customer data |

This is deliberately one variable with three values, not three separate config files — it keeps "which environment am I in" a single, always-answerable question rather than something inferred from which file happened to load.

## Where each variable eventually lives

No variable in `.env.example` is ever committed with a real value. Once a phase makes one required, its real value lives in exactly one of these places — never copied between them, never checked into git:

| Variable group | Local dev | CI (GitHub Actions) | Netlify (staging/production) | Trigger.dev | Voice Gateway |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_APP_ENV` | `.env.local` | Actions env (per workflow) | Site environment variables | — | — |
| Supabase (`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`) | `.env.local` | Actions secrets | Site environment variables | Job environment variables, if a job needs DB access | — |
| `ANTHROPIC_API_KEY` | `.env.local` | Actions secrets (only if CI ever calls the AI provider, which it shouldn't for ordinary builds) | Site environment variables | Job environment variables (jobs that call the AI Router) | Not needed directly — the Voice Gateway talks to the platform's API, not to Anthropic itself |
| `SENTRY_DSN` | `.env.local` (optional locally) | Actions secrets, if source maps are uploaded during CI | Site environment variables | Job environment variables | Its own environment config |
| `TRIGGER_SECRET_KEY` | `.env.local` | Actions secrets, for deploy steps | Site environment variables (so the app can trigger jobs) | N/A — this is Trigger.dev's own credential | — |
| `ELEVENLABS_API_KEY`, `DEEPGRAM_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | `.env.local` (only once Phase 8 work begins) | Not needed for ordinary CI | Not needed on the main app unless it also orchestrates voice config | Possibly, for jobs that touch voice/telephony | **Primary home** — the Voice Gateway is the always-on service that actually holds these connections open (see `ARCHITECTURE.md` §6) |
| `RESEND_API_KEY` | `.env.local` | Not needed for ordinary CI | Site environment variables | Job environment variables (follow-up/reminder jobs) | — |

## Key rotation and incident response (practical level)

- **Rotation is routine, not an emergency.** Every credential above should be rotatable by generating a new key in that provider's dashboard, updating it in whichever single location owns it (per the table above), and revoking the old one — with no code change required, per `SECURITY.md`'s secret-rotation principle. If rotating ever requires editing code, that's a bug in how the credential is wired in, not an acceptable rotation process.
- **If a credential is suspected leaked** (accidentally committed, pasted somewhere public, etc.): revoke it immediately in the provider's dashboard first, then investigate — don't wait to understand the full scope before cutting off access. Rotate, then check `git log`/GitHub secret scanning for what was actually exposed and for how long.
- **Never commit a real secret "temporarily to test something."** Use `.env.local` locally; it's gitignored specifically so this temptation doesn't need to exist.
- Before every commit, `git status`/`git diff` should be checked for anything resembling a credential — this is `CLAUDE.md`'s standing rule, not a one-time step.

## A note on A-1 Best Moving's existing credentials

During Phase 1 infrastructure inspection, an `ANTHROPIC_API_KEY` and an `ELEVENLABS_API_KEY` were found already configured on the **A-1 Best Moving Netlify site** (`a-1bestmoving`) — apparently from earlier testing, unrelated to this platform's build. These are documented here as **possible existing credentials only**:

- They have **not** been copied into this repository, this app's environment, or anywhere else.
- They are **not assumed to be authorized** for HURKL/Mason's use just because they exist somewhere in the founder's accounts.
- The A-1 Netlify site and its environment variables have **not** been moved, deleted, or modified.
- Before these (or any other pre-existing credential) are used by this platform, the founder needs to explicitly confirm they're appropriate to reuse here — e.g., confirming the ElevenLabs key is in fact "Mason's custom voice" referenced in `PRODUCT.md`, and that reusing the same Anthropic key (vs. issuing a dedicated one for HURKL) is intentional rather than incidental.
