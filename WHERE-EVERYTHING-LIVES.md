# Where everything lives (read this first)

Verified 2026-11-26. One official copy for each live piece, plus one labeled
backup. If a copy is not listed here, it is not official.

## Official copies (GitHub)

| Live piece | Runs on | Official source |
| --- | --- | --- |
| HURKL owner app (Travis / Executive Drains uses this) | Netlify `hurkl-mason-app` | this repo, `owner-app/` |
| Mason app for the founder (memory, approvals, tasks, AI team, plug keys) | Netlify `hurkl-mason-app` at `/mason/` | this repo, `owner-app/public/mason/` |
| Mason's memory and AI roster | Supabase tables `mason_memory`, `mason_ai_roster`, `mason_ai_jobs`, `mason_connectors` | `supabase/migrations/20261126233000_mason_memory_and_ai_roster.sql` |
| The HURKL plug (every AI connects to Mason's memory here) | Supabase Edge Function `mason-mcp` | `supabase/functions/mason-mcp/` |
| Mason's database programs (leads, Angi follow-up, owner texts, billing, alerts, shut-off guide, truck codes) | Supabase `Hurkl-production`, Edge Functions | this repo, `supabase/functions/` |
| Database change history | Supabase `Hurkl-production` | this repo, `supabase/MIGRATIONS.md` + `supabase/migrations/` |
| Mason's brain for website chat (A-1 chat, calendar, booking holds) | Netlify `hurkl-platform` | **Not recoverable as source.** See below. |
| A-1 Best Moving website (customer company, kept separate) | Netlify `a-1bestmoving` | GitHub `iluvyrmom/A-1_Best_Moving_LLC_Website-` |
| Executive Drains phone Mason | ElevenLabs agent + Supabase functions above | agent settings live in ElevenLabs; backend in `supabase/functions/` |
| Founder's checking dashboard | Netlify `hurkl-dashboard` | worked on in a separate session; not changed here |

## Company walls (HURKL is the hub; each company keeps its own rules)

HURKL holds only Mason himself and HURKL's own business rules. Everything about
a client company lives in that company's own settings and memory file:
`companies.owner_app_modules`, `companies.first_payment_features`,
`companies.emergency_protocol_locked`, `companies.pricing_rules`, per-company
`mason_feature_copy` rows, and `mason_memory` entries with scope `company`.
A new company starts clean (owner app shows text alerts only; nothing turns on
at first payment). Executive Drains' Angi follow-up and emergency shut-off
steps are Executive Drains only; A-1's prices, savings and truck codes are A-1
only.

## Mason's brain (Netlify `hurkl-platform`): known gap

The live deploy (`6aa493511250a09a67bc6ffc`, uploaded 2026-09-11) was built
outside this repository. It includes A-1 calendar, booking-hold and
follow-through routes that exist on no branch here. Netlify only allows
downloading the compiled pages, not the server code. The live deploy has no
expiry and keeps running. Do not redeploy `hurkl-platform` from this repo
until that code is rebuilt here and tested, or the A-1 calendar and bookings
would stop working.

## Backups

Google Drive folder **"HURKL Backups"** (owner thejoshrodrigue@gmail.com),
one dated zip per live piece, labeled `YYYY-MM-DD_<piece>_LIVE`.
Netlify also keeps every previous deploy for one-tap rollback.
Supabase Pro takes automatic daily database backups.

## Retired (approved for deletion 2026-11-26)

- GitHub `hurkl-platform-08d8d` (identical to branch `agents/dashboard-tab`)
- GitHub `hurkl-platform-6eacc` (identical to branch `dashboard/home-screen`)
- GitHub `A-1-Dump-Runs` (empty)
- Netlify `old-test-delete-me-1` / `old-test-delete-me-2` (October dashboard previews)
- 29 old branches in this repo. All of them are saved in
  `HURKL Backups/2026-11-26_HURKL-platform_29-old-branches.bundle`
  (restore with: `git fetch <bundle> 'refs/remotes/origin/*:refs/heads/*'`
  on a clone that has `main`).
