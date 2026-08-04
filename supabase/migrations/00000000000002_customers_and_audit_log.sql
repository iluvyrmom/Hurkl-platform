-- First real tenant-scoped business table (customers), and the
-- append-only audit log — see SECURITY.md §1 and §6.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  phone text,
  email text,
  -- Soft-delete marker (SECURITY.md §10: soft-delete first, before any
  -- hard/irreversible delete). Non-null means the row is in the
  -- recoverable-deleted state. There is deliberately no DELETE policy
  -- below — permanently removing a customer row is not something any
  -- tenant role can do via SQL at all; "deleting" a customer means
  -- setting this column via the existing UPDATE policy.
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index customers_company_id_idx on public.customers (company_id);

alter table public.customers enable row level security;

create policy customers_select_own_company on public.customers
for select
using (
  company_id = public.current_company_id()
  or public.is_hurkl_admin()
);

create policy customers_insert_own_company on public.customers
for insert
with check (company_id = public.current_company_id());

create policy customers_update_own_company on public.customers
for update
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

-- Append-only audit log. Deliberately no update/delete policy exists —
-- RLS defaults to deny for any command with no matching policy, so this
-- table is structurally append-only for every non-service-role
-- connection (SECURITY.md §6: "append-only... independent of general
-- application logs").
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  -- ON DELETE SET NULL, not NO ACTION (the default): a user must be
  -- deletable from auth.users (e.g. a right-to-be-forgotten request)
  -- without that failing because they once acted on something. The
  -- audit_log row itself is never deleted or altered — only this
  -- reference is cleared — so the audit trail (what happened, when,
  -- on which company) survives the actor's own deletion.
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  autonomy_tier text not null check (
    autonomy_tier in ('tier_1_automatic', 'tier_2_approval_required', 'tier_3_never_autonomous')
  ),
  policy_reference text,
  subject_type text,
  subject_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_company_id_idx on public.audit_log (company_id);

alter table public.audit_log enable row level security;

create policy audit_log_select_own_company on public.audit_log
for select
using (
  company_id = public.current_company_id()
  or public.is_hurkl_admin()
);

create policy audit_log_insert_own_company on public.audit_log
for insert
with check (
  company_id = public.current_company_id()
  or public.is_hurkl_admin()
);
