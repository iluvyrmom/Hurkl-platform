# Communications architecture — Telegram, and the Communication Adapter pattern

Status: **Live as of 2026-08-06; real Mason reasoning code shipped 2026-08-10, live test pending funded billing.** Telegram is the first working channel — real code, real schema, reviewed exactly like the security foundation and migrations before it — deployed to Netlify (`hurkl-platform.netlify.app`), a real `TELEGRAM_BOT_TOKEN` configured, a real webhook registered with Telegram, and the founder's own Telegram account linked to his `hurkl_admin` profile in the real `Hurkl-production` database. The founder sent a real message to `M_Hurklbot` and received Mason's (at the time, mocked) reply back through the full pipeline. See "Production incident, 2026-08-06" below for what broke on the way there and how it was fixed, and "Real Mason reasoning" below for the current state: real Anthropic reasoning code is deployed and a real `ANTHROPIC_API_KEY` is configured, but the Anthropic account has zero funded credits as of 2026-08-10 — **no real end-to-end reasoning test has succeeded yet.** Cross-referenced from `ARCHITECTURE.md` §3.

## Why this exists

The founder asked for the first real, working loop between a human and Mason: Owner → Telegram → HURKL Platform → Mason → back through Telegram — using the existing "Mason Herkle" Telegram bot as the founder's own internal/dev channel, not a customer-facing one. This is explicitly ahead of `ROADMAP.md`'s numbered phase sequence (it pulls a slice of Phase 4's conversation records and Phase 6's text-based Mason forward, deliberately) — see the status note added to `ROADMAP.md`.

## Internal vs. customer-facing: how they're kept separate

`PRODUCT.md`'s customer-facing channel list is phone, website, SMS, and email — **Telegram appears nowhere in it**. This Telegram bot is the founder's own channel for talking to Mason about the platform itself, not something a real tenant's customer ever sees or uses.

That separation is structural, not just a convention:

- A fixed, seeded `companies` row — `id = 00000000-0000-0000-0000-000000000001`, `name = 'HURKL (Internal)'` (`supabase/migrations/00000000000004_communications.sql`) — is the company every internal conversation attaches to. It is never a real tenant. As of `docs/internal-ownership-system.md`, this same company is also formally classified `account_type = 'internal_hurkl'`, which is what keeps it (and the founder's own owner account) out of the billing system entirely once one exists.
- The founder's own HURKL identity is a `profiles` row with `role = 'hurkl_admin'` and `company_id = null` — the same role/shape every existing RLS policy already gives full cross-tenant read/write to (`current_company_id() = ... OR is_hurkl_admin()`). No new RLS mechanism, no new RBAC concept — the founder reads and writes the internal company's conversations through the exact same admin bypass that already lets `hurkl_admin` read across real tenants.
- When a real tenant eventually gets a channel (their own Telegram, or SMS/email/etc.), their conversations carry their own real `company_id` and are automatically isolated from the internal HURKL company's conversations by the same RLS that already isolates `customers` and `audit_log` per tenant.

## The Communication Adapter pattern

`CommunicationAdapter` (`lib/communications/adapter.ts`) is outbound-only by design:

```ts
interface CommunicationAdapter {
  readonly channel: Channel; // "telegram", extendable
  send(message: OutboundMessage): Promise<OutboundSendResult>;
}
```

Inbound delivery is inherently channel-specific — a webhook push (Telegram, SMS), a live audio stream (Voice), an HTTP request/response (a web widget) — so there's no single "receive" method on the interface itself. Instead, every channel's own thin entry point normalizes whatever it received into one shared shape, `InboundMessage`, and calls the one shared pipeline function. This matches `ARCHITECTURE.md` §3's existing "Channel Gateways → normalized conversation event → Conversation Engine" design; Telegram is the first channel to actually implement it, not a special case.

Adding a future channel (SMS, Email, Voice, Web, Mobile App) means: implement `CommunicationAdapter` for that channel, add its own webhook/entry-point route that builds an `InboundMessage`, and call the existing `receiveMessage()` pipeline. **Nothing in `lib/communications/inbound.ts` needs to change.**

## The pipeline (`lib/communications/inbound.ts#receiveMessage`)

Every inbound message goes through the same nine steps, regardless of channel:

1. **Authenticate the sender** — `lib/communications/telegram-identity.ts#resolveTelegramSender` looks up the incoming Telegram numeric user id in `telegram_links`. Telegram has no password/OAuth flow for a bot DM, so a pre-registered allow-list *is* authentication here — trivially revocable (delete the row), and the correct, standard mechanism for a personal bot. An unrecognized sender's message is silently dropped — no reply, no company-scoped audit entry (there's no company to attach one to) — deliberately never confirming to a stranger that this bot exists or works. Company, role, and sender identity all come from this DB lookup, never from anything Telegram-supplied in the message payload.
2. **Identify the company/account** — the sender's own `company_id`, or the fixed internal company id if they're `hurkl_admin` (see above).
3. **Find or create the conversation** — one row per `(channel, external_conversation_id)` in `conversations`.
4. **Fetch recent history** — the last 10 messages in this conversation (best-effort; a lookup failure degrades to no history rather than blocking the reply), used as multi-turn context for Mason.
5. **Preserve the inbound message** — persisted in `messages` before Mason is even called. This is also where duplicate-delivery protection lives: the channel's own message id is stored as `external_message_id`, and a unique index on `(conversation_id, direction, external_message_id)` means a redelivered update (Telegram's at-least-once webhook semantics) is dropped here — no second AI call, no second reply.
6. **Audit log the receipt** — `tier_1_automatic`, action `message_received` (see `lib/mason/risk.ts` — receiving and replying to a message is squarely low-risk; nothing here reaches medium/high risk categories or a HAL specialist).
7. **Route to Mason** — `lib/mason/task-classification.ts` classifies the message, `lib/mason/model-routing.ts#routeModelTier` maps that to a cost tier, then the hard spend guard (`lib/mason/spend-guard.ts`) is checked before any Anthropic request is made — see "Hard Anthropic spend guard" below. If it passes, `AIModelProvider#complete` generates the response using `lib/mason/system-prompt.ts`'s centralized prompt. A reasoning failure here falls back to a safe, labeled reply rather than corrupting the conversation or throwing (see "Real Mason reasoning" below).
8. **Preserve Mason's response** — persisted in `messages`, including which model/tier answered, real token counts, an estimated cost, and latency.
9. **Respond through the channel** — `CommunicationAdapter#send()`, then a second audit log entry (`message_sent`) carrying the same usage metadata.

