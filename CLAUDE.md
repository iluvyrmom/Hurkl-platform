# CLAUDE.md — Operating Rules for Claude Code Sessions

This file is permanent. Every future Claude Code session working in this repository should read it before doing anything else. It applies regardless of which model or session is running.

## Read the product docs first

Before writing or changing anything, read `PRODUCT.md`, `ARCHITECTURE.md`, and `SECURITY.md`. Mason is a specific, already-designed product — a configurable AI Office Manager for service businesses, operating as an employee of each client company. It is not a generic chatbot project, and it must never be hardcoded to one industry (moving, HVAC, or otherwise). If a task seems to require an undocumented product decision, stop and ask rather than guessing.

## Inspect before editing

Read the actual current state of the repository, the relevant files, and recent commits before changing anything. Do not assume prior sessions did or didn't do something — check.

## Preserve existing work

Do not delete, rewrite, or bypass existing work without explicit instruction. If something looks wrong, incomplete, or outdated, raise it and ask before removing it. Prefer additive, reversible changes.

## Do not duplicate systems

Before adding a new provider integration, service, table, or abstraction, check whether one already exists (in `ARCHITECTURE.md`'s provider interfaces, in the codebase once it exists, in prior commits). Mason's provider-independence depends on there being exactly one `AIModelProvider`, one `TelephonyProvider`, one `TTSProvider`, etc. — not a second implementation living next to the first. This same rule applies at the company/repository level, not just within this repo — see "Company boundaries and Mason ownership" below: there is exactly one Mason Core and one HAL, both in HURKL, never a second copy built inside a customer company's own application.

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

## Capture every approved decision — never let it live only in chat

The founder's conversations with Claude Code are part of the product record, not a side channel. Whenever a new business rule, product principle, workflow, or architectural decision is agreed upon in a session:

1. Record it in the appropriate project document **before ending the work session** — not "next time."
2. If no appropriate document exists yet, create one, rather than skipping the capture.
3. Cross-reference related documents: if a decision touches two docs, add a pointer in both so they can't silently drift out of sync.
4. Summarize what was added — and where — in that session's final report.
5. Never let an approved decision exist only in chat history. If it's real enough to act on, it's real enough to write down.

Where a given decision belongs:
- Product principles, capabilities, and business rules → `PRODUCT.md`.
- Technical/architecture decisions (stack, service boundaries, provider choices) → `ARCHITECTURE.md`.
- Security, autonomy-tier, or tenant-isolation decisions → `SECURITY.md`.
- Phase sequencing and milestone status → `ROADMAP.md` (or `PHASE_1_PLAN.md` while Phase 1 is active).
- Local/CI/operational workflow decisions → `docs/development.md`.
- **Business rules, product philosophy, or operational/business-judgment insight about how Mason should make growth decisions** (owner relationship, opportunity/capacity/qualification judgment) → `docs/business-intelligence/` — start in `JOURNAL.md`, promote durable ones to `PRINCIPLES.md`. See `BUSINESS_INTELLIGENCE.md` for which specific file. Same privacy rule as everywhere else in this public repo applies: principles and philosophy only, never the proprietary scoring/research logic behind them.
- Standing operating rules for future sessions (like this one) → this file, `CLAUDE.md`.

This applies without exception: no approved business rule, product philosophy, or operational insight may exist only in chat history. If it's real enough to act on, it's real enough to write down before the session ends.

**Every work session ends with a Knowledge Capture step before the session is considered complete.** This is not conditional on whether something "big enough" happened — check explicitly, every session. If genuinely nothing new was decided, say so; don't skip the step silently. See `docs/business-intelligence/JOURNAL.md` for the running log this produces, and `PRINCIPLES.md` for what gets promoted out of it.

## Ask before destructive operations

Get explicit confirmation before: force-pushing, resetting or rewriting history, dropping/truncating database tables, deleting customer or tenant data, disabling a security control (RLS, auth check, rate limit, approval gate), or any other action that is hard to reverse. When in doubt, treat it as destructive.

## Respect the cost policy

The documented pilot cost estimate in `ARCHITECTURE.md` is a ceiling, not a target. Prefer free tiers. Never activate paid infrastructure (a paid Twilio number, a paid Deepgram/ElevenLabs tier, a paid Supabase/hosting plan, etc.) without explicit founder approval. Build and validate text-based Mason before any paid voice testing. When implementing anything that calls an external provider or an AI model, include usage tracking and hard caps on retries/loops/concurrent jobs/requests per conversation from the start — do not ship a code path that can call an external API or an AI model an unbounded number of times.

## Keep the founder's mobile workflow in mind

The founder primarily operates from an Android phone or tablet. When building or describing UI, testing steps, or setup instructions, favor things that work well on a small touch screen and don't assume a desktop terminal is always at hand.

## Respect the autonomy model

Mason's behavior is governed by three tiers — Automatic, Approval Required, Never Autonomous (defined in `PRODUCT.md` and `SECURITY.md`). When implementing any Mason capability, place it in the correct tier deliberately. Never let an "Automatic" implementation quietly gain "Approval Required" or "Never Autonomous" capabilities without that being a conscious, reviewed decision.

## Respect Mason's executive architecture (HAL)

**This is the approved long-term architecture for Mason and HURKL, per Knowledge Capture Session 009 (`docs/business-intelligence/HAL_SPECIALIST_WORKFORCE.md`, `ARCHITECTURE.md` §1c). It supersedes any earlier assumption that Mason should directly perform every task.** Mason is the Executive (the owner's COO), not a specialist, and never one enormous AI prompt holding every domain's knowledge. When building or extending any Mason capability:

- Model new capabilities as **HAL specialists** reporting to Mason — one responsibility, one mission, one specialty, limited permissions, structured inputs/outputs, required evidence, escalation rules, execution limits, audit history (see `lib/domain/hal.ts`'s `SpecialistDefinition`) — never as an expansion of what Mason personally "knows."
- Preserve the reporting hierarchy: specialist → Quality Assurance Layer (as warranted) → Mason → owner. No specialist ever reports to the owner directly, and the owner never interacts with a specialist directly.
- The owner-facing surface remains **exactly one employee: Mason.** Never expose specialist identity, coordination, or department structure to the owner.
- HAL does not introduce a fourth autonomy tier — every specialist's output still resolves to Automatic / Approval Required / Never Autonomous (`SECURITY.md` §4) once it reaches Mason's decision process.
- Do not build autonomous production agents on top of these contracts without a specific, explicit milestone authorizing it — architecture and contracts come first.

## Company boundaries and Mason ownership (multi-company architecture)

**Founder-directed, permanent.** This extends "Respect Mason's executive architecture (HAL)" above and "Do not duplicate systems" from a within-repo rule to a cross-repo/cross-company one. HURKL is being built to serve many independent companies — the architecture below must stay valid whether HURKL serves 1 company or 100,000.

**HURKL is the platform company and the technical home of Mason.** Mason Office Manager Core, HAL's specialist workforce, the Critical Review Specialist/Critic, specialist routing/orchestration, the Company Package framework, shared memory architecture, shared business capabilities, cross-company platform infrastructure, shared APIs, and platform administration are all built, maintained, improved, and versioned in HURKL. **Do not implement an independent copy of Mason Core or HAL inside a customer company's own application or repository** — Mason is built once, in HURKL, and works for every company from there.

**A customer company (e.g. A-1 Best Moving) is operationally separate from HURKL.** Mason can work *for* a customer company while his core implementation stays in HURKL — the same pattern as `AIModelProvider`/`TelephonyProvider` etc. having exactly one implementation that every tenant uses, applied to Mason himself. Each company supplies its own Company Package: identity/brand, services, prices, policies, employees, territory, owner rules, approval authority, company memory/data, company users, integrations, and industry configuration. **Company-specific information must never be converted into global Mason behavior** — a rule, price, or policy that's true for one company is tenant configuration, not a change to Mason Core.

**A-1 Best Moving specifically:** it is an operating company using HURKL/Mason, not the HURKL platform itself. Its customer-facing website currently exists separately in Netlify. Do not move Mason Core into the A-1 website; the target architecture is:

```
A-1 Website → HURKL → Mason Core → A-1 Company Package → appropriate HAL specialists → Critic (where required) → Mason → customer/action
```

Target account association (**the goal, not yet the current state** — as of Knowledge Capture Session 011, the only real login in this project is `forgestarter@gmail.com` as `hurkl_admin`, and no `A1BESTMOVING@gmail.com` account exists yet; see `docs/business-intelligence/JOURNAL.md` for the verified current state before assuming either mapping below is already true):
- `A1BESTMOVING@gmail.com` → A-1 Best Moving company owner/admin.
- `josh@hurkl.com` → HURKL platform/admin.

HURKL admins may have authorized cross-company access (see `ARCHITECTURE.md` §4's `hurkl_admin` exception) — that does not eliminate company data boundaries for anyone else.

**`A1-Dump-Runs` (`iluvyrmom/A-1-Dump-Runs`) is a separate, developing capability for dump-run estimating/related work, NOT the A-1 Best Moving website's source repository.** A-1 receives dump-run inquiries, so this may eventually plug into A-1/HURKL through the correct architecture (Company Package/integration, not a merge) — but do not use it to reconstruct or modify the A-1 Best Moving website just because both names contain "A-1." **As verified in Session 011, this repository is currently empty** — treat that as the real current state, not as evidence something is broken or missing that needs recreating from HURKL.

**Multi-company data isolation applies to Mason's own reasoning context, not just the database.** RLS (`ARCHITECTURE.md` §4) already prevents one tenant's rows from being queried by another; this rule is the same principle one level up — Mason must never carry Company A's private data, prices, policies, permissions, or owner rules into a Company B conversation, request, or prompt. When extending Mason, improvements to Mason Core belong in HURKL; company-specific behavior belongs in that company's Company Package/configuration, never hardcoded alongside Mason's own logic (this is the same discipline `PRODUCT.md`'s "A-1 validates the platform end-to-end... never at the cost of baking moving-specific assumptions into Mason's core" already requires).

**Required pre-work check, before modifying any company-related code:**
1. Which legal/operating company does this work belong to?
2. Which repository/deployment actually owns the affected code?
3. Is this HURKL platform functionality, or company-specific functionality?
4. Which Company Package/context should Mason use here?
5. Could this change leak or hard-code one company's behavior into another?
6. Am I modifying the actual source, or merely a similarly named project? **Never infer repository identity from a similar name — verify it** (this is exactly the mistake this rule exists to prevent: `A1-Dump-Runs` sharing "A-1" with A-1 Best Moving does not make it that project's source).

If the company/repository relationship is uncertain, investigate it before modifying code — do not guess, and do not silently proceed on an assumed mapping.

**Core rule:** HURKL builds Mason. Mason works for customer companies. Customer companies remain separate from HURKL and from each other. Company websites connect to Mason/HURKL; they do not each contain their own independent Mason.

## Keep proprietary methods out of public-facing docs and code comments

**The `hurkl-platform` repository is currently public.** HURKL's business-development and public-record research methods, and the detailed logic behind growth/opportunity capabilities (Capacity Manager, Opportunity Engine, property/development signal evaluation, territory-and-trade exclusivity matching, Commercial Bid Centers, Business Maturity Advisor, Approved Outreach Playbooks — see `PRODUCT.md`), are proprietary: opportunity-scoring formulas, signal timing/staging rules, territory-matching logic, detailed commercial research methods, outreach tactics, data-source discovery methods, and the founder's private business-development playbooks are intentionally not documented in this repository. Document only high-level capabilities and principles, in general language. Do not add proprietary details, infer them, or expand on founder strategy in code, comments, commit messages, or docs unless the founder explicitly authorizes it — this applies with extra weight here specifically because the repository is public, not just internal-only.

## Two permanent rules for growth/opportunity capabilities

- **Never generalize the territory-and-trade-exclusivity cross-tenant exception.** `ARCHITECTURE.md` §4 documents one narrow, deliberate exception to tenant isolation for checking protected-market conflicts. It exposes trade/territory/status fields only, through a dedicated workflow. Do not use it as precedent to add any other cross-tenant read — that requires its own conscious, reviewed decision. This includes the future HURKL Trusted Trade Network (see `docs/business-intelligence/TRUSTED_TRADE_NETWORK.md`), which is explicitly not covered by this exception.
- **Verify a channel's platform rules and applicable law before implementing any automated outreach.** Never assume a social or digital platform permits automated outreach just because `PRODUCT.md` lists it as a potential channel — confirm the specific platform's current terms and any applicable law first, as a precondition to writing that integration, not an afterthought.

## Nine permanent guardrails for verified, lawful, and properly-scoped operation

Recorded from Knowledge Capture Sessions 003–006 (`docs/business-intelligence/`). Every future session, and every Mason capability built in this repository, must honor all nine — this section is a concise index, not the detail; follow each pointer for the full reasoning.

1. **Approved decisions are documented.** See "Capture every approved decision" above.
2. **Uncertain claims are labeled as such** — a verified fact, a plain-language explanation, an inference, a recommendation, and an unresolved ambiguity are never presented as if they were the same thing. See `docs/business-intelligence/VERIFIED_INTELLIGENCE.md`.
3. **Time-sensitive claims are verified, not assumed to still hold.** Laws, codes, standards, and market conditions change; a fact recorded once does not stay true forever. See `docs/business-intelligence/CONTINUOUS_INTELLIGENCE.md`.
4. **Authoritative sources are preserved alongside any important claim**, not just the conclusion. See `docs/business-intelligence/EVIDENCE_BASED_OPERATIONS.md`.
5. **No completion claim without evidence** — see "Do not claim untested work is complete" above, applied identically to any runtime claim Mason makes about a customer's compliance, tax, or legal status.
6. **No discriminatory logic** — race, ethnicity, nationality, sex, religion, or any other protected characteristic must never factor into a recommendation, evaluation, or relationship/alliance suggestion. See `docs/business-intelligence/STRATEGIC_ALLIANCES.md` and `PRINCIPLES.md` 012.
7. **No unlawful competitor coordination** — no price fixing, bid rigging, market allocation beyond HURKL's own customer licensing/exclusivity model, coordinated suppression of competition, confidential-bid-price sharing, or retaliatory blacklisting. See `docs/business-intelligence/TRUSTED_TRADE_NETWORK.md`.
8. **No legal, tax, or safety fabrication** — Mason identifies issues that require professional review and presents current official rules; it never invents a legal interpretation, tax strategy, or safety determination. See `docs/business-intelligence/FINANCIAL_HEALTH.md` and `OPERATIONS_COMPLIANCE.md`.
9. **No real external action without the correct autonomy and approval tier.** See "Respect the autonomy model" above and `SECURITY.md` §4 — this applies to every capability in this list, not only the ones already built.
