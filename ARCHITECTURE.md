# ARCHITECTURE.md — HURKL / Mason Technical Architecture

Status: **approved by the founder** (initial stack, build location, and cost/retention/MFA policy below). Nothing here has been implemented yet — approval covers the plan, not a working system. The §2a compatibility verification (M1.0) is complete; the Trigger.dev-vs-Inngest pick it recommends still needs founder confirmation before M1.1 scaffolding begins. See PRODUCT.md for what the system must do; this document is how.

---

## 1. Guiding constraints (from product requirements)

- Multi-tenant from day one; tenant isolation is a security requirement, not a nice-to-have.
- Provider-independent where practical: AI model provider, voice/TTS provider, STT provider, telephony/SMS provider, database/hosting provider must all be swappable behind typed interfaces.
- Cost-controlled AI usage: cheap models for routine work, expensive models only for genuinely hard reasoning, with owner-configurable spending limits.
- Auditable: every meaningful autonomous action logged.
- Mobile-friendly: the founder and business owners operate primarily from Android phones/tablets.
- Reliable during failures: external integrations (telephony, AI providers, email) will fail sometimes; the system must degrade gracefully, not silently drop customer conversations.
- Configuration over hardcoding: industry-specific and even company-specific behavior lives in tenant config, not in platform code branches.

## 1a. Official build location (founder-approved)

The GitHub repository `hurkl-platform` is the official source-code repository for HURKL and Mason. All core platform code lives here.

- The existing Lovable HVAC-contractor project (`HVACForge Foundation`) and the existing A-1 Best Moving Netlify site (`a-1bestmoving`) are **unrelated projects** and must not be used as, or merged into, the core platform. They are out of scope for HURKL/Mason engineering work.
- A-1 Best Moving LLC will become the first pilot **tenant** inside the HURKL platform (see PRODUCT.md), but everything specific to A-1 — its services, pricing, crew model, workflows — is tenant configuration data, never core, hardcoded platform logic. The existing A-1 Netlify site is not the pilot; a properly onboarded A-1 tenant inside this platform is.

## 2. Recommended stack (founder-approved)

