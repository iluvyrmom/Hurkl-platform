# ROADMAP.md — HURKL / Mason Phased Milestones

This roadmap is phase-based, not date-based — phases are sequenced by dependency, not by calendar. No phase should start meaningfully before its predecessors are in a working state. See `PRODUCT.md` for what's being built and `ARCHITECTURE.md` for how.

## Phase 0 — Documentation & Architecture *(this phase)*
- Product definition (`PRODUCT.md`), technical architecture recommendation (`ARCHITECTURE.md`), operating rules for future work (`CLAUDE.md`), security posture (`SECURITY.md`), this roadmap, and repository hygiene (`README.md`, `.gitignore`).
- Founder has approved: the official build location (`hurkl-platform` repo, not Lovable/Netlify side projects), the initial architecture (pending the §2a compatibility check), the cost policy, the data retention defaults, and the MFA policy. See the resolved-decisions logs in `ARCHITECTURE.md` and `SECURITY.md`.
- Exit criteria: this documentation is merged into the default branch via reviewed pull request. No application code is written until that merge lands.

## Phase 1 — Core platform foundation
- **First step, before any scaffolding:** run the `ARCHITECTURE.md` §2a compatibility verification (Next.js + Netlify + Trigger.dev/Inngest + Supabase) and record the outcome here. If it surfaces a real incompatibility, apply the approved fallback (Vercel for hosting) rather than silently picking something unapproved.
- Scaffold the founder-approved framework (Next.js + TypeScript), repository structure, CI (typecheck/lint/test on PRs), local dev environment, and environment/secret handling per `SECURITY.md`. Use free tiers throughout per the cost policy in `ARCHITECTURE.md` §2 — no paid infrastructure without explicit founder approval.
- Stand up the database (Supabase/Postgres) with an initial schema skeleton — no business logic yet.
- Exit criteria: an empty-but-real app builds, deploys to a staging environment on free-tier infrastructure, and passes CI.

## Phase 2 — Authentication & tenant isolation
- Wire the auth provider; implement RBAC roles (Owner, Manager/Staff, Employee, HURKL Admin).
- Build MFA support into the auth layer now, even though it isn't enforced until go-live with a real tenant (see `SECURITY.md` MFA policy) — retrofitting MFA later is riskier than building it in from the start.
- Implement `company_id` on tenant-scoped tables and Postgres RLS policies.
- Automated tests proving cross-tenant access is impossible, not just discouraged.
- Exit criteria: two test tenants exist, and it is demonstrably impossible for one to read/write the other's data, including via crafted requests.

## Phase 3 — Company onboarding & configuration
- Tenant creation flow; configuration for services, pricing, hours, policies, FAQs, scheduling rules, and approval thresholds.
- This is where "industry-neutral platform, tenant-specific config" gets proven for real, ahead of any AI behavior depending on it.
- Exit criteria: A-1 Best Moving can be fully configured (services, hours, policies, thresholds) with zero platform code referencing "moving" anywhere.

## Phase 4 — CRM & conversation records
- Customer and lead data model; conversation record shared across channels (even before all channels exist) so history-merging is designed in from the start rather than retrofitted.
- Exit criteria: a customer record can accumulate history from at least two simulated channels and shows a unified timeline.
- **Status note:** a slice of this phase's conversation-record model (`conversations`/`messages`, one row per channel + external thread id) was deliberately pulled forward and built as part of connecting Telegram as Mason's first channel — see `docs/communications-architecture.md`. This is the founder's own internal/dev channel, not a customer-facing exit criterion for this phase; the full CRM/lead data model and multi-channel history-merging this phase describes are not otherwise complete.

## Phase 5 — Scheduling
- Calendar/availability data model, appointment booking logic, conflict handling.
- Exit criteria: an appointment can be booked against configured availability rules and reflected on both an owner and (if applicable) a customer-facing confirmation.

