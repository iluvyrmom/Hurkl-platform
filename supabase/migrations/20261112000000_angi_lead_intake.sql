-- HURKL: Angi lead intake + outbound callback support.
-- ADDITIVE ONLY. Extends existing companies / leads tables and adds one
-- credentials table. No existing column, constraint, policy or row is changed.

-- 1. Per-company lead-intake & phone settings
alter table public.companies
  add column if not exists industry text,
  add column if not exists timezone text not null default 'America/Los_Angeles',
  add column if not exists owner_alert_phone text,
  add column if not exists oncall_phone text,
  add column if not exists elevenlabs_agent_id text,
  add column if not exists elevenlabs_phone_number_id text,
  add column if not exists auto_callback_enabled boolean not null default false,
  add column if not exists callback_window_start time not null default '08:00',
  add column if not exists callback_window_end time not null default '20:00';

-- 2. Generic (non-moving) lead fields + callback tracking
alter table public.leads
  add column if not exists external_id text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists secondary_phone text,
  add column if not exists phone_masked boolean,
  add column if not exists service_address text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists service_requested text,
  add column if not exists comments text,
  add column if not exists interview jsonb,
  add column if not exists lead_fee numeric(10,2),
  add column if not exists raw_payload jsonb,
  add column if not exists callback_status text,
  add column if not exists callback_attempts integer not null default 0,
  add column if not exists callback_conversation_id text,
  add column if not exists callback_call_sid text,
  add column if not exists callback_error text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.leads
  drop constraint if exists leads_callback_status_check;
alter table public.leads
  add constraint leads_callback_status_check check (callback_status is null or callback_status in (
    'pending',   -- received, not yet handled
    'queued',    -- received outside calling hours
    'skipped',   -- auto-callback off / not configured / bad phone
    'calling',   -- claim lock while the call is being placed
    'called',    -- outbound call started
    'failed'     -- outbound call could not be started
  ));

-- One row per external lead per company/source. Existing website leads have
-- external_id NULL, and NULLs never collide, so they are unaffected.
create unique index if not exists leads_company_source_external_uidx
  on public.leads (company_id, source, external_id);

create index if not exists leads_company_callback_status_idx
  on public.leads (company_id, callback_status) where callback_status is not null;

-- 3. Keys that lead sources (Angi) use to post to us. Only a SHA-256 hash is stored.
create table if not exists public.lead_source_credentials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null check (provider in ('angi')),
  api_key_hash text not null check (api_key_hash ~ '^[0-9a-f]{64}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists lead_source_credentials_lookup
  on public.lead_source_credentials (company_id, provider) where active;

-- Secret material: service role only. RLS on with no policies; revoke client roles.
alter table public.lead_source_credentials enable row level security;
revoke all on public.lead_source_credentials from anon, authenticated;
grant all on public.lead_source_credentials to service_role;
