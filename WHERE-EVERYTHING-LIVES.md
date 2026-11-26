# Where everything lives (read this first)

Verified 2026-11-26. One official copy for each live piece, plus one labeled
backup. If a copy is not listed here, it is not official.

## Official copies (GitHub)

| Live piece | Runs on | Official source |
| --- | --- | --- |
| HURKL owner app (Travis / Executive Drains uses this) | Netlify `hurkl-mason-app` | this repo, `owner-app/` |
| Mason's database programs (leads, Angi follow-up, owner texts, billing, alerts, shut-off guide, truck codes) | Supabase `Hurkl-production`, Edge Functions | this repo, `supabase/functions/` |
| Database change history | Supabase `Hurkl-production` | this repo, `supabase/MIGRATIONS.md` + `supabase/migrations/` |
| Mason's brain for website chat (A-1 chat, calendar, booking holds) | Netlify `hurkl-platform` | **Not recoverable as source.** See below. |
| A-1 Best Moving website (customer company, kept separate) | Netlify `a-1bestmoving` | GitHub `iluvyrmom/A-1_Best_Moving_LLC_Website-` |
| Executive Drains phone Mason | ElevenLabs agent + Supabase functions above | agent settings live in ElevenLabs; backend in `supabase/functions/` |
| Founder's checking dashboard | Netlify `hurkl-dashboard` | worked on in a separate session; not changed here |

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