## Phase 6 — Text-based Mason
- The first real AI Office Manager surface: web/SMS text conversation, using the AI Router (tiered model routing) and the Approval Engine, before voice complexity is introduced.
- **Status note:** the Telegram channel built ahead of sequence (see Phase 4's status note) proves the message-routing pipeline end-to-end but uses `MockAIModelProvider`, not real reasoning — this phase's actual AI Router activation (a real `ANTHROPIC_API_KEY`, explicitly approved) is still what "text-based Mason" means here.
- Built around Mason's Executive Architecture from the start (`ARCHITECTURE.md` §1c, `docs/business-intelligence/HAL_SPECIALIST_WORKFORCE.md`): task execution is delegated through HAL specialists and the Assurance Layer, not handled as one monolithic AI call — architecture and contracts only until this phase actually authorizes building real specialist agents. **Founder priority when that begins: the Critical Review Specialist first** — the mandatory gate that reviews every specialist report before Mason sees it.
- Lead qualification, message-taking, and appointment booking via text, governed by the three autonomy tiers.
- Cost guardrails from `ARCHITECTURE.md` §2a ship alongside the feature, not after: usage tracking, configurable spending limits, pre-limit alerts, and hard caps on retries/loops/AI requests per conversation.
- Exit criteria: a text conversation can qualify a lead, book an appointment within configured rules, and correctly escalate an out-of-threshold request to the owner — with an audit log entry for each autonomous action and a visible per-tenant usage/cost record.

## Phase 7 — A-1 pilot workflows
- **Gate:** A-1 is a real business with real customer data, so this is a "production launch" for MFA purposes — A-1's owner/admin account(s) must have MFA enforced (see `SECURITY.md`) before A-1's Mason handles real customer interactions, not deferred to Phase 14.
- A-1-specific configuration and workflows (move intake, room-by-room details, crew options, dispatch, time tracking, photos, completion checklist, payment workflow, review requests) — all as tenant configuration on top of the platform built in Phases 1–6.
- Exit criteria: A-1 can run a real customer interaction end-to-end through text-based Mason, validating the whole loop with a real business before voice is added.

## Phase 8 — Voice & phone
- **Gate:** this is the first phase that incurs real Twilio/Deepgram/ElevenLabs usage cost. Do not activate paid telephony/STT infrastructure before this phase without separate explicit founder approval, per the cost policy in `ARCHITECTURE.md` §2.
- Telephony integration, call forwarding from an existing number, STT/TTS pipeline (Deepgram/ElevenLabs behind their provider interfaces), multiple simultaneous calls, live transcription, call summaries.
- Exit criteria: a real call to A-1's forwarded number is answered by Mason with the correct greeting, handles a routine request, and produces a transcript + summary on the shared customer record.

## Phase 9 — Email & calendar integrations
- Inbound/outbound email as a first-class channel; external calendar sync (e.g., for owners who already run Google/Outlook calendars).
- Exit criteria: an email conversation contributes to the same shared customer history as phone/text/web.

## Phase 10 — Owner approval center
- Owner Portal UI for pending Tier 2 approval requests, notifications (SMS/push/email), and a clear history of decisions made.
- Exit criteria: an owner can approve/deny a pending request from a phone in under a few taps, and the outcome is reflected back into the live conversation.

## Phase 11 — Employee/technician portal
- Scoped portal: schedule, assigned job/customer details, status updates, completion notes, photos, parts/follow-up needs — explicitly excluding management and payroll data.
- Exit criteria: a technician account cannot see any data outside their assigned jobs, verified by test, not just by UI hiding.

## Phase 12 — Monitoring & cost controls
- Usage/cost dashboards per tenant, owner-configurable spending limits, alerting, audit log UI, emergency pause/slowdown controls surfaced in the Owner Portal.
- Exit criteria: an owner can see AI/telephony spend to date, set a limit, and see Mason actually slow down or pause when that limit is reached.

## Phase 13 — Controlled autonomy expansion
- Gradually and deliberately expand what's Tier 1 (Automatic) per tenant, based on track record and explicit owner opt-in — never a silent platform-wide change.
- Exit criteria: at least one tenant has consciously expanded Mason's automatic capabilities beyond the initial defaults, with the change itself audit-logged.

## Phase 14 — Multi-company commercial release
- Self-serve (or sales-assisted) onboarding for additional companies, billing, marketing site, support processes.
- Exit criteria: a second real company (beyond A-1) is onboarded without platform code changes — configuration only.
- **Status note:** the billing *exemption* side of this phase was deliberately pulled forward — every company now carries an `account_type`, and one centralized layer (`lib/billing/authorization.ts`) already exists to decide whether a company is billed — see `docs/internal-ownership-system.md`. This is not the billing system itself, which still doesn't exist (no Stripe, no subscriptions, no invoices); it's the guardrail built ahead of it, per explicit founder request, so real billing work when it happens has one correct integration point from day one rather than retrofitting exceptions in later.

---

**Sequencing note:** Phases 6–7 (text-based Mason, A-1 pilot) intentionally precede Phase 8 (voice). Validating the AI Router, Approval Engine, and shared customer history over text — which is cheaper to build, test, and debug — de-risks voice, which adds telephony, STT/TTS, and real-time concurrency on top of everything text already proved.

## Future phase — Growth & capacity management (not yet sequenced)

`PRODUCT.md` documents a set of growth-and-capacity capabilities — Capacity Manager, Opportunity Engine (including property/development signal evaluation and the Business Knowledge Graph), territory-and-trade exclusivity, Commercial Bid Centers, Business Maturity Advisor (including recognizing when outside specialists become justified), Approved Outreach Playbooks, DEFERRD (first-party physical fulfillment, including direct-mail fallback lead generation and persistent physical advertising), the Operations Compliance Engine (including the Digital Project Compliance Binder and Equipment Lifecycle Engine), the Continuous Intelligence Engine (built on the Verified Intelligence and Evidence-Based Operations principles), the Financial Health Engine (cash-category tracking, tax readiness, and coordination with an established accounting platform), Strategic Alliances (growth alliances, respect-worthy competitors, local relationship networks), a future HURKL Trusted Business Network / HTBN (cross-tenant trust-and-membership governance, not yet designed), an Operational Readiness Engine, Relationship Value, and a Business Risk Dashboard — that are founder-approved product decisions but are **intentionally not yet placed into the numbered phase sequence above**. A related but distinct near-term capability, voice-first capture ("Talk to Mason," see `PRODUCT.md`), is not growth-and-capacity management but shares the same "documented, not yet built" status. `ARCHITECTURE.md` §1b separately records the founder-approved foundational decision that HURKL is a Business Ecosystem Platform (not a CRM) built around one shared Business Knowledge Graph underlying all of the above. Where these capabilities land relative to Phase 7 (A-1 pilot) and Phase 14 (commercial release) is a real sequencing decision the founder still needs to make, not something to assume or guess at. None of this is implemented yet beyond dependency-free TypeScript domain contracts (`lib/domain/fulfillment.ts`, `lib/domain/compliance.ts`, `lib/domain/evidence.ts`, `lib/domain/finance.ts`, `lib/domain/intelligence.ts`, `lib/domain/alliances.ts`, `lib/domain/readiness.ts`, `lib/domain/relationship-value.ts`, `lib/domain/network-governance.ts`) — no live web research crawler exists, no tax-strategy logic exists, no speech-to-text or AI-extraction logic exists, and the HTBN's cross-tenant membership-visibility mechanism and the Business Knowledge Graph's cross-trade matching have no domain contracts at all yet (see `ARCHITECTURE.md` §1b, §3, and §4). See `PRODUCT.md`'s "Proprietary methods" section for what stays undocumented even once it is.
