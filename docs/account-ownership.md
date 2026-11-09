# Account & Asset Ownership — where every part of HURKL lives

Purpose: make sure HURKL can never be lost because nobody remembers which login owns which piece. This file lists **names and owners only — never passwords, keys, or recovery codes** (this repository is public). Keep the actual secrets in a password manager.

Last verified: 2026-11-09 (via the connected GitHub, Netlify, Supabase, and Gmail tools in a Claude Code session). Re-verify after any account change.

## Target owner

Per `CLAUDE.md` ("Company boundaries and Mason ownership"), **`josh@hurkl.com` is the intended HURKL platform owner/admin login**, and `A1BESTMOVING@gmail.com` is A-1 Best Moving's own (customer-company) login. Everything HURKL-owned should end up controlled by `josh@hurkl.com`.

## Inventory

| Asset | Where | Owner login (verified) | Status |
|---|---|---|---|
| Source code | GitHub `iluvyrmom/Hurkl-platform` (public) | GitHub user `iluvyrmom` | Verified. `main` holds the shipped app; a lot of October 2026 work lives only on unmerged branches — see below. |
| Duplicate repos | GitHub `iluvyrmom/hurkl-platform-08d8d`, `iluvyrmom/hurkl-platform-6eacc` | `iluvyrmom` | Verified: each holds only one branch whose commit already exists in `Hurkl-platform` (`agents/dashboard-tab` and `dashboard/home-screen`). Nothing unique — safe to archive later, but don't delete without founder approval. |
| Hosting | Netlify site `hurkl-platform` (`hurkl-platform.netlify.app`) | Netlify account email `josh@hurkl.com` (also signs in via GitHub and a Google login) | Verified. |
| Database | Supabase project `Hurkl-production` | Supabase org containing it (also holds `your-big-job` and `deferrd`) | Verified `ACTIVE_HEALTHY`. The other two projects are paused (`INACTIVE`) — free-tier paused projects must be restored from the Supabase dashboard before their restore window lapses. |
| AI (Mason's reasoning) | Anthropic Console | **Unknown** — the key in Netlify was set 2026-08; no Anthropic email found in the A-1 Gmail inbox | Not yet funded. Founder to confirm the account (likely `josh@hurkl.com`), or create a new key under `josh@hurkl.com` and replace the Netlify value. |
| Telegram bot | `M_Hurklbot` (BotFather) | Founder's Telegram account | Bot token lives in Netlify env only. |
| Domain | `hurkl.com` (email `josh@hurkl.com`) | Not verified from this environment | Founder to confirm registrar login and that auto-renew is on — losing the domain also loses the `josh@hurkl.com` email, which every account above recovers through. |

## Unmerged work (exists on GitHub branches, not on `main`)

As of 2026-11-09 these branches have commits not in `main`. They are safe on GitHub, but nothing on them is live. Review and merge (or deliberately close) rather than letting them drift:

- HAL / agents (Oct 27–31): `hal/critic-v1`, `hal/designer-builder`, `hal/marketing-v1`, `agents/dashboard-tab`, `agents/support-v1`
- Owner dashboard (Oct 27): `dashboard/owner-overview`, `dashboard/home-screen`, `dashboard/calendar`
- DEFERRD (Nov 1): `feat/deferrd-supabase-schema`, `feat/deferrd-money-core`, `docs/deferrd-move-plan`, `docs/deferrd-holiday-cards`
- Older (Aug), most likely already superseded by merged work — verify before deleting: the remaining `feature/*`, `fix/*`, `docs/*`, `claude/*`, `phase-1-foundation`, `ci-controlled-failure-test` branches.

## Founder checklist to secure HURKL

1. Turn on two-step login (2FA) on GitHub, Netlify, Supabase, Anthropic, the `hurkl.com` domain/email provider, and Google.
2. Save every recovery code in one password manager.
3. Confirm the `hurkl.com` domain is set to auto-renew.
4. Make sure each account above can be recovered through `josh@hurkl.com` (or a backup you control).
5. Confirm/replace the Anthropic account and key, then update the "AI" row above.
