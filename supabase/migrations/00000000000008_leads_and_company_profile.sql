-- A-1 Best Moving emergency revenue launch: company profile fields a
-- public page/Mason can actually read, A-1's own seeded company row,
-- and a leads table with a public, safe intake path. See
-- docs/a1-best-moving-launch.md for the full design and rationale.
--
-- Reuses the existing RBAC/RLS model exactly — no new tenant-isolation
-- mechanism. Public (anon) intake is deliberately NOT a bare INSERT
-- policy on `leads` — it goes through the submit_lead() SECURITY
-- DEFINER function below, the same pattern this project already uses
-- for create_company_and_assign_owner (migration 3) and
-- set_company_account_type (migration 5): the function, not RLS,
-- validates and controls exactly what an anonymous caller can write.

-- ---------------------------------------------------------------------
-- Company profile fields. Previously only id/name/created_at/
-- account_type existed — nowhere for a business's own phone/email/
-- slogan/public-page identifier to live as real, queryable data
-- (versus the dev-only, git-ignored lib/tenant/business-profile.ts
-- seed, which nothing in production reads). This is additive and
-- optional for every existing company; nothing here is A-1-specific.
-- ---------------------------------------------------------------------
alter table public.companies
  add column phone text,
  add column email text,
  add column slogan text,
  add column website_slug text unique;

-- ---------------------------------------------------------------------
-- A-1 Best Moving LLC — HURKL's first real production company. Seeded
-- here (deterministic, replayable, on-conflict-safe) rather than
-- created through the normal owner sign-up flow, because the public
-- lead-capture page and the lead-intake function both need a stable
-- company to attach to *before* a real owner has signed up. Attaching
-- A-1's real owner to this row (profiles.company_id/role) is a
-- separate, deliberately manual step — see docs/a1-best-moving-launch.md.
-- Keyed by website_slug, not id, so this is safe to re-run even if a
-- differently-provisioned row already exists.
-- ---------------------------------------------------------------------
insert into public.companies (id, name, phone, email, slogan, website_slug, account_type)
values (
  '10000000-0000-0000-0000-000000000001',
  'A-1 Best Moving LLC',
  '971-777-6660',
  'A1BESTMOVING@gmail.com',
  'The best move you''ll make.',
  'a1-best-moving',
  'production_customer'
)
on conflict (website_slug) do nothing;

-- ---------------------------------------------------------------------
-- Leads: the first stage of the revenue pipeline, before a "customer"
-- record is warranted (Josh may never book many leads; a lead that
-- never converts should not pollute `customers`). Deliberately mirrors
-- customers' shape/conventions (soft business record, no DELETE
-- policy) rather than inventing a new pattern.
-- ---------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  -- Where this lead came from — 'website' today; a future channel
  -- (phone, referral partner, etc.) is a new value here, not a new
  -- table. Not a CHECK-constrained list yet since the real set of
  -- sources is still being discovered; revisit once it's stable.
  source text not null default 'website',
  name text not null,
  phone text,
  email text,
  pickup_address text,
  destination_address text,
  move_date date,
  preferred_time text,
  property_type text,
  access_notes text,
  inventory_notes text,
  special_items text,
  packing_needs text,
  notes text,
  status text not null default 'new' check (
    status in ('new', 'contacted', 'quoted', 'booked', 'lost')
  ),
  created_at timestamptz not null default now()
);

create index leads_company_id_idx on public.leads (company_id);

alter table public.leads enable row level security;

-- Staff can see and update their own company's leads. There is
-- deliberately no INSERT policy at all for any role, including
-- `authenticated` — every lead, whether from the public website or
-- entered by staff on a phone-in inquiry, goes through submit_lead()
-- below, so validation and the audit-log entry can never be bypassed
-- by a direct table write. There is also deliberately no DELETE
-- policy, matching `customers`.
create policy leads_select_own_company on public.leads
for select
using (
  company_id = public.current_company_id()
  or public.is_hurkl_admin()
);

