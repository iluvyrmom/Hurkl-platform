-- HURKL: automatic lead follow-up sequence (additive only)
--   call now -> no answer: call again at +5 min -> no answer: text -> call again at +30 min
--   -> still nothing: alert the owner (owner_escalations).
-- Stops as soon as the customer answers, calls back, or texts back.

alter table public.companies
  add column if not exists twilio_from_number text;

alter table public.leads
  add column if not exists followup_status text
    check (followup_status is null or followup_status in ('active','answered','responded','exhausted','stopped')),
  add column if not exists followup_step integer not null default 0,
  add column if not exists next_followup_at timestamptz,
  add column if not exists last_contact_at timestamptz;

create index if not exists leads_followup_due_idx
  on public.leads (next_followup_at) where followup_status = 'active';

create table if not exists public.lead_contact_attempts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  step integer not null,
  channel text not null check (channel in ('call', 'sms')),
  status text not null check (status in ('placed', 'sent', 'failed')),
  provider_ref text,          -- ElevenLabs conversation_id or Twilio message SID
  outcome text check (outcome in ('answered', 'no_answer', 'in_progress', 'unknown')),
  error text,
  created_at timestamptz not null default now(),
  checked_at timestamptz
);

create index if not exists lead_contact_attempts_lead_idx on public.lead_contact_attempts (lead_id, created_at);

alter table public.lead_contact_attempts enable row level security;

create policy lead_contact_attempts_select_own_company on public.lead_contact_attempts
  for select using ((company_id = public.current_company_id()) or public.is_hurkl_admin());

grant select on public.lead_contact_attempts to authenticated;
grant all on public.lead_contact_attempts to service_role;

-- Separate migration: enable_pg_cron
-- create extension if not exists pg_cron;
