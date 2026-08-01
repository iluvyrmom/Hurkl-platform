# ARCHITECTURE.md — HURKL / Mason Technical Architecture

Status: recommendation, not yet approved. Everything in this document is a proposal for the founder to accept, amend, or reject before any scaffolding begins. Nothing here has been implemented. See PRODUCT.md for what the system must do; this document is how.

---

## 1. Guiding constraints (from product requirements)

- Multi-tenant from day one; tenant isolation is a security requirement, not a nice-to-have.
- Provider-independent where practical: AI model provider, voice/TTS provider, STT provider, telephony/SMS provider, database/hosting provider must all be swappable behind typed interfaces.
- Cost-controlled AI usage: cheap models for routine work, expensive models only for genuinely hard reasoning, with owner-configurable spending limits.
- Auditable: every meaningful autonomous action logged.
- Mobile-friendly: the founder and business owners operate primarily from Android phones/tablets.
- Reliable during failures: external integrations (telephony, AI providers, email) will fail sometimes; the system must degrade gracefully, not silently drop customer conversations.
- Configuration over hardcoding: industry-specific and even company-specific behavior lives in tenant config, not in platform code branches.

## 2. Recommended stack (proposal — requires founder sign-off)

| Layer | Recommendation | Why | Alternatives considered |
|---|---|---|---|
| Language | TypeScript everywhere (web, API, background jobs) | One language across the stack lowers cognitive load for a small/solo dev team, strong typing supports the "typed provider interface" requirement, huge ecosystem for AI/telephony SDKs | Python (better for some AI tooling, but splits the stack); Go (great for services, weaker for a founder-operated fast-moving product) |
| Web framework | Next.js (App Router) | Full-stack in one framework (UI + API routes + server actions), strong TypeScript support, deploys cleanly to Vercel or Netlify, large talent/AI-assistance surface since it's extremely well-documented | Remix (similar tradeoffs, smaller ecosystem); SvelteKit (lighter, less AI/agent tooling precedent); separate Express API + React SPA (more moving parts, more to operate) |
| Database | PostgreSQL | Required by the "row-level tenant security" principle — Postgres Row-Level Security (RLS) is the most mature, battle-tested mechanism for enforcing multi-tenant isolation at the database layer, not just in application code | MySQL/PlanetScale (no native RLS equivalent); MongoDB (no RLS, weaker fit for relational business data like jobs/estimates/schedules) |
| DB + Auth hosting | Supabase (managed Postgres + Auth + Storage + RLS + Realtime) | Ships Postgres RLS, auth, and storage as one managed product — directly matches the RLS-based tenant isolation requirement, fast to stand up for a pilot, this account already has Lovable/Supabase-adjacent tooling available | Self-managed Postgres on Fly.io/Render + a separate auth provider (more control, meaningfully more operational burden for a one-person-operated pilot); Neon (good Postgres, no built-in auth/RLS tooling) |
| Background jobs / durable workflows | Trigger.dev or Inngest (event-driven, retry-aware job runner) | Telephony webhooks, call summarization, follow-ups, and reminders all need reliable async processing with retries and idempotency — hand-rolled cron/queues would re-invent this | Plain Postgres-backed queue (pg-boss) — viable cheaper fallback for pilot-scale volume, more manual retry/observability work; AWS SQS/Lambda (more infra to operate) |
| AI provider | Anthropic Claude, behind an `AIModelProvider` interface | Strong reasoning-per-dollar, tiered model family (a low-cost tier for routine classification/replies, a high-capability tier for hard reasoning) fits the cost-routing requirement directly | OpenAI, Google Gemini — both viable and should be swappable later; not chosen as default only because Claude's tiering and instruction-following fit the office-manager persona work well today |
| Voice output (TTS) | ElevenLabs, behind a `TTSProvider` interface | Mason's custom voice already exists in ElevenLabs (founder-confirmed) | N/A — already decided by founder; interface exists so it's replaceable if ElevenLabs pricing/availability changes |
| Speech-to-text | Deepgram (proposed), behind an `STTProvider` interface | Low-latency streaming STT with good pricing for phone-call volumes | AssemblyAI, Google STT — both fit the same interface, swappable without touching call logic |
| Telephony / SMS | Twilio (proposed), behind a `TelephonyProvider` / `SMSProvider` interface | Mature call-forwarding, programmable voice (media streams for real-time STT/TTS), SMS, and multi-simultaneous-call support; widest documentation surface | Vonage, Telnyx — both viable, same interface |
| Email | Resend or Postmark (proposed), behind an `EmailProvider` interface | Simple transactional + conversational email APIs, reasonable pilot pricing | SendGrid, AWS SES — same interface |
| Hosting (web/API) | Vercel or Netlify | Zero-ops deploys for Next.js, preview environments per branch, this account already has Netlify access | Self-managed containers (more control, more ops burden not justified at pilot scale) |
| Error tracking / logging | Sentry + structured logging (pino or similar) | Fast to wire up, distinguishes real incidents from noise | — |
| Testing | Vitest (unit/integration) + Playwright (end-to-end) | Standard, well-supported in the TS/Next.js ecosystem | — |
| Feature flags | Simple DB-backed flags table for pilot; revisit a dedicated flag service only if complexity demands it | Avoids adding a new vendor before it's needed | GrowthBook, LaunchDarkly — reasonable later additions |

