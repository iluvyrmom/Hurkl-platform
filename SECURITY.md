# SECURITY.md — HURKL / Mason Security & Privacy

This document defines the security and privacy posture required before Mason handles any real customer data. It complements `ARCHITECTURE.md` (how systems are built) and `PRODUCT.md` (what Mason is allowed to do).

## 1. Tenant isolation

- Every tenant-scoped table (customers, leads, conversations, employees, calendars, services, prices, policies, approval thresholds, documents, communications, AI configuration, usage, billing, audit history) carries a `company_id`.
- Isolation is enforced with **Postgres Row-Level Security (RLS)** at the database layer, not only by application-level query filtering. Application bugs must not be able to leak cross-tenant data — the database itself refuses the query.
- Storage (documents, photos, call recordings) is partitioned per tenant with access rules mirroring RLS.
- No query path, report, or admin tool may join across tenants except a dedicated, explicitly audited HURKL-admin path used for platform support/billing — never the same code path tenants' own requests use.
- Tenant isolation must be covered by automated tests before any tenant's real data goes live (e.g., "user from Company A cannot read/write Company B's rows even via a crafted request").

## 2. Authentication

- Strong authentication for all human users (owners, employees, HURKL admins) via the platform's auth provider (see `ARCHITECTURE.md`).
- Passwords, if used, are never stored or logged in plaintext — delegated entirely to the auth provider.
- Session handling favors short-lived tokens with refresh, appropriate for mobile use (see the founder's Android-first workflow).

### MFA policy (founder-approved, mandatory before production launch)

MFA support must exist in the authentication layer well before this matters — the requirement below is about what's enforced by the time any real tenant goes live, not when the capability is technically buildable:

| Who | MFA requirement |
|---|---|
| HURKL platform administrators | **Mandatory** |
| Client business owners and administrators | **Mandatory** |
| Anyone with billing, data-export, security-configuration, or other broad administrative permissions | **Mandatory** |
| Ordinary employees with narrowly limited access (e.g., a technician who only sees assigned jobs) | Recommended, not initially mandatory |

"Before production launch" means: no real tenant's owner/admin account, and no HURKL admin account, goes live against real customer data without MFA enforced. This is a launch gate, not a someday-feature.

## 3. Authorization (RBAC)

Roles map directly to `PRODUCT.md`'s user roles:

| Role | Access |
|---|---|
| HURKL Platform Admin | Platform operations only (billing, incidents, abuse); no default access to tenant customer data |
| Business Owner | Full access within their own tenant only |
| Manager / Office Staff | Owner-delegated subset of owner access, within their own tenant only |
| Employee / Technician | Only what's needed for assigned work: schedule, relevant job/customer details, status updates — no payroll, no other employees' data, no business-wide financials |
| Customer | No standing account by default; access is the conversation itself plus any narrow customer-facing views (e.g., appointment confirmation) |

Authorization checks are enforced server-side, never trusted from client input, and layered on top of (not instead of) RLS.

## 4. Autonomy tiers (security-critical)

Mason's actions are classified into three tiers. This classification is a security control, not just a UX detail — it determines what code paths exist at all.

**Tier 1 — Automatic** (no human approval needed):
- Read and organize information
- Classify leads and communications
- Draft routine responses
- Check configured availability
- Update permitted internal records
- Produce summaries
- Perform low-risk configured workflows

**Tier 2 — Approval required** (Mason proposes, a human confirms before it executes):
- Unusual customer commitments
- Discounts
- Refunds
- High-value estimates or jobs
- Pricing exceptions
- Sensitive messages
- Production configuration changes
- Purchases or paid actions
- Bid submissions and other legally binding commitments (see `PRODUCT.md`'s Commercial Bid Centers capability) — unless a narrowly defined, pre-approved workflow has been explicitly configured by the owner, in which case it may run as Tier 1

**Tier 3 — Never autonomous** (hard-blocked in code, not policy-only):
- Transfer money
- Reveal private customer data outside authorized channels
- Disable security protections
- Delete critical business records
- Sign legal agreements
- Make irreversible decisions without authorization

Tier 3 actions must be structurally impossible for the AI Router/Conversation Engine to trigger on its own — e.g., no code path exists that both an AI decision and an unattended execution can both reach without a human in the loop. This is enforced in the Approval Engine, not left to prompting.

## 5. Secrets management

Never commit: API keys, passwords, tokens, customer data, private email content, ElevenLabs/voice credentials, telephony credentials, or any production secret. This applies to code, comments, commit messages, and documentation.

- All credentials live in environment variables locally and in the hosting provider's secret manager in staging/production.
- `.gitignore` excludes all `.env*` files and any local secret files by default (see `.gitignore`).
- Before every commit, diff what's staged and stop if anything resembling a credential, connection string, or real customer record appears.
- **Secret rotation:** credentials (Twilio, ElevenLabs, Claude/AI provider, database) should be rotatable without downtime — no secret is hardcoded anywhere that would require a code change to rotate.

## 6. Audit logs

Every meaningful autonomous action Mason takes is recorded in an append-only audit log, independent of general application logs, capturing: which tenant, which conversation/customer, what action, which autonomy tier it fell under, why (which policy/threshold applied), and what data was touched. Audit logs are retained per the data retention policy below and are visible to the relevant business owner in the Owner Portal ("Mason activity").

## 7. Rate limits & abuse prevention

- Per-tenant and per-channel rate limits (calls, SMS, emails, AI calls) to prevent runaway cost from a bug, abuse, or an unusually chatty caller.
- Usage & Cost Metering (see `ARCHITECTURE.md`) enforces owner-configured spending limits, alerts before a limit is reached (not only when it's hit), and can automatically slow down or pause Mason for a tenant that's approaching its limit.
- Hard caps on retries, loop iterations, concurrent background jobs, and AI requests/outbound messages per conversation are a required control (see `ARCHITECTURE.md` §2a cost guardrails) — this is a security control as much as a cost control, since an unbounded loop is also an availability and abuse risk.

## 8. Emergency pause & slowdown

Every tenant's owner has an always-available control to pause Mason entirely (fall back to voicemail/human-only) or slow it down (e.g., force more actions into Tier 2 approval) without needing HURKL support intervention. This must work quickly and reliably — it is a safety control, not a convenience feature.

## 9. External integration safety

- Idempotency keys on all external side effects (SMS send, calendar booking, payment action) so retries after a failure never double-book, double-charge, or double-message.
- Webhook signature verification for all inbound provider webhooks (telephony, SMS, payment, calendar).
- Timeouts, retries with backoff, and circuit breakers around every external provider call so one provider outage doesn't cascade into a full outage of Mason.

## 10. Backups, retention, and safe deletion

- Automated, regular backups of the primary database with point-in-time recovery.
- Deletion of customer or business data is soft-delete first (recoverable window) before any hard/irreversible delete, and hard deletes of "critical business records" fall under the Tier 3 "never autonomous" rule — a human authorizes it explicitly.

### Data retention defaults (founder-approved)

These are configurable defaults, not fixed constants — each is adjustable **per tenant** to accommodate that company's legal, contractual, or regulatory requirements (e.g., a tenant operating under a stricter state law or an industry-specific record-keeping rule). The platform must expose retention as tenant configuration, not a hardcoded value.

| Data type | Default retention |
|---|---|
| Customer conversations | 12 months |
| Call recordings | 90 days |
| Call transcripts and summaries | 12 months |
| Audit logs | 24 months |
| Failed integration and diagnostic logs | 90 days |
| Soft-deleted customer records | 30 days before permanent deletion, where legally permitted |
| Backups | Rolling 30-day retention |

Where a legal, contractual, or regulatory requirement conflicts with a default above (e.g., a jurisdiction requiring longer retention of call recordings, or a customer-initiated deletion request under applicable privacy law), the specific requirement overrides the default for that tenant/record, and the override itself should be recorded (what changed, why, and under what authority).

## 11. Incident handling

- Security-relevant errors and anomalies (auth failures, RLS denials, provider webhook signature failures, unexpected cross-tenant query attempts) are logged distinctly from routine errors so they can be monitored.
- A documented (even if informal, at pilot scale) path exists for the founder to be notified quickly of a suspected incident, and for Mason to be paused for the affected tenant(s) while it's investigated.
- Post-incident, what happened and what changed as a result should be recorded — this can start as a simple log entry and formalize later.

## 12. Privacy of customer data across channels

Because Mason maintains shared customer history across phone, website, text, and email, that combined record is more sensitive than any single channel's data would be alone. Treat the merged customer record with the same care as the most sensitive channel it includes (typically call transcripts/recordings and payment-adjacent information).

## 13. Open items requiring founder decision

- Formal incident response process once beyond pilot scale (informal/founder-notification process is acceptable for the pilot per §11).
- Any tenant-specific retention override required by that tenant's legal/regulatory environment, evaluated at onboarding time (defaults are set — see §10).

## 14. Resolved decisions log

| Decision | Resolution | Date |
|---|---|---|
| Data retention defaults | Set per §10 table; configurable per tenant | Founder approval, this session |
| MFA policy | Mandatory before production launch for HURKL admins, client owners/admins, and anyone with billing/data-export/security-config/broad admin permissions; recommended (not mandatory) for narrowly-scoped employees | Founder approval, this session |