## Real Mason reasoning

**Status: code shipped 2026-08-10, founder-authorized; live end-to-end test still pending funded Anthropic billing.** `lib/mason/providers/anthropic-model-provider.ts` implements `AIModelProvider` against the real Anthropic Messages API (plain `fetch`, no new SDK dependency — matching this repo's lightweight-provider style). `lib/mason/providers/get-ai-model-provider.ts` is the one place that decides real vs. mock: `MockAIModelProvider` unless `ANTHROPIC_API_KEY` is set, the same pattern every other real provider in this repo follows. The key is now configured in Netlify's encrypted production environment — but **the Anthropic account has zero funded credits as of 2026-08-10, so no real request has succeeded yet.** Until it's funded, real requests will fail and the pipeline's failure fallback (step 7 above) will send a safe "having trouble responding" reply — not mock text, but not real reasoning either. Don't confuse a fallback reply with a successful test.

**Model routing and cost controls** (see `lib/mason/model-config.ts`, `lib/mason/task-classification.ts`, `lib/mason/providers/anthropic-model-provider.ts`):
- Model selection is entirely tier-driven — `model-config.ts` is the *only* place a tier maps to a real model ID (`low_cost` → `claude-haiku-4-5`, `advanced_reasoning` → `claude-sonnet-5`). No call site hardcodes a model.
- `task-classification.ts` is a deliberately simple, deterministic v1 heuristic: ordinary messages default to the cheap tier; only an explicit complexity signal word (e.g. "strategy", "recommend", "compare") escalates to `advanced_reasoning`. Message length alone is deliberately **not** a trigger — a long but ordinary customer message (e.g. someone typing out full job details) stays on the cheap tier; only genuine complexity escalates. Not a trained classifier — revisit once real usage data exists.
- Per-tier output-token caps, and input truncation (current message and each history turn, independent of the 10-message history cap above) bound both ends of the cost.
- 20-second request timeout; at most one retry, only on network failure/429/5xx — never on 4xx.
- Every response reports real `input_tokens`/`output_tokens` from Anthropic's own usage field and an estimated USD cost (`lib/mason/model-config.ts#estimateCostUsd` — pricing is for estimation only, not billing-accurate; see that file's header for when it needs re-verifying).
- `supabase/migrations/00000000000007_mason_reasoning.sql` adds `model_tier`/`model_id`/`input_tokens`/`output_tokens`/`estimated_cost_usd`/`latency_ms` to `messages`, so usage is attributable per company (via the existing `company_id` column) once more than one company has a channel — no separate metering service was built for this; that's still `ARCHITECTURE.md` §3's "Usage & Cost Metering" service, not yet built.
- Structured logging (`console.error` on failures) never includes prompt/response text or the API key — only status codes, error types, model id, and token counts.
- There is no recursive or agentic loop in this pipeline — receiveMessage never calls itself or spawns further agent calls — so there is nothing beyond the provider's own bounded retry to protect against a runaway loop.