create policy leads_update_own_company on public.leads
for update
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

-- ---------------------------------------------------------------------
-- Public, anonymous-safe lead intake. This is the ONE thing an
-- unauthenticated website visitor can do to a tenant's data: submit a
-- validated lead for a specific company (identified by its public
-- website_slug, never its internal id) and nothing else. SECURITY
-- DEFINER so it can insert into `leads` (no anon INSERT policy exists)
-- and `audit_log` (whose own INSERT policy requires company
-- membership) despite running as `anon`.
-- ---------------------------------------------------------------------
create or replace function public.submit_lead(
  p_company_slug text,
  p_name text,
  p_phone text default null,
  p_email text default null,
  p_pickup_address text default null,
  p_destination_address text default null,
  p_move_date date default null,
  p_preferred_time text default null,
  p_property_type text default null,
  p_access_notes text default null,
  p_inventory_notes text default null,
  p_special_items text default null,
  p_packing_needs text default null,
  p_notes text default null,
  p_source text default 'website'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_lead_id uuid;
begin
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Name is required';
  end if;
  if length(trim(p_name)) > 200 then
    raise exception 'Name is too long';
  end if;
  if (p_phone is null or length(trim(p_phone)) = 0)
     and (p_email is null or length(trim(p_email)) = 0) then
    raise exception 'Phone or email is required';
  end if;

  select id into v_company_id
  from public.companies
  where website_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Unknown company';
  end if;

  insert into public.leads (
    company_id, source, name, phone, email, pickup_address, destination_address,
    move_date, preferred_time, property_type, access_notes, inventory_notes,
    special_items, packing_needs, notes
  ) values (
    v_company_id,
    coalesce(nullif(trim(p_source), ''), 'website'),
    trim(p_name),
    nullif(trim(p_phone), ''),
    nullif(trim(p_email), ''),
    nullif(trim(p_pickup_address), ''),
    nullif(trim(p_destination_address), ''),
    p_move_date,
    nullif(trim(p_preferred_time), ''),
    nullif(trim(p_property_type), ''),
    nullif(trim(p_access_notes), ''),
    nullif(trim(p_inventory_notes), ''),
    nullif(trim(p_special_items), ''),
    nullif(trim(p_packing_needs), ''),
    nullif(trim(p_notes), '')
  )
  returning id into v_lead_id;

  -- tier_1_automatic: receiving a lead is routine intake, not an
  -- autonomous decision — same reasoning as messages' "message_received".
  insert into public.audit_log (
    company_id, actor_user_id, action, autonomy_tier,
    policy_reference, subject_type, subject_id, metadata
  )
  values (
    v_company_id,
    auth.uid(),
    'lead_received',
    'tier_1_automatic',
    'leads.intake',
    'lead',
    v_lead_id::text,
    jsonb_build_object('source', coalesce(nullif(trim(p_source), ''), 'website'))
  );

  return v_lead_id;
end;
$$;

revoke all on function public.submit_lead(
  text, text, text, text, text, text, date, text, text, text, text, text, text, text, text
) from public;
grant execute on function public.submit_lead(
  text, text, text, text, text, text, date, text, text, text, text, text, text, text, text
) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Public, read-only company profile lookup — the minimum a public
-- marketing page needs (name/phone/email/slogan) without granting
-- anon a SELECT policy on `companies` itself (which would expose every
-- company's name to anyone who could guess/enumerate ids, and doesn't
-- scope to only the public-safe columns).
-- ---------------------------------------------------------------------
create or replace function public.get_company_public_profile(p_company_slug text)
returns table (name text, phone text, email text, slogan text)
language sql
stable
security definer
set search_path = public
as $$
  select name, phone, email, slogan
  from public.companies
  where website_slug = p_company_slug;
$$;

revoke all on function public.get_company_public_profile(text) from public;
grant execute on function public.get_company_public_profile(text) to anon, authenticated;
