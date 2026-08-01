# PHASE_1_PLAN.md — Phase 1 Implementation Plan: Core Platform Foundation

Status: **proposed, pending founder approval.** No application code is written against this plan until it's approved. This elaborates `ROADMAP.md` Phase 1 into small, independently testable milestones with explicit acceptance criteria, per the founder's request.

## Scope

Phase 1's exit criteria (`ROADMAP.md`): *"an empty-but-real app builds, deploys to a staging environment on free-tier infrastructure, and passes CI."* Nothing more. This plan deliberately excludes:
- Any authentication, RBAC, or Row-Level Security policy (that's Phase 2).
- Any real business table — customers, leads, conversations, etc. (Phase 2+).
- Any AI, voice, telephony, SMS, or email provider integration (Phases 6+).

Phase 1 is infrastructure skeleton only. Building business logic on top of an unverified skeleton is the exact kind of premature layering `ARCHITECTURE.md` §2a and the cost policy are meant to prevent.

## Milestones

Each milestone is meant to be independently completable, independently verifiable, and small enough to review in one sitting.

### M1.0 — Compatibility verification (research, no code)

**Goal:** resolve `ARCHITECTURE.md` §2a before anything is scaffolded, so the stack choice is based on current facts, not assumption.

Tasks:
- Check Netlify's current Next.js runtime support (App Router, server actions, streaming, edge/background functions) against current Netlify documentation.
- Check Trigger.dev's and Inngest's current documented integration paths with Netlify-hosted Next.js apps and with Supabase.
- Decide: Netlify (approved default) vs. Vercel (approved fallback); Trigger.dev vs. Inngest.
- Record the outcome and rationale in `ARCHITECTURE.md` §2a and `ROADMAP.md` Phase 1.

**Acceptance criteria:**
- A written compatibility note exists naming the exact hosting provider and job-runner provider to use, with what was checked and when.
- No code has been written yet.

**Status: COMPLETE.** Verified (Aug 2026) against current provider docs: Next.js+Netlify, Netlify+Supabase, Trigger.dev+Netlify/Next.js, and Inngest+Netlify/Next.js are all compatible. Full findings, the Trigger.dev-vs-Inngest comparison, and the requirement-by-requirement verification (multi-tenant, background jobs, long-running workflows, provider interfaces, voice, mobile, scaling) are recorded in `ARCHITECTURE.md` §2a. One important finding amends §6: Netlify cannot host the persistent WebSocket Twilio Media Streams needs, so the Voice Gateway (Phase 8) will need its own always-on hosting — not a Phase 1 blocker. Trigger.dev is recommended for background jobs; **pending founder confirmation** before M1.1 begins.

**Founder checkpoint:** confirm the hosting/job-runner pick before M1.1 starts — cheap to change now, more disruptive once M1.1 onward depends on it.

### M1.1 — Repository scaffold & toolchain

**Goal:** a minimal, empty, real Next.js + TypeScript app exists in this repo.

Tasks:
- `create-next-app` (TypeScript, App Router).
- ESLint + Prettier configured; TypeScript strict mode on.
- Stub the provider-interface folder structure from `ARCHITECTURE.md` (e.g., `/lib/providers/`) as empty directories/interfaces — no implementations yet.
- One placeholder page (e.g., a static status page) — no business UI.

**Acceptance criteria:**
- `npm run build`, `npm run lint`, and `npm run typecheck` all pass locally with zero errors.
- `npm run dev` runs and the placeholder page renders.

### M1.2 — Environment & secrets strategy

**Goal:** implement `SECURITY.md`'s env-var strategy before any real credential exists.

Tasks:
- `.env.example` listing every expected variable name (Supabase URL/key, future provider keys) with placeholder values only.
- Confirm the merged `.gitignore` correctly excludes `.env*` except `.env.example`.
- Document local setup (`cp .env.example .env`, fill in, run) in a new `docs/development.md`.

**Acceptance criteria:**
- `.env.example` is committed; a real local `.env` shows as untracked in `git status`.
- A fresh clone, following the documented steps, produces a runnable local app (verified manually).

### M1.3 — CI pipeline

**Goal:** an automated gate on every PR, per `CLAUDE.md`'s "run tests" rule.

Tasks:
- GitHub Actions workflow: on PR to `main`, install, typecheck, lint, build (test step added incrementally as M1.9 lands).
- Flag, for founder decision, whether to turn on branch protection on `main` requiring this check to pass — a repo-setting change, not just code.

**Acceptance criteria:**
- Opening a PR against `main` triggers the workflow with a visible pass/fail status check.
- A deliberately broken PR (e.g., a typecheck error) is shown failing CI, then reverted — proving the gate blocks bad code rather than merely running.

### M1.4 — Supabase project provisioning (free tier)

**Goal:** a real, free-tier Supabase project exists and the app can connect to it.

Tasks:
- Create a free-tier Supabase project (founder-approved action — this is the first real external account created).
- Store the project URL and keys as environment variables locally and in the hosting provider's secret manager — never in git.
- Add the Supabase client; a minimal server-side `/api/health` endpoint that pings the DB and returns ok/error.

**Acceptance criteria:**
- `/api/health` confirms a live DB connection when run locally.
- A repo-wide secret scan confirms no Supabase credential appears anywhere in the working tree or git history outside `.env`.

### M1.5 — Database schema skeleton & migration tooling

**Goal:** prove the migration workflow works — without building real business tables (that's Phase 2+).

Tasks:
- Adopt Supabase CLI migrations; establish the migrations-folder convention.
- Create one throwaway-safe migration (e.g., a `_platform_healthcheck` table with a single row) purely to prove the pipeline — explicitly not a real business table.
- Document the migration workflow (write / apply locally / apply to hosted project) in `docs/development.md`.

**Acceptance criteria:**
- The migration applies cleanly both locally and against the hosted Supabase project.
- A second, trivial migration (e.g., adding a column) applies cleanly too, proving the workflow repeats.
- No RLS policies are written at this milestone — there are no tenant-scoped tables yet. State this explicitly in the PR description so it isn't mistaken for tenant-isolation work (that's Phase 2).

### M1.6 — Structured logging & error tracking baseline

**Goal:** match `ARCHITECTURE.md`'s structured-logging principle from the first deployed line of code.

Tasks:
- Wire a structured logger (e.g., pino) for server-side code.
- Wire Sentry (free tier) for error tracking, gated behind an env var so local dev doesn't spam a shared project.

**Acceptance criteria:**
- A deliberately thrown test error on `/api/health` appears in the error tracker during a manual check, then the test code is removed.
- Log output from `/api/health` is structured (JSON), not raw `console.log` strings.

### M1.7 — Background job runner skeleton

**Goal:** prove the M1.0 job-runner choice actually works with this stack before any real job (follow-ups, reminders) is built in later phases.

Tasks:
- Wire the chosen provider (Trigger.dev or Inngest) with one "hello world" job (logs a structured line, exits).
- Trigger it manually and confirm execution.

**Acceptance criteria:**
- The hello-world job runs successfully at least once locally and once against the deployed staging environment.

### M1.8 — Staging deployment

**Goal:** the app is reachable at a real, free-tier staging URL.

Tasks:
- Connect the repo to the chosen hosting provider (Netlify, or the Vercel fallback per M1.0).
- Configure staging environment variables in the hosting provider's secret manager — never committed.
- Auto-deploy on push to `main` (or a dedicated `staging` branch — decide and document which).

**Acceptance criteria:**
- The placeholder page and `/api/health` are both reachable at a public (or password-protected, per `SECURITY.md`) staging URL.
- A push to the deploy-triggering branch produces a new deployment automatically, verified by an observed timestamp/log change.
- Before closing this milestone, confirm every dashboard involved (hosting, Supabase, Sentry, job runner) is still on a free tier — no paid infrastructure was silently activated.

### M1.9 — Automated test baseline

**Goal:** at least one real automated test of each kind exists, giving later phases a pattern to extend rather than inventing testing from scratch.

Tasks:
- One Vitest unit test (e.g., a trivial utility or the health-check handler in isolation).
- One Playwright smoke test that loads the deployed staging placeholder page and asserts it renders.
- Wire both into the M1.3 CI workflow.

**Acceptance criteria:**
- `npm run test` passes locally and in CI.
- The Playwright smoke test passes against the real staging URL from M1.8, not just localhost.

### M1.10 — Phase 1 exit review

**Goal:** a deliberate checkpoint before Phase 2 (auth & tenant isolation) begins.

Tasks:
- Walk every milestone's acceptance criteria above and confirm each is genuinely met, not assumed.
- Update `ROADMAP.md`'s Phase 1 entry marking it complete, referencing what was actually verified.
- Founder sign-off before Phase 2 work starts.

**Acceptance criteria:**
- `ROADMAP.md` reflects Phase 1 as done, with a reference to the PR(s) that delivered it.
- No tenant/business logic, auth, or AI/voice code exists yet — confirmed as intentional, not a gap.

## Sequencing

M1.0 → M1.1 → M1.2 → M1.3 → M1.4 → M1.5 → M1.6 → M1.7 → M1.8 → M1.9 → M1.10. M1.6 and M1.7 can reorder relative to each other without issue; everything else has a real dependency on what precedes it (e.g., M1.8's deployment needs M1.4–M1.7's pieces to have something worth deploying).

## Open questions for founder approval before work starts

1. Monorepo vs. a single Next.js app at repo root — recommend single-app for pilot simplicity; needs confirmation.
2. Enabling GitHub branch protection on `main` requiring CI to pass (M1.3) — a repo-setting change, confirming before applying since it changes how merges work.
3. Whether the staging URL should be public or password-protected from day one.
4. Explicit go-ahead to create the first real external resources: a Supabase project (M1.4) and a Sentry project (M1.6) — both free-tier, but both are new accounts/resources outside this repo.
