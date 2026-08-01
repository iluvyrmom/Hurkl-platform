# ROADMAP.md — HURKL / Mason Phased Milestones

This roadmap is phase-based, not date-based — phases are sequenced by dependency, not by calendar. No phase should start meaningfully before its predecessors are in a working state. See `PRODUCT.md` for what's being built and `ARCHITECTURE.md` for how.

## Phase 0 — Documentation & Architecture *(this phase)*
- Product definition (`PRODUCT.md`), technical architecture recommendation (`ARCHITECTURE.md`), operating rules for future work (`CLAUDE.md`), security posture (`SECURITY.md`), this roadmap, and repository hygiene (`README.md`, `.gitignore`).
- Exit criteria: founder has reviewed and approved (or amended) the open decisions flagged in `ARCHITECTURE.md` and `SECURITY.md`. No application code is written until this phase is genuinely done.

## Phase 1 — Core platform foundation
- Scaffold the chosen framework (proposed: Next.js + TypeScript), repository structure, CI (typecheck/lint/test on PRs), local dev environment, and environment/secret handling per `SECURITY.md`.
- Stand up the database (proposed: Supabase/Postgres) with an initial schema skeleton — no business logic yet.
- Exit criteria: an empty-but-real app builds, deploys to a staging environment, and passes CI.

## Phase 2 — Authentication & tenant isolation
- Wire the auth provider; implement RBAC roles (Owner, Manager/Staff, Employee, HURKL Admin).
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

## Phase 5 — Scheduling
- Calendar/availability data model, appointment booking logic, conflict handling.
- Exit criteria: an appointment can be booked against configured availability rules and reflected on both an owner and (if applicable) a customer-facing confirmation.

## Phase 6 — Text-based Mason
- The first real AI Office Manager surface: web/SMS text conversation, using the AI Router (tiered model routing) and the Approval Engine, before voice complexity is introduced.
- Lead qualification, message-taking, and appointment booking via text, governed by the three autonomy tiers.
- Exit criteria: a text conversation can qualify a lead, book an appointment within configured rules, and correctly escalate an out-of-threshold request to the owner — with an audit log entry for each autonomous action.

## Phase 7 — A-1 pilot workflows
- A-1-specific configuration and workflows (move intake, room-by-room details, crew options, dispatch, time tracking, photos, completion checklist, payment workflow, review requests) — all as tenant configuration on top of the platform built in Phases 1–6.
- Exit criteria: A-1 can run a real customer interaction end-to-end through text-based Mason, validating the whole loop with a real business before voice is added.

## Phase 8 — Voice & phone
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

---

**Sequencing note:** Phases 6–7 (text-based Mason, A-1 pilot) intentionally precede Phase 8 (voice). Validating the AI Router, Approval Engine, and shared customer history over text — which is cheaper to build, test, and debug — de-risks voice, which adds telephony, STT/TTS, and real-time concurrency on top of everything text already proved.
