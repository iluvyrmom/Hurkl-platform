-- Real Mason reasoning (Anthropic) — usage accounting + duplicate-
-- request protection. See docs/communications-architecture.md's "Real
-- Mason reasoning" section for the full design and cost-control
-- rationale (Knowledge Capture, 2026-08-10).

-- Per-request usage accounting and company-level attribution: every
-- AI-generated outbound message records which model tier/id answered
-- it, real token counts from the provider's own response, and an
-- estimated cost. company_id (already on this table since migration 4)
-- is what makes this attributable per company once more than one
-- company has a channel.
alter table public.messages
  add column model_tier text,
  add column model_id text,
  add column input_tokens integer,
  add column output_tokens integer,
  add column estimated_cost_usd numeric(10, 6),
  add column latency_ms integer;

alter table public.messages
  add constraint messages_model_tier_check
  check (model_tier is null or model_tier in ('low_cost', 'advanced_reasoning'));

-- Duplicate-request protection: Telegram (and any future channel) can
-- redeliver the same inbound message more than once (webhook retries,
-- at-least-once delivery semantics). Without this, a redelivered
-- message would silently trigger a second AI call and a second reply —
-- both a real cost-control gap and a confusing user experience.
-- lib/communications/inbound.ts inserts the inbound row with the
-- channel's own message id as external_message_id and catches the
-- unique-violation this constraint raises, treating it as an
-- already-handled duplicate rather than processing it again. NULL
-- external_message_id values are never considered duplicates of each
-- other (ordinary partial-unique-index semantics), so channels that
-- don't supply a message id are unaffected.
create unique index messages_dedupe_idx
  on public.messages (conversation_id, direction, external_message_id)
  where external_message_id is not null;
