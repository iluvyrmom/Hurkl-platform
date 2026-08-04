# Communications architecture — Telegram, and the Communication Adapter pattern

Status: Telegram is the first working channel, built and tested — real code, real schema, reviewed exactly like the security foundation and migrations before it. **Not yet live**: no real `TELEGRAM_BOT_TOKEN` has been configured in this environment, and no real Telegram webhook has been registered (that needs a public deployment, which doesn't exist yet — see "What isn't done yet" below). Cross-referenced from `ARCHITECTURE.md` §3.

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

Every inbound message goes through the same eight steps, regardless of channel:

1. **Authenticate the sender** — `lib/communications/telegram-identity.ts#resolveTelegramSender` looks up the incoming Telegram numeric user id in `telegram_links`. Telegram has no password/OAuth flow for a bot DM, so a pre-registered allow-list *is* authentication here — trivially revocable (delete the row), and the correct, standard mechanism for a personal bot. An unrecognized sender's message is silently dropped — no reply, no company-scoped audit entry (there's no company to attach one to) — deliberately never confirming to a stranger that this bot exists or works.
2. **Identify the company/account** — the sender's own `company_id`, or the fixed internal company id if they're `hurkl_admin` (see above).
3. **Find or create the conversation** — one row per `(channel, external_conversation_id)` in `conversations`.
4. **Preserve conversation history** — the inbound message is persisted in `messages` before Mason is even called.
5. **Audit log the receipt** — `tier_1_automatic`, action `message_received` (see `lib/mason/risk.ts` — receiving and replying to a message is squarely low-risk; nothing here reaches medium/high risk categories or a HAL specialist).
6. **Route to Mason** — `lib/mason/model-routing.ts#routeModelTier` classifies the task, then `AIModelProvider#complete` generates the response.
7. **Preserve Mason's response** — the outbound message is persisted in `messages` too.
8. **Respond through the channel** — `CommunicationAdapter#send()`, then a second audit log entry (`message_sent`).

## What stays deliberately mocked

**Mason's actual reasoning uses `MockAIModelProvider` by default.** A real Anthropic API call costs real money and needs its own explicit approval — `ANTHROPIC_API_KEY` plus a conscious decision — per the standing cost policy (`CLAUDE.md`, `ARCHITECTURE.md` §2a). This task does not silently start spending on Claude calls as a side effect of wiring up Telegram. The loop is fully real end-to-end (Telegram ↔ HURKL ↔ audit ↔ history); only Mason's "brain" is a clearly-labeled placeholder (`[mock low_cost response] <echoed text>`) until that separate approval happens. Swapping in a real provider later requires no changes here — just constructing a real `AIModelProvider` implementation and passing it as `receiveMessage`'s `aiModel` dependency instead of relying on the default.

## What isn't done yet

- **No real webhook is registered with Telegram.** `app/api/telegram/webhook/route.ts` is the production-shaped path — it's built, tested, and ready — but Telegram's `setWebhook` needs a public HTTPS URL, and nothing is deployed yet (`ARCHITECTURE.md` §6/Phase 8 territory). Once a deployment exists, registering the webhook (with `TELEGRAM_WEBHOOK_SECRET` set, checked against Telegram's `X-Telegram-Bot-Api-Secret-Token` header) is the only remaining step — no code changes.
- **`scripts/telegram-dev-bridge.ts` is how to actually run this live today**, without deployment: it long-polls Telegram's `getUpdates` and feeds each update into the exact same `receiveMessage()` pipeline the webhook route uses. See `docs/development.md` for how to run it. Manual dev tool only — never run in CI, never deployed.
- **The founder's own Telegram account isn't linked yet.** `scripts/telegram-link-owner.ts` is a one-time, manually-run bootstrap (not a self-service or in-app flow — `telegram_links` has no RLS policies for the ordinary `authenticated` role at all, by design, since linking a Telegram identity to a HURKL identity is a sensitive action). It also requires a `profiles` row with `role = 'hurkl_admin'` to already exist, which is itself a manual one-time SQL step — deliberately not automated, since no code path should be able to self-promote a user to platform-admin. Both are documented in `docs/development.md`.
- **No SMS/Email/Voice/Web adapters** — the interface is built so they can plug in later; none are implemented now.
- **No HAL specialist involvement, no autonomous actions beyond "log and reply."** Every action in this pipeline is `tier_1_automatic` — receiving and replying to a message. This is unrelated to, and does not change, the standing "no autonomous production agents" decision from Knowledge Capture Session 009.

## Schema

See `supabase/migrations/00000000000004_communications.sql` for the full definitions (`conversations`, `messages`, `telegram_links`, the seeded internal company row, and their RLS policies) — reviewed with the same discipline as every prior migration this project has shipped: schema table, RLS coverage, destructive-behavior check, verified against a local disposable Postgres. **Not applied to the real `Hurkl-production` project** — that stays gated on the separate, already-established migration-plan process (`docs/production-migration-plan.md`), unchanged by this work.
