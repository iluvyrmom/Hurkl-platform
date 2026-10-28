-- Saved drafts from HURKL's specialist agents (Marketing first), with the
-- checks they went through and the owner's decision. Additive only.
-- Owner (or HURKL admin) sees and decides drafts for their own company.
-- "approved" means the owner OKed the wording; nothing here publishes anything.

create table if not exists public.agent_drafts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  specialist text not null default 'marketing_specialist',
  channel text not null,
  stage text not null
    check (stage in ('drafting','needs_changes','awaiting_owner','approved','rejected','stalled')),
  body text not null default '' check (char_length(body) <= 4000),
  round integer not null default 0 check (round between 0 and 10),
  open_fixes jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_drafts_company_stage_idx
  on public.agent_drafts (company_id, stage, created_at desc);

alter table public.agent_drafts enable row level security;

create policy agent_drafts_select on public.agent_drafts for select
  using ((company_id = public.current_company_id() and public.is_company_owner()) or public.is_hurkl_admin());
create policy agent_drafts_insert on public.agent_drafts for insert
  with check ((company_id = public.current_company_id() and public.is_company_owner()) or public.is_hurkl_admin());
create policy agent_drafts_update on public.agent_drafts for update
  using ((company_id = public.current_company_id() and public.is_company_owner()) or public.is_hurkl_admin())
  with check ((company_id = public.current_company_id() and public.is_company_owner()) or public.is_hurkl_admin());