**Open decision for the founder:** this account already has an active Lovable workspace (AI app-builder) and an active Netlify hosting account (currently used for an unrelated site, `a-1bestmoving`). Building Mason as a hand-coded repository (this recommendation) versus building it inside Lovable's builder platform are both viable paths with different tradeoffs (code ownership and provider flexibility vs. speed of iteration). This document assumes a hand-coded repository per the technical principles given (typed provider interfaces, RLS, background jobs), but this choice should be explicitly confirmed, not assumed.

### Estimated monthly cost during pilot (single tenant, A-1 Best Moving, light-moderate call volume)

These are rough planning estimates, not quotes, and should be revisited once real usage data exists:

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

## 4. Multi-tenant strategy

- Single Postgres database (simplest to operate correctly at pilot scale; revisit only if a compliance or scale requirement forces per-tenant databases later).
- Every tenant-scoped table (customers, leads, conversations, employees, calendars, services, prices, policies, approval thresholds, documents, communications, AI configuration, usage, billing, audit history) carries a `company_id` column.
- **Postgres Row-Level Security (RLS) enforces isolation at the database layer** — not just application-layer filtering — so a bug in application code cannot leak one tenant's data to another. This is defense-in-depth, matching the "no company must ever access another company's information" requirement.
- Storage (documents, photos, call recordings) is partitioned per tenant (separate storage prefixes/buckets), with access rules mirroring RLS.
- Cross-tenant HURKL admin access (for support/billing) goes through a separate, explicitly audited admin path — never through the same query paths tenants use.

## 5. AI model routing (cost control)

- Every AI task is classified before it's dispatched: routine (classification, drafting a standard reply, checking configured availability, summarization) vs. deep-reasoning (complex estimate, unusual objection, ambiguous multi-step request, escalation judgment call).
- Routine tasks default to the lowest-cost capable model tier. Deep-reasoning tasks escalate to a higher-capability tier, and only when the router (or the routine-tier model itself) determines it's warranted.
- Every routing decision, token count, and estimated cost is logged per tenant.
- Owners configure, per company: which model provider is active, usage/spending limits, whether deep-reasoning escalation is allowed at all, and what happens when a limit is hit (slow down, pause, or notify-only).
- The router is a thin, replaceable layer — the underlying `AIModelProvider` interface means swapping or adding a provider (OpenAI, Google, others) does not touch conversation logic.

## 6. Voice & phone pipeline

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

- Whether to build in this repository versus inside Lovable's builder (flagged above — needs founder decision).
- Exact provider contracts/API versions — decided when each provider integration is actually built, against the typed interface defined here.
- Native mobile app vs. responsive/PWA web app for the founder's Android usage — recommendation is a mobile-friendly responsive web app first (faster iteration, one codebase), revisit a native app only if push notifications or offline behavior demand it.