**Mason stays one system.** `lib/mason/system-prompt.ts#buildMasonSystemPrompt` is the single system-prompt builder — the same function every channel's `receiveMessage()` call already uses, taking only channel-neutral context (company name, whether this is the internal HURKL channel, sender name/role). There is no Telegram-specific prompt anywhere; a future SMS/Email/Voice/Web channel calls the exact same function.

## Discretionary discount authority and owner escalation

**Status: shipped 2026-08-13 (Knowledge Capture Session 010), founder-directed correction.** A real production conversation showed Mason (1) reflexively pointing customers at the owner's phone/email whenever it hit uncertainty, and (2) inventing a flat "$75 discount off the flat rate" with no verified price behind it — a fabricated business policy. This section is the fix, built entirely inside the existing pipeline/prompt/risk architecture — no second policy engine, no HAL specialist execution, no new autonomy tier.

**Discretionary discount authority** (`lib/mason/discount-authority.ts`, `companies.discretionary_discount_max_percent`): `risk.ts` already classified `apply_discount` as medium risk / Tier 2 (Approval Required) and documented that "a tenant may configure a narrowly-scoped, pre-approved workflow that runs a specific medium-risk action at Tier 1 instead" — this is the first real implementation of that carve-out (see `SECURITY.md` §4). Every company gets the column, defaulted to `0` (no discretion) until its own owner configures otherwise (A-1 is seeded at `5` — `supabase/migrations/00000000000009_mason_discount_authority_and_escalations.sql`); `DISCRETIONARY_DISCOUNT_HARD_CEILING_PERCENT = 5` in code additionally clamps any configured value at runtime, so raising the ceiling itself requires a deliberate code change, never a configuration edit.

**Prompt behavior** (`lib/mason/system-prompt.ts#buildMasonSystemPrompt`, new `discountAuthority`/`ownerPhone`/`ownerEmail`/`customerRequestedOwnerContact` fields): Mason is told its authority is discretion, not an entitlement — prefer no discount, never automatically offer the maximum, be especially conservative on a small/minimum-size job, and never state a flat dollar discount that isn't derived from a real established price and a real in-authority percentage. The office-manager-not-directory framing tells Mason to try to resolve things itself and treat owner escalation as the exception; owner contact info (now pulled from the real `companies.phone`/`email` columns, previously never read by this pipeline at all) is only to be volunteered when the customer explicitly asks, the situation genuinely requires it, a business rule requires it, or there's no other way to help them.

**The deterministic backstop — `lib/mason/critical-review.ts#reviewMasonReply`:** prompt instructions alone were exactly what failed in the reported incident, so every real model reply is checked before it can reach a customer (`lib/communications/inbound.ts`, right after `aiModel.complete()` succeeds). It catches (a) any specific dollar-figure discount claim — presumptively fabricated today, since no verified price data reaches Mason through this pipeline at all — and (b) any percentage discount claim above the company's actual configured ceiling. A caught violation swaps the reply for a safe, generic fallback, records `audit_log` action `reply_blocked_by_critical_review`, and writes a real `owner_escalations` row. This also finally wires up `lib/mason/identity.ts#violatesIdentityRules`, written previously but never called by the live pipeline.

**Owner escalations — `lib/mason/escalation.ts`, `owner_escalations` table:** a real, durable place Mason hands a conversation to the owner instead of reflexively surfacing a phone number. Two deterministic triggers, independent of what Mason's reply text says: a critical-review catch (above), and `requiresOwnerApproval()` — a keyword heuristic (damage, refund, legal, complaint, etc.) checked against every inbound message, matching `task-classification.ts`'s existing style. Mason still replies and keeps helping either way — creating the escalation is additive, never a replacement for a normal reply. Only this pipeline's own service-role client ever writes to this table (no public/anonymous path), so it has no INSERT policy for any role, the same reasoning `leads` already uses.

**What this deliberately is not:** `lib/domain/hal.ts`'s specialist contracts remain types-only, per Knowledge Capture Session 009 — `reviewMasonReply` is a narrow, pure text-safety function, not a HAL "Critical Review Specialist" execution. There is still no tool-use/function-calling wired to the model (a plain system+messages completion, per "Real Mason reasoning" above), which is exactly why the critical-review backstop has to work on the model's free text rather than intercepting a structured "apply discount" call — there is no such call to intercept yet.

