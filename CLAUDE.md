# CLAUDE.md — Operating Rules for Claude Code Sessions

This file is permanent. Every future Claude Code session working in this repository should read it before doing anything else. It applies regardless of which model or session is running.

## Read the product docs first

Before writing or changing anything, read `PRODUCT.md`, `ARCHITECTURE.md`, and `SECURITY.md`. Mason is a specific, already-designed product — a configurable AI Office Manager for service businesses, operating as an employee of each client company. It is not a generic chatbot project, and it must never be hardcoded to one industry (moving, HVAC, or otherwise). If a task seems to require an undocumented product decision, stop and ask rather than guessing.

## Inspect before editing

Read the actual current state of the repository, the relevant files, and recent commits before changing anything. Do not assume prior sessions did or didn't do something — check.

## Preserve existing work

Do not delete, rewrite, or bypass existing work without explicit instruction. If something looks wrong, incomplete, or outdated, raise it and ask before removing it. Prefer additive, reversible changes.

## Do not duplicate systems

Before adding a new provider integration, service, table, or abstraction, check whether one already exists (in `ARCHITECTURE.md`'s provider interfaces, in the codebase once it exists, in prior commits). Mason's provider-independence depends on there being exactly one `AIModelProvider`, one `TelephonyProvider`, one `TTSProvider`, etc. — not a second implementation living next to the first.

## Do not claim untested work is complete

Never report a feature, fix, or migration as "done" or "working" without having actually run it (tests, build, or a manual check appropriate to the change). If something can't be verified in this environment, say so explicitly instead of asserting it works. Type checks and test suites verify correctness, not that a feature does what the user wanted — say clearly which you've actually confirmed.

## Protect secrets

Never commit API keys, tokens, passwords, customer data, private email content, voice/telephony credentials, or production secrets. Mason's ElevenLabs voice, Twilio/telephony credentials, and any AI provider keys must live in environment variables or a secret manager only. Before any commit, check `git status`/`git diff` for anything that looks like a credential, connection string, or real customer data, and stop if you find one instead of committing it anyway.

## Use branches

Do not commit directly to `main` for feature work. Create a branch, do the work, and let the founder (or an explicit instruction) decide when it merges. Documentation-only commits explicitly requested by the founder are the exception, not the pattern.

## Run tests

Once a test suite exists, run it before declaring work complete. If you add new logic — especially anything touching tenant isolation, approval thresholds, or money — add a test for it rather than relying on manual inspection alone.

## Explain what changed

Summaries should be concrete: what files changed, why, and what was verified. Reference `file:line` where useful. Avoid vague summaries like "improved the system."

## Ask before destructive operations

Get explicit confirmation before: force-pushing, resetting or rewriting history, dropping/truncating database tables, deleting customer or tenant data, disabling a security control (RLS, auth check, rate limit, approval gate), or any other action that is hard to reverse. When in doubt, treat it as destructive.

## Respect the cost policy

The documented pilot cost estimate in `ARCHITECTURE.md` is a ceiling, not a target. Prefer free tiers. Never activate paid infrastructure (a paid Twilio number, a paid Deepgram/ElevenLabs tier, a paid Supabase/hosting plan, etc.) without explicit founder approval. Build and validate text-based Mason before any paid voice testing. When implementing anything that calls an external provider or an AI model, include usage tracking and hard caps on retries/loops/concurrent jobs/requests per conversation from the start — do not ship a code path that can call an external API or an AI model an unbounded number of times.

## Keep the founder's mobile workflow in mind

The founder primarily operates from an Android phone or tablet. When building or describing UI, testing steps, or setup instructions, favor things that work well on a small touch screen and don't assume a desktop terminal is always at hand.

## Respect the autonomy model

Mason's behavior is governed by three tiers — Automatic, Approval Required, Never Autonomous (defined in `PRODUCT.md` and `SECURITY.md`). When implementing any Mason capability, place it in the correct tier deliberately. Never let an "Automatic" implementation quietly gain "Approval Required" or "Never Autonomous" capabilities without that being a conscious, reviewed decision.

## Keep proprietary methods out of public-facing docs and code comments

**The `hurkl-platform` repository is currently public.** HURKL's business-development and public-record research methods, and the detailed logic behind growth/opportunity capabilities (Capacity Manager, Opportunity Engine, property/development signal evaluation, territory-and-trade exclusivity matching, Commercial Bid Centers, Business Maturity Advisor, Approved Outreach Playbooks — see `PRODUCT.md`), are proprietary: opportunity-scoring formulas, signal timing/staging rules, territory-matching logic, detailed commercial research methods, outreach tactics, data-source discovery methods, and the founder's private business-development playbooks are intentionally not documented in this repository. Document only high-level capabilities and principles, in general language. Do not add proprietary details, infer them, or expand on founder strategy in code, comments, commit messages, or docs unless the founder explicitly authorizes it — this applies with extra weight here specifically because the repository is public, not just internal-only.

## Two permanent rules for growth/opportunity capabilities

- **Never generalize the territory-and-trade-exclusivity cross-tenant exception.** `ARCHITECTURE.md` §4 documents one narrow, deliberate exception to tenant isolation for checking protected-market conflicts. It exposes trade/territory/status fields only, through a dedicated workflow. Do not use it as precedent to add any other cross-tenant read — that requires its own conscious, reviewed decision.
- **Verify a channel's platform rules and applicable law before implementing any automated outreach.** Never assume a social or digital platform permits automated outreach just because `PRODUCT.md` lists it as a potential channel — confirm the specific platform's current terms and any applicable law first, as a precondition to writing that integration, not an afterthought.