| Layer | Recommendation | Why | Alternatives considered |
|---|---|---|---|
| Language | TypeScript everywhere (web, API, background jobs) | One language across the stack lowers cognitive load for a small/solo dev team, strong typing supports the "typed provider interface" requirement, huge ecosystem for AI/telephony SDKs | Python (better for some AI tooling, but splits the stack); Go (great for services, weaker for a founder-operated fast-moving product) |
| Web framework | Next.js (App Router) | Full-stack in one framework (UI + API routes + server actions), strong TypeScript support, deploys cleanly to Vercel or Netlify, large talent/AI-assistance surface since it's extremely well-documented | Remix (similar tradeoffs, smaller ecosystem); SvelteKit (lighter, less AI/agent tooling precedent); separate Express API + React SPA (more moving parts, more to operate) |
| Database | PostgreSQL | Required by the "row-level tenant security" principle — Postgres Row-Level Security (RLS) is the most mature, battle-tested mechanism for enforcing multi-tenant isolation at the database layer, not just in application code | MySQL/PlanetScale (no native RLS equivalent); MongoDB (no RLS, weaker fit for relational business data like jobs/estimates/schedules) |
| DB + Auth hosting | Supabase (managed Postgres + Auth + Storage + RLS + Realtime) | Ships Postgres RLS, auth, and storage as one managed product — directly matches the RLS-based tenant isolation requirement, fast to stand up for a pilot, this account already has Lovable/Supabase-adjacent tooling available | Self-managed Postgres on Fly.io/Render + a separate auth provider (more control, meaningfully more operational burden for a one-person-operated pilot); Neon (good Postgres, no built-in auth/RLS tooling) |
| Background jobs / durable workflows | **Trigger.dev — founder-approved Phase 1 `BackgroundJobProvider`** (see §2a) | Verified-compatible with Netlify + Next.js; Waitpoints (pause a run at zero idle cost, resume via SDK/webhook when a human responds) map directly onto the Approval Engine's core mechanic; open-source (Apache 2.0) and self-hostable, backing the provider-independence principle; single-tenant pilot means the known multi-tenant fairness limitation isn't currently a blocker. Job definitions call shared application services only — no domain logic lives in Trigger.dev task files | **Inngest — recorded fallback candidate** for later multi-tenant scale, if the fairness gap becomes real (see §2a) |
| AI provider | Anthropic Claude, behind an `AIModelProvider` interface | Strong reasoning-per-dollar, tiered model family (a low-cost tier for routine classification/replies, a high-capability tier for hard reasoning) fits the cost-routing requirement directly | OpenAI, Google Gemini — both viable and should be swappable later; not chosen as default only because Claude's tiering and instruction-following fit the office-manager persona work well today |
| Voice output (TTS) | ElevenLabs, behind a `TTSProvider` interface | Mason's custom voice already exists in ElevenLabs (founder-confirmed) | N/A — already decided by founder; interface exists so it's replaceable if ElevenLabs pricing/availability changes |
| Speech-to-text | Deepgram (proposed), behind an `STTProvider` interface | Low-latency streaming STT with good pricing for phone-call volumes | AssemblyAI, Google STT — both fit the same interface, swappable without touching call logic |
| Telephony / SMS | Twilio (proposed), behind a `TelephonyProvider` / `SMSProvider` interface | Mature call-forwarding, programmable voice (media streams for real-time STT/TTS), SMS, and multi-simultaneous-call support; widest documentation surface | Vonage, Telnyx — both viable, same interface |
| Email | Resend or Postmark (proposed), behind an `EmailProvider` interface | Simple transactional + conversational email APIs, reasonable pilot pricing | SendGrid, AWS SES — same interface |
| Hosting (web/API) | Netlify (founder-approved default), or another platform if the compatibility check in §2a surfaces a better fit | Zero-ops deploys, preview environments per branch, this account already has Netlify access | Vercel (equally viable for Next.js, approved fallback if Netlify's compatibility check turns up a real gap); self-managed containers (more control, more ops burden not justified at pilot scale) |
| Error tracking / logging | Sentry + structured logging (pino or similar) | Fast to wire up, distinguishes real incidents from noise | — |
| Testing | Vitest (unit/integration) + Playwright (end-to-end) | Standard, well-supported in the TS/Next.js ecosystem | — |
| Feature flags | Simple DB-backed flags table for pilot; revisit a dedicated flag service only if complexity demands it | Avoids adding a new vendor before it's needed | GrowthBook, LaunchDarkly — reasonable later additions |

**Resolved:** the founder has confirmed `hurkl-platform` (this repository) as the official, hand-coded source of truth — not Lovable's builder platform, and not the existing A-1 Netlify site. See §1a.

## 2a. Compatibility verification — COMPLETE (M1.0)

Verified against current provider documentation (checked August 2026), not assumed. Findings:

**Next.js + Netlify:** confirmed compatible. Netlify's current Next.js Runtime fully supports the App Router, Server Components, streaming, Server Actions, and edge middleware out of the box — no adapter workarounds needed. ([Netlify docs](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/), [new Next.js Runtime](https://www.netlify.com/blog/introducing-the-new-next-js-runtime/))

**Netlify + Supabase:** confirmed compatible. Netlify has a first-party Supabase integration/extension that auto-provisions `SUPABASE_URL`/`SUPABASE_ANON_KEY` environment variables per framework (Next.js supported directly), including local dev via `netlify dev`. ([Netlify Supabase integration docs](https://docs.netlify.com/extend/install-and-use/setup-guides/supabase-integration/))

**Trigger.dev + Netlify/Next.js:** confirmed compatible. Official setup guide covers Next.js App/Pages Router and Server Actions; deploys via CLI or GitHub Actions independent of the host. ([Trigger.dev Next.js guide](https://trigger.dev/docs/guides/frameworks/nextjs))

**Inngest + Netlify/Next.js:** confirmed compatible. Inngest has a dedicated Netlify integration and a published Next.js+Netlify reference project; functions run as ordinary Netlify Functions invoked by Inngest's event hub. ([Inngest×Netlify](https://www.netlify.com/integrations/inngest/), [reference repo](https://github.com/inngest/sdk-example-nextjs-netlify))

**Decision: Trigger.dev — founder-approved as the Phase 1 `BackgroundJobProvider` implementation.** Rationale: Waitpoints align closely with Mason's human-approval/owner-signoff workflows; it supports durable, long-running jobs with retries, idempotency, and resumable execution; and with the A-1 pilot as the only tenant, the known multi-tenant fairness limitation (below) isn't currently a blocker. **Inngest is recorded as the leading fallback candidate** for later multi-tenant scale, should the fairness gap become real once HURKL has multiple simultaneously-active tenants with heavy background-job load. The `BackgroundJobProvider` interface must stay intact regardless: job definitions call shared application services for all business rules, never the other way around — Trigger.dev-specific APIs (tasks, waitpoints, retries) belong only in thin adapter code, so swapping to Inngest later doesn't touch domain logic.

**A note on the numbers above:** the free-tier limits, concurrency ceilings, and pricing figures in the comparison table (20 vs. 5 concurrent, $5 vs. free-execution allowances, etc.) are time-sensitive observations from provider docs checked in August 2026, not permanent facts — both companies change pricing and limits over time. Re-verify them against current provider documentation before production launch (Phase 7/8), not just trust what's written here.

**Important finding — amends §6, not a Phase 1 blocker:** Netlify Functions (standard, background, and edge) are all request/response or bounded-duration (15-minute max for background functions) and do **not** support long-lived WebSocket connections. Twilio Media Streams — the mechanism Mason's real-time, bidirectional phone-call audio depends on — requires a persistent WebSocket server that stays open for the duration of each call. This means the live voice-audio leg of the pipeline cannot run on Netlify itself; it needs a separate, always-on WebSocket-capable service (e.g., a small Node/Fastify process on Fly.io, Render, or Railway) that Twilio streams audio to and from, which then talks to the rest of the platform (Conversation Engine, database, AI Router) over ordinary HTTP. This is exactly what the §3 service map already called a "Voice Gateway" as a distinct service — this finding confirms that separation is a hard technical requirement, not just a clean-architecture preference. No action needed until Phase 8; flagging now so Phase 8 isn't planned around a false assumption that the whole stack runs on Netlify. ([Netlify functions limits](https://docs.netlify.com/build/functions/background-functions/), [Twilio Media Streams overview](https://www.twilio.com/docs/voice/media-streams))

### Trigger.dev vs. Inngest — comparison for HURKL/Mason

| Dimension | Trigger.dev | Inngest | Relevance to Mason |
|---|---|---|---|
| Core model | Durable tasks called like remote functions; open-source (Apache 2.0), self-hostable with unlimited runs | Event-driven: events route to functions with durable, individually-retriable steps | Both fit; Inngest's event model aligns slightly more with ARCHITECTURE.md's "event-driven integrations" principle, but Trigger.dev's simpler call-style model is easier for a small team to reason about |
| Human-in-the-loop / long waits | **Waitpoints** — a run checkpoints at zero idle compute cost and resumes via SDK, React hook, or webhook callback when a human responds | `step.waitForEvent` / `step.sleep` — functionally equivalent, event-driven framing | **Directly maps to the Approval Engine** (Tier 2 actions pausing for owner sign-off, possibly hours later) — both work; Trigger.dev's callback-URL pattern is a slightly more direct fit for an owner tapping "approve" from a phone notification |
| Multi-tenant concurrency fairness | `concurrencyKey` gives each tenant its own queue/limit, but a **known, actively-tracked limitation**: per-key limits aren't fairly capped against the shared environment-wide pool, so one very busy tenant could consume more shared capacity than others at scale | First-class treatment of this exact problem (published engineering work on "fixing noisy-neighbor problems in multi-tenant queueing"), plus separate concurrency + throttle + priority controls | Low risk at pilot scale (one tenant, A-1); becomes a real Phase 14 (multi-company) consideration — worth revisiting the choice then, not now |
| Free tier | $0/mo, $5 compute credit, **20 concurrent runs**, unlimited tasks, 10 schedules | $0/mo, 50K executions/mo, **5 concurrent steps**, 3 users | Trigger.dev's higher concurrency ceiling matters directly for "multiple simultaneous conversations" during pilot testing |
| Paid tier cost curve | Hobby $10/mo (50 concurrent), Pro $50/mo (200+ concurrent) | Pro $75/mo | Trigger.dev is cheaper to grow into, matching the cost policy's "prefer free tiers, spend as little as possible" default |
| Self-hosting / vendor lock-in | Open-source, explicitly designed for self-hosting with no run limits | Core is open-source too, but self-hosting is less emphasized/documented in what's publicly available today | Trigger.dev gives a clearer exit ramp if HURKL ever needs to leave the managed cloud product — stronger fit with the "do not permanently couple to any outside provider" instruction |

**Approved: Trigger.dev for Phase 1.** Its free-tier concurrency headroom and Waitpoints feature are a better match for Mason's near-term needs (simultaneous conversations, an Approval Engine built around pausing for a human), and its self-hosting story protects against lock-in. Inngest remains the recorded fallback candidate for later multi-tenant scale — the `BackgroundJobProvider` interface exists specifically so that switch stays cheap if it becomes worth it once fairness across many active tenants is a real, not theoretical, concern.

### Verification against Mason's specific requirements

| Requirement | Status | Notes |
|---|---|---|
| Multi-tenant architecture | ✅ Confirmed | Supabase Postgres RLS (existing `Hurkl-production` project, verified empty and healthy) + per-tenant `concurrencyKey` in the job runner |
| Background jobs | ✅ Confirmed | Both Trigger.dev and Inngest verified-compatible with Netlify + Next.js |
| Long-running workflows | ✅ Confirmed | Trigger.dev Waitpoints (or Inngest `step.waitForEvent`/`step.sleep`) checkpoint at zero idle cost — suited to Approval Engine waits and scheduled follow-ups/reminders spanning hours or days |
| Provider interfaces | ✅ Confirmed | Both job runners are plain TypeScript SDKs, easily wrapped behind a `BackgroundJobProvider` interface with no business-logic leakage |
| Voice integrations | ⚠️ Confirmed with an amendment | AI/TTS/STT/telephony orchestration and post-call async work (summarization, etc.) run fine on Netlify; the **live bidirectional call audio (Twilio Media Streams) cannot** — needs a separate always-on WebSocket service, as detailed above. Applies to Phase 8, not Phase 1 |
| Mobile-friendly deployment | ✅ Confirmed | Next.js on Netlify serves a responsive web app fine on mobile browsers; nothing here blocks the founder's Android-first workflow |
| Future scaling | ✅ Confirmed | Netlify and Supabase both scale incrementally (paid tiers raise limits); Trigger.dev/Inngest scale execution automatically; the Voice Gateway will need its own independent scaling story when built (Phase 8), which the service map already anticipated |

### Estimated monthly cost during pilot (single tenant, A-1 Best Moving, light-moderate call volume)

**This is a planning ceiling, not a spending target.** The founder-approved cost policy is to spend as little as possible below this ceiling, not to spend up to it. These are rough planning estimates, not quotes, and should be revisited once real usage data exists:

| Item | Estimate |
|---|---|
| Supabase (Pro tier, once past free tier) | ~$25/mo |
| Hosting (Vercel/Netlify, likely free tier at pilot scale) | $0–20/mo |
| Twilio phone number + call minutes | ~$1/mo number + usage (~$20–50/mo at low-moderate call volume) |
| Twilio SMS | Usage-based, likely <$10/mo at pilot volume |
| ElevenLabs | Existing subscription (founder already has this) |
| Deepgram (STT) | Usage-based, likely $10–30/mo at pilot volume |
| Claude API usage (tiered routing keeps this low) | ~$10–40/mo at pilot volume, spikes only if deep-reasoning tier is invoked often |
| Email (Resend, likely free tier at pilot volume) | $0–20/mo |
| Trigger.dev/Inngest (likely free tier at pilot volume) | $0–20/mo |
| Sentry (likely free tier at pilot volume) | $0 |
| **Estimated total** | **~$100–250/month**, scaling mostly with call/SMS volume |

### Cost policy & guardrails (founder-approved)

These are binding engineering requirements, not aspirations:

- **Prefer free tiers** for every provider during development and pilot — Supabase, Netlify/Vercel, Trigger.dev/Inngest, Sentry, Resend, and Deepgram all have usable free tiers at low pilot volume; stay on them until a real limit forces an upgrade.
- **No paid infrastructure is activated without explicit founder approval.** Development work proceeds on free tiers and sandbox/test credentials wherever a provider offers them (e.g., Twilio trial credentials, ElevenLabs existing subscription rather than a new one).
- **Build text-based Mason before any paid voice testing.** Phase 6 (text) is built and validated before Phase 8 (voice) incurs any real Twilio/Deepgram/ElevenLabs usage cost — this is already how ROADMAP.md sequences phases, and is now an explicit cost control, not just a technical one.
- **Cheapest capable model for routine work, always.** The AI Router (§5) defaults every task to the lowest-cost model tier and escalates only when routine-tier output is genuinely insufficient.
- **Model-routing controls are a required feature, not an optimization to add later.** The AI Router must be configurable per tenant (which tiers are allowed, whether escalation is allowed at all) from the first version that calls a real AI provider.
- **Usage tracking is required from the first real provider call.** Every AI request, call minute, SMS, and email send is metered per tenant from day one — not retrofitted after costs are already a problem.
- **Configurable spending limits are required**, owner-settable per tenant, enforced by the Usage & Cost Metering service (§3).
- **Alerts fire before a limit is reached**, not only when it's hit — e.g., at 80% and 100% of a configured threshold, so an owner (or the founder, during pilot) has time to react before Mason auto-pauses or auto-slows.
- **Runaway-usage prevention is a required control, not an assumption:** hard caps on AI request retries, background-job retry counts, concurrent background jobs per tenant, outbound calls/messages per conversation, and AI requests per conversation. No code path may retry or loop without a hard ceiling. This applies at both the Conversation Engine level (a stuck conversation cannot spawn unlimited AI calls) and the Background Jobs level (a failing job cannot retry forever or fan out unboundedly).

## 3. High-level service map

```
                    ┌───────────────────────────┐
                    │   Owner / Employee Web App │  (Next.js, mobile-friendly)
                    │  Owner portal · Employee   │
                    │  portal · Config UI        │
                    └─────────────┬─────────────┘
                                  │ API (typed, server-side business rules)
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
┌───────▼────────┐      ┌─────────▼─────────┐     ┌─────────▼─────────┐
│ Conversation    │      │ CRM / Customer     │     │ Approval Engine    │
│ Engine          │◄────►│ Service            │     │ (thresholds,       │
│ (channel-       │      │ (shared history    │     │  escalation,       │
│  agnostic)      │      │  across channels)   │     │  owner sign-off)   │
└───┬─────────┬───┘      └────────────────────┘     └────────────────────┘
    │         │
    │         └──────────────► AI Router ──────► AIModelProvider (Claude, tiered)
    │
┌───▼────────────────────────────────────────────────────────────┐
│ Channel Gateways                                                 │
│  Voice Gateway (Telephony + STT + TTS)  ·  SMS Gateway            │
│  Web Voice/Text Widget  ·  Email Gateway                          │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ Supporting services: Scheduler/Calendar · Audit Log · Usage &     │
│ Cost Metering · Background Jobs (follow-ups, reminders, missed-   │
│ call recovery, review requests) · Billing                        │
└────────────────────────────────────────────────────────────────┘

                    PostgreSQL (Supabase) — every tenant-scoped
                    table carries company_id + RLS policy
```

### Core services

- **Conversation Engine** — channel-agnostic orchestrator. Every inbound message (call transcript turn, SMS, web chat, email) becomes a normalized "conversation event." The engine holds conversation state, decides intent, calls the AI Router, and decides whether an action needs the Approval Engine before executing.
- **AI Router** — implements the cost-controlled model routing. Classifies each task by difficulty/risk, picks the cheapest capable model tier, and only escalates to a higher-capability model for genuinely hard reasoning (complex estimates, unusual objections, ambiguous intent). Logs every routing decision and its cost for the Usage & Cost Metering service.
- **CRM / Customer Service** — the single source of truth for a customer, keyed per tenant, with history merged across phone/web/SMS/email. This is what makes "shared customer history across channels" real instead of aspirational.
- **Approval Engine** — implements the three autonomy tiers (see SECURITY.md and PRODUCT.md). Routine actions execute; approval-required actions create a pending request the owner sees in the Owner Portal (and can be notified about via SMS/push/email); never-autonomous actions are hard-blocked in code, not just policy.
- **Scheduler/Calendar service** — owns availability rules, appointment booking, and calendar sync, per tenant.
- **Audit Log service** — append-only record of every meaningful autonomous action: what Mason did, why (which policy/threshold applied), on whose behalf, and what data it touched. Independent of general application logs.
- **Usage & Cost Metering** — tracks AI token spend, telephony minutes, SMS/email volume per tenant; enforces owner-configured spending limits; feeds the emergency pause/slowdown controls.
- **Background Jobs** — durable, retryable workers for anything that shouldn't block a live conversation: call summarization, follow-up scheduling, missed-call recovery, review requests, seasonal reminders.
- **Billing** — tenant subscription/usage billing (HURKL's own revenue engine); architecturally separate from a tenant's customer-facing payment workflows.

### Future services (not yet designed in detail)

`PRODUCT.md` documents several growth-and-capacity capabilities that don't have services in the map above yet, because they aren't being built now: a **Capacity Manager**, an **Opportunity Engine** (including property/development signal ingestion and the Business Knowledge Graph), a **Business Maturity Advisor**, **Approved Outreach Playbooks**, **DEFERRD** (first-party physical fulfillment), an **Operations Compliance Engine** (including Equipment Lifecycle), a **Continuous Intelligence Engine**, a **Financial Health Engine**, **Strategic Alliances** support, a future **HURKL Trusted Trade Network**, an **Operational Readiness Engine**, **Relationship Value**, and a **Business Risk Dashboard**. Voice-first capture ("Talk to Mason," see `PRODUCT.md`) is a nearer-term capture-UX capability, not a growth capability, but shares the same "not yet built" status. When these are eventually built:
- Outreach channels (email, permitted social/digital outreach, physical mail via DEFERRD) follow the same provider-interface pattern as every other integration — an `EmailProvider` already exists in the stack table below; DEFERRD's `PhysicalFulfillmentProvider` and any future outreach channel get their own typed interface, never a hardcoded call to a specific platform's API, and are never exposed as a customer-facing vendor choice. Each channel's platform rules and applicable law must be verified before that channel's provider is implemented — this is a precondition, not a detail to assume from this document.
- None of these services' internal ranking/scoring/timing logic belongs in this document or in code comments — see `PRODUCT.md`'s "Proprietary methods" section.
- The business judgment these services will eventually implement (how Mason reasons about opportunity, capacity, qualification, owner philosophy, compliance, and verified knowledge) is recorded in `docs/business-intelligence/` — that knowledge base, not this architecture document, is the source of truth for what these services are meant to express once built.
- Dependency-free TypeScript domain contracts already exist ahead of implementation for eight of these: `lib/domain/fulfillment.ts` (DEFERRD), `lib/domain/compliance.ts` (Operations Compliance Engine, including the Digital Project Compliance Binder and Equipment Lifecycle — `SafetyCriticalEquipmentCategory`, `EquipmentAsset`, `EquipmentLifecycleEvent`), `lib/domain/evidence.ts` (Verified Intelligence / Evidence-Based Operations — `EvidenceSource`, `EvidenceRecord`, `RegulatoryRequirement`, `VerifiedFinding`, `RecommendationEvidence`, `Jurisdiction`, `VerificationStatus`, `SourceAuthorityLevel`, `ReverificationRule`), `lib/domain/finance.ts` (Financial Health Engine — `CashCategory`, `CashPosition`, `FinancialReviewCycle`, `TaxDeadline`, `FinancialDecisionForReview`, `AccountingPlatform`, `AccountingProvider`), `lib/domain/intelligence.ts` (Continuous Intelligence Engine), `lib/domain/alliances.ts` (Strategic Alliances — single-tenant relationship types only), `lib/domain/readiness.ts` (Operational Readiness Engine — `ReadinessCategory`, `ReadinessIssue`, `DailyReadinessReport`), and `lib/domain/relationship-value.ts` (Relationship Value — `RelationshipValueFactor`, `CustomerRelationshipAssessment`). All eight are types only — no runtime logic, no database schema, no provider integration, and specifically **no live web research crawler**, **no tax-strategy logic**, and **no speech-to-text or AI-extraction logic** — so later work has a stable shape to build against without re-deriving it.
- **The HURKL Trusted Trade Network is explicitly not covered by any domain contract yet.** It is the one growth capability above with no corresponding `lib/domain/*.ts` file, because it would require a cross-tenant read beyond the single narrow exception §4 already documents. Per `CLAUDE.md`'s permanent rule, that exception must never be extended by precedent — any real design for this capability is its own conscious, reviewed decision, not something to derive from `lib/domain/alliances.ts`'s single-tenant types. See `docs/business-intelligence/TRUSTED_TRADE_NETWORK.md`.
- **The Business Knowledge Graph and the Business Risk Dashboard also have no domain contract yet, deliberately.** The Knowledge Graph borders the proprietary matching/scoring logic `PRODUCT.md`'s "Proprietary methods" section keeps out of this repository, so its contract shape is deferred rather than guessed at prematurely. The Risk Dashboard aggregates categories already modeled in `lib/domain/finance.ts`, `lib/domain/compliance.ts`, and `lib/domain/readiness.ts` and does not need a duplicate contract of its own.

## 4. Multi-tenant strategy

- Single Postgres database (simplest to operate correctly at pilot scale; revisit only if a compliance or scale requirement forces per-tenant databases later).
- Every tenant-scoped table (customers, leads, conversations, employees, calendars, services, prices, policies, approval thresholds, documents, communications, AI configuration, usage, billing, audit history) carries a `company_id` column.
- **Postgres Row-Level Security (RLS) enforces isolation at the database layer** — not just application-layer filtering — so a bug in application code cannot leak one tenant's data to another. This is defense-in-depth, matching the "no company must ever access another company's information" requirement.
- Storage (documents, photos, call recordings) is partitioned per tenant (separate storage prefixes/buckets), with access rules mirroring RLS.
- Cross-tenant HURKL admin access (for support/billing) goes through a separate, explicitly audited admin path — never through the same query paths tenants use.

### Territory and trade exclusivity: a narrow, explicit exception

`PRODUCT.md`'s configurable trade-and-territory exclusivity (a protected market per tenant, based on both territory and competing trade/service category) requires checking a new or expanding tenant's requested protected market against other tenants' existing ones. That is, by definition, a cross-tenant read — the one deliberate, narrowly-scoped exception to the tenant-isolation rule above, not a precedent for any other feature.

This exception must stay narrow in implementation: a minimal territory-and-trade registry (trade/service category, territory definition, status, duration — no customer data, no financials, no conversation content, no anything else) exposed only to a dedicated onboarding/expansion workflow, never to ordinary tenant-facing queries or RLS-bound application code paths. Extending this exception to expose any other cross-tenant data requires a conscious, reviewed architecture decision, not an assumption that "territory already does this so this can too."

## 5. AI model routing (cost control)

- Every AI task is classified before it's dispatched: routine (classification, drafting a standard reply, checking configured availability, summarization) vs. deep-reasoning (complex estimate, unusual objection, ambiguous multi-step request, escalation judgment call).
- Routine tasks default to the lowest-cost capable model tier. Deep-reasoning tasks escalate to a higher-capability tier, and only when the router (or the routine-tier model itself) determines it's warranted.
- Every routing decision, token count, and estimated cost is logged per tenant.
- Owners configure, per company: which model provider is active, usage/spending limits, whether deep-reasoning escalation is allowed at all, and what happens when a limit is hit (slow down, pause, or notify-only).
- The router is a thin, replaceable layer — the underlying `AIModelProvider` interface means swapping or adding a provider (OpenAI, Google, others) does not touch conversation logic.

## 6. Voice & phone pipeline

Per the founder-approved cost policy (§2), this pipeline is built and exercised with real providers only after text-based Mason (ROADMAP.md Phase 6) is validated — voice testing is the first point at which Twilio, Deepgram, and ElevenLabs usage incurs meaningful real cost, so it does not start until there's confidence the underlying Conversation Engine and Approval Engine already work correctly over text.

**Hosting note (confirmed in §2a's compatibility verification, founder-affirmed):** Netlify hosts the main Next.js application only — it must never be treated as, or asked to be, the persistent real-time telephony server. Twilio Media Streams (or any equivalent audio transport) needs a long-lived WebSocket connection held open for the duration of each call; Netlify's function offerings are all request/response or time-bounded and structurally cannot provide that. The Voice Gateway must run as its own separate, always-on service (e.g., a small Node/Fastify process on Fly.io, Render, or Railway), kept **provider-independent** the same way every other integration is — it does not hardcode Twilio specifically, and it communicates with the rest of the platform only through authenticated APIs and events, never direct database access or shared in-process state. This was already modeled as a distinct service in §3's service map; this is confirmation it's a hard requirement, not just a clean-architecture choice. No action needed until Phase 8.

1. Customer calls the business's existing number, forwarded (or ported) to the Telephony Provider.
2. Telephony Provider streams the call to the Voice Gateway.
3. Voice Gateway streams audio to the STT Provider, producing a live transcript.
4. Transcript turns flow into the Conversation Engine, which (via the AI Router) produces a response.
5. The response text goes to the TTS Provider (ElevenLabs) for synthesis and is streamed back to the caller.
6. The Voice Gateway supports multiple simultaneous calls (one conversation/session per call, horizontally scalable).
7. The business owner can still answer calls directly — forwarding rules and any configured "owner can intercept" behavior are tenant configuration, not a platform-wide constant.
8. On call end: full transcript and an AI-generated summary are stored on the customer's shared record; a customer/lead record is created or updated; an appointment may be booked directly in-call when possible; escalation to the owner or callback scheduling happens per configured rules.
9. All of this is provider-agnostic: `TelephonyProvider`, `STTProvider`, and `TTSProvider` are interfaces, so Twilio/Deepgram could each be replaced without touching the Conversation Engine.

## 7. Background jobs & event-driven integrations

Async, retryable, idempotent workers handle anything that shouldn't happen inline during a live conversation:
- Call/conversation summarization (if not done synchronously).
- Follow-up and callback scheduling.
- Missed-call recovery (detecting an unanswered/abandoned call and proactively reaching back out per tenant policy).
- Review requests after job completion.
- Seasonal/recurring reminders (tenant-configured cadence and content).
- Lead-platform integration ingestion.
- Usage/cost rollups feeding the Owner Portal and the pause/slowdown controls.

External side effects (sending an SMS, creating a calendar event, charging a card) are implemented as idempotent operations keyed by a stable operation ID, so retries after a failure never double-book, double-charge, or double-message a customer.

## 8. Deployment

- **Environments:** local development, staging (per-branch preview via Vercel/Netlify), production.
- **Secrets:** environment variables managed by the hosting provider's secret store (never committed — see SECURITY.md and `.gitignore`). ElevenLabs, Twilio, Deepgram, Claude, and database credentials all live here, per environment.
- **Infrastructure as code:** not necessary at pilot scale given managed providers (Supabase, Vercel/Netlify, Trigger.dev); revisit (e.g., Terraform) if/when self-managed infrastructure is introduced.
- **CI:** run typechecking, lint, and automated tests on every pull request before merge; block merges to main on failure once the codebase exists.

## 9. Scaling path

- **Pilot (1 tenant):** single Postgres instance, serverless web/API hosting, pay-as-you-go providers. Cost dominated by call/SMS volume, not infrastructure.
- **Early multi-tenant (a handful of companies):** same architecture; RLS already enforces isolation, so onboarding a new tenant is a data operation, not a code change. Watch background-job throughput and telephony concurrency.
- **Growth (dozens–hundreds of tenants):** consider read replicas for reporting/dashboards, dedicated worker pools per job type, per-tenant usage-based autoscaling for the AI Router, and splitting the Voice Gateway into its own scalable service if call concurrency demands it.
- **Commercial scale:** revisit whether any tenant needs dedicated infrastructure (compliance, volume), introduce infrastructure-as-code, and formalize a support/on-call rotation — none of which blocks the pilot.

## 10. What this document intentionally does not decide

- The §2a compatibility verification (Next.js + Netlify + Trigger.dev/Inngest + Supabase) has not been run yet — approval of the stack is conditional on that check passing or the fallback being used.
- Exact provider contracts/API versions — decided when each provider integration is actually built, against the typed interface defined here.
- Native mobile app vs. responsive/PWA web app for the founder's Android usage — recommendation is a mobile-friendly responsive web app first (faster iteration, one codebase), revisit a native app only if push notifications or offline behavior demand it.

## 11. Resolved decisions log

| Decision | Resolution | Date |
|---|---|---|
| Official build location | `hurkl-platform` GitHub repo; Lovable HVAC project and A-1 Netlify site are unrelated and out of scope | Founder approval, this session |
| Initial architecture (§2) | Approved as listed, pending §2a compatibility verification before implementation | Founder approval, this session |
| Cost policy | $100–250/mo is a ceiling, not a target; free tiers preferred; no paid infra without explicit approval; text before paid voice testing | Founder approval, this session |
| M1.0 compatibility verification | Next.js+Netlify, Netlify+Supabase, Trigger.dev+Netlify/Next.js, and Inngest+Netlify/Next.js all confirmed compatible against current docs (Aug 2026). Trigger.dev recommended for background jobs — pending founder confirmation. Voice Gateway confirmed to require a separate always-on WebSocket service (Netlify can't host persistent WebSockets); amends §6, not a Phase 1 blocker | Verified this session, §2a |