**Tests:** `lib/mason/discount-authority.test.ts`, `lib/mason/escalation.test.ts`, and `lib/mason/critical-review.test.ts` cover the pure logic in isolation (including a direct reproduction of the reported `$75` incident). `lib/mason/system-prompt.test.ts` asserts the exact prompt language for every behavior above. `lib/communications/inbound.test.ts`'s "discount authority and owner escalation" suite proves it end-to-end through the real pipeline with a fake admin client — the company lookup, the blocked reply, the escalation row, and the audit entry all wired together, not just unit-tested in isolation. `lib/db/owner-escalations.integration.test.ts` proves the RLS/CHECK-constraint behavior against a real local Postgres.

## Hard Anthropic spend guard

**Status: shipped 2026-08-11, checked before every real Anthropic request, any tier, any sender.** Real reasoning being wired up (above) means an unexpected traffic spike, routing bug, retry issue, abusive sender, or classifier mistake could otherwise create an unlimited API bill. `lib/mason/spend-guard.ts` and `lib/mason/budget-config.ts` add one hard server-side ceiling on top of the per-tier/per-request cost controls already described above.

**Configuration** (`lib/mason/budget-config.ts#getSpendCeilings`) — four independent, server-side-only environment variables, each with a conservative default if unset:

| Variable | Default | Scope |
|---|---|---|
| `ANTHROPIC_DAILY_SPEND_CEILING_USD` | $5/day | HURKL-wide |
| `ANTHROPIC_MONTHLY_SPEND_CEILING_USD` | $50/month | HURKL-wide |
| `ANTHROPIC_COMPANY_DAILY_SPEND_CEILING_USD` | $2/day | per company |
| `ANTHROPIC_COMPANY_MONTHLY_SPEND_CEILING_USD` | $20/month | per company |

There is no client-reachable way to read or change any of these — they're plain server environment variables, validated the same way as every other field in `lib/env.ts`, and any future override requires a conscious, server-side config change (not a runtime toggle), which is itself audited the same way any other deploy is.

**Two gates, checked in `lib/communications/inbound.ts#receiveMessage` (step 7 above), before any Anthropic call is attempted:**
1. **Gate A — `evaluateBudget`.** Sums actual `messages.estimated_cost_usd` since the start of the current UTC day and UTC month (`lib/mason/spend-guard.ts#getBudgetStatus`), both HURKL-wide (every company) and for the message's own company, and compares against all four ceilings. If **any** ceiling is already met (`>=`, not just exceeded — a ceiling is a hard cap, not a target), the request is blocked outright: no Anthropic call is made, the pipeline returns the existing controlled fallback reply (the same "having trouble responding" text used for a real provider failure), the outbound message row is tagged `model_id: "budget_limit"`, and an `audit_log` entry with action `message_budget_blocked` is recorded (metadata includes which ceiling tripped). This is recorded as a budget *refusal*, and is never counted as a provider failure in logs or audit history — the two are deliberately distinguishable.
2. **Gate B — `wouldExceedBudgetForAdvancedReasoning`.** Only reached once Gate A passes. For an `advanced_reasoning`-tier message specifically, estimates the projected cost of *this one call* (a rough 4-characters-per-token heuristic over the assembled system prompt + message + history, priced via the same `model-config.ts#estimateCostUsd` used for real usage accounting) and, if that projected cost would newly tip any ceiling, downgrades just this call to `low_cost` rather than blocking it — advanced reasoning stays available for the next message once there's headroom again, and the sender still gets an answer instead of a refusal.

No sender identity is exempt from either gate, including `hurkl_admin`/the founder's own messages on the internal channel — there is no bypass path in the code, silent or otherwise; the pipeline runs both gates unconditionally regardless of who sent the message.

**Sanitized operational status** — `GET /api/mason/budget-status` (`hurkl_admin`-only; a manual role check, since `requireCompanyProfile` would incorrectly reject `hurkl_admin` callers who have `company_id = null` by design) returns only aggregate numbers: spent/ceiling for each of the four buckets, whether a limit is currently reached, and which one — never message content, never secrets, nothing that could be used to change a limit.

