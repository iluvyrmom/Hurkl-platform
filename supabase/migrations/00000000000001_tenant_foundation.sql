-- Tenant foundation: companies, profiles (roles), and the RLS helper
-- functions every tenant-scoped table's policies are built on.
--
-- See SECURITY.md §1 (tenant isolation), §3 (RBAC roles).
-- Assumes Supabase's built-in `auth.users` and `auth.uid()` in production.
-- For local development/testing without Supabase Auth running, see
-- lib/db/test-support/auth-stub.sql, which is NOT part of this migration
-- set and is never applied to a real project.

create extension if not exists "pgcrypto";

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create type public.user_role as enum (
  'hurkl_admin',
  'owner',
  'manager',
  'employee',
  'customer'
);

-- One row per authenticated user. company_id is required for every role
-- except hurkl_admin (a platform operator, not scoped to one tenant —
-- see SECURITY.md §3: "no default access to tenant customer data").
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  role public.user_role not null,
  full_name text,
  created_at timestamptz not null default now(),
  constraint profiles_company_required_unless_hurkl_admin check (
    role = 'hurkl_admin' or company_id is not null
  )
);

create index profiles_company_id_idx on public.profiles (company_id);

-- security definer helpers: RLS policies call these instead of
-- subquerying public.profiles directly, avoiding recursive-RLS issues
-- and keeping every tenant-scoped policy's expression uniform.
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_hurkl_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) = 'hurkl_admin',
    false
  );
$$;

alter table public.companies enable row level security;
alter table public.profiles enable row level security;

-- Companies: a user may see only their own company. No insert/update/
-- delete policy exists for ordinary roles — company creation goes
-- through the dedicated, audited `create_company_and_assign_owner`
-- SECURITY DEFINER function (see
-- 00000000000003_company_onboarding.sql), granted only to
-- `authenticated` and never callable as a bare table write, rather
-- than a tenant's own unaudited request (SECURITY.md §1).
create policy companies_select_own on public.companies
for select
using (
  id = public.current_company_id()
  or public.is_hurkl_admin()
);

-- Profiles: visible within your own company, or to HURKL admins.
create policy profiles_select_own_company on public.profiles
for select
using (
  company_id = public.current_company_id()
  or public.is_hurkl_admin()
);

-- A user may update only their own profile row.
create policy profiles_update_own_row on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());
