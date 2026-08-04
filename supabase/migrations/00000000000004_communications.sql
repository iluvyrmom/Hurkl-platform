-- Communication channels: conversations, messages, and the first
-- channel-specific identity link (Telegram). See
-- docs/communications-architecture.md for the full design and
-- ARCHITECTURE.md §3's Channel Gateways.
--
-- Reuses the existing RBAC/RLS model exactly — no new authentication
-- mechanism, no new tenant-isolation mechanism. A `hurkl_admin` profile
-- already bypasses company_id matching in every existing policy
-- (`current_company_id() OR is_hurkl_admin()`), so the founder's own
-- internal conversations with Mason use that same bypass against a
-- dedicated, non-customer "HURKL (Internal)" company row — never a
-- real tenant's company_id — which is what keeps internal development
-- communications structurally separate from future customer-facing
-- ones (requirement 4 of the Telegram integration task).

-- Well-known, fixed id for the internal pseudo-company. Deterministic
-- and replayable like every other migration — inserting a stable seed
-- row here (rather than looking it up by name at runtime) lets
-- application code reference it directly. See
-- lib/communications/internal-company.ts.
insert into public.companies (id, name)
values ('00000000-0000-0000-0000-000000000001', 'HURKL (Internal)')
on conflict (id) do nothing;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  -- CHECK list, not an enum: channels are expected to grow (SMS, Email,
  -- Voice, Web, Mobile App per the Communication Adapter requirement),
  -- and a CHECK list avoids an ALTER TYPE for each new one — same
  -- reasoning as audit_log.autonomy_tier's CHECK list.
  channel text not null check (channel in ('telegram')),
  external_conversation_id text not null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (channel, external_conversation_id)
);

create index conversations_company_id_idx on public.conversations (company_id);

alter table public.conversations enable row level security;

create policy conversations_select_own_company on public.conversations
for select
using (
  company_id = public.current_company_id()
  or public.is_hurkl_admin()
);

create policy conversations_insert_own_company on public.conversations
for insert
with check (
  company_id = public.current_company_id()
  or public.is_hurkl_admin()
);

create policy conversations_update_own_company on public.conversations
for update
using (
  company_id = public.current_company_id()
  or public.is_hurkl_admin()
)
with check (
  company_id = public.current_company_id()
  or public.is_hurkl_admin()
);

-- Messages: deliberately no UPDATE or DELETE policy at all — a
-- conversation transcript is structurally append-only, the same
-- reasoning as audit_log (SECURITY.md §6).
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  -- Denormalized company_id, matching the customers/audit_log pattern
  -- of company_id on every tenant-scoped table (ARCHITECTURE.md §4) —
  -- lets RLS scope messages directly without a join to conversations.
  company_id uuid not null references public.companies (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  -- Null for Mason's own outbound messages, and for inbound messages
  -- from a sender who couldn't be authenticated (which are dropped
  -- before this table is reached in practice — see
  -- lib/communications/inbound.ts — but the column stays nullable in
  -- case a future channel needs to record an unlinked attempt).
  sender_profile_id uuid references public.profiles (id),
  body text not null,
  external_message_id text,
  created_at timestamptz not null default now()
);

create index messages_conversation_id_idx on public.messages (conversation_id);
create index messages_company_id_idx on public.messages (company_id);

alter table public.messages enable row level security;

create policy messages_select_own_company on public.messages
for select
using (
  company_id = public.current_company_id()
  or public.is_hurkl_admin()
);

create policy messages_insert_own_company on public.messages
for insert
with check (
  company_id = public.current_company_id()
  or public.is_hurkl_admin()
);

-- Telegram identity links: authentication for an inbound Telegram
-- message. Telegram has no password/OAuth flow for a bot DM, so a
-- pre-registered allow-list is the correct, standard mechanism (and
-- trivially revocable — delete the row). RLS enabled, but
-- deliberately NO policies for the ordinary `authenticated` role at
-- all — same pattern as `companies`' own insert/update/delete
-- (admin/service-role only), since linking a Telegram identity to a
-- HURKL identity is a sensitive, one-time bootstrap action, not a
-- self-service tenant operation. See scripts/telegram-link-owner.ts.
create table public.telegram_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  telegram_user_id bigint not null unique,
  telegram_username text,
  linked_at timestamptz not null default now()
);

alter table public.telegram_links enable row level security;