**Tests:** `lib/mason/budget-config.test.ts` and `lib/mason/spend-guard.test.ts` cover the pure decision logic (`evaluateBudget`, `wouldExceedBudgetForAdvancedReasoning`) and the real aggregation logic (`getBudgetStatus` — including a regression test proving the HURKL-wide sums are genuinely distinct from, not aliased to, one company's sums). `lib/communications/inbound.test.ts` covers both gates end-to-end against the full pipeline: a blocked call producing the fallback reply with no Anthropic request attempted, and a downgraded `advanced_reasoning` call actually reaching the AI model at the cheaper tier.

No new migration was needed — the guard reads the `estimated_cost_usd`/`created_at`/`company_id` columns `00000000000007_mason_reasoning.sql` already added to `messages`.

## Production incident, 2026-08-06

The first live test (founder messaging `M_Hurklbot` after deployment + webhook registration) returned no reply. Root cause, found via a temporary browser-visitable debug route and direct SQL inspection of `Hurkl-production`:

**Every table in the `Hurkl-production` database had only structural privileges (`TRIGGER`/`TRUNCATE`/`REFERENCES`) for `anon`, `authenticated`, and `service_role` — no `SELECT`/`INSERT`/`UPDATE`/`DELETE` at all.** Every prior migration had assumed a Supabase project grants these natively as part of its own bootstrap (true for a project created through Supabase's normal flow, and explicitly documented as an assumption in `lib/db/test-support/local-role-grants.sql`'s comment) — that assumption was false for this project. Row-Level Security was never the problem; the database roles never had table-level access to begin with, so the real webhook request (correctly authenticated as `service_role`) got Postgres error 42501 ("permission denied for table telegram_links"). `lib/communications/telegram-identity.ts` treated that query error identically to "no matching row found," so it silently dropped the message as an unrecognized sender instead of surfacing a real error — masking the actual bug during initial troubleshooting.

Fixed in two parts:
1. Applied directly to `Hurkl-production` via SQL during live debugging (immediate unblock).
2. Captured permanently as `supabase/migrations/00000000000006_grant_table_privileges.sql` (idempotent — safe to run against a project that already has these natively) so this can't silently recur on this or any future Supabase project, plus `ALTER DEFAULT PRIVILEGES` so it doesn't recur on tables created by later migrations either. The local test harness (`lib/db/test-support/`) now creates real `anon`/`service_role` role stubs (previously only `authenticated` existed locally), so this exact class of bug is now caught by integration tests rather than only in production.

A secondary process note: several commits during this incident (the diagnostic logging, the temporary debug route, and this fix) were pushed directly to `main` rather than through a branch/PR, a deliberate deviation from this project's normal workflow (`CLAUDE.md`'s "Use branches") made to keep live debugging with the founder moving. Flagged here rather than left unmentioned.

## What isn't done yet

- **The Anthropic account has no funded credits.** `ANTHROPIC_API_KEY` is configured and the real provider code is deployed, but no real reasoning request has succeeded yet — see "Real Mason reasoning" above. This is the one remaining step to close out Phase 6.
- **No SMS/Email/Voice/Web adapters** — the interface is built so they can plug in later; none are implemented now.
- **No HAL specialist involvement, no autonomous actions beyond "log and reply" plus a bounded, owner-configured discretionary discount.** Every action in this pipeline is `tier_1_automatic` — receiving/replying to a message, and (per the new "Discretionary discount authority and owner escalation" section above) discounting within an owner-configured, hard-capped ceiling, which is the documented Tier-2-by-default exception SECURITY.md §4 already anticipated, not a new tier. This is unrelated to, and does not change, the standing "no autonomous production agents" decision from Knowledge Capture Session 009 — `reviewMasonReply` is a pure text-safety check, not specialist execution.

`scripts/telegram-dev-bridge.ts` (long-polling, no deployment needed) and `scripts/telegram-link-owner.ts` (one-time Telegram-identity bootstrap) remain available and documented in `docs/development.md`, but are no longer the only way to run this — the real webhook path is now live.

## Schema

See `supabase/migrations/00000000000004_communications.sql` for the full definitions (`conversations`, `messages`, `telegram_links`, the seeded internal company row, and their RLS policies), `00000000000006_grant_table_privileges.sql` for the table-privilege fix above, `00000000000007_mason_reasoning.sql` for the usage-accounting columns and duplicate-request dedupe index, and `00000000000009_mason_discount_authority_and_escalations.sql` for `companies.discretionary_discount_max_percent` and the `owner_escalations` table (see "Discretionary discount authority and owner escalation" above) — all reviewed with the same discipline as every prior migration this project has shipped: schema table, RLS coverage, destructive-behavior check, verified against a local disposable Postgres. **All four are applied to the real `Hurkl-production` project** (migrations 4 and 6 as of 2026-08-06, migration 7 as of 2026-08-10, migration 9 as of 2026-08-13).
