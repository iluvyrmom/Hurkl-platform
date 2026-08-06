-- Authentication, Row-Level Security, and photo storage.
--
-- Phase 1 has exactly one real tenant (the seeded A-1 Best Moving business
-- row), but RLS is written as real tenant isolation from day one — not a
-- placeholder to revisit later — because retrofitting RLS onto live data is
-- far riskier than building it before any real customer data exists.

-- business_members links a Supabase Auth user to a business with a role.
-- Kept intentionally simple (owner/staff) rather than modeling every
-- possible RBAC nuance — this app has two real audiences (the owner, and
-- crew members who create estimates/complete jobs), not Mason's full
-- Owner/Manager/Employee/Customer role set.
create type business_role as enum ('owner', 'staff');

create table business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role business_role not null default 'staff',
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index business_members_user_idx on business_members (user_id);

-- SECURITY DEFINER so this can be called inside RLS policies without those
-- policies needing direct SELECT access to business_members themselves
-- (avoiding recursive-policy problems), while still only ever answering
-- "is auth.uid() a member of this specific business" — never returning
-- another user's membership rows.
create or replace function is_business_member(target_business_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from business_members
    where business_id = target_business_id
      and user_id = auth.uid()
  );
$$;

alter table business_members enable row level security;

create policy "members can see their own membership rows"
  on business_members for select
  using (user_id = auth.uid());

-- Facilities and their pricing are shared reference data, not tenant
-- secrets — readable by any authenticated user, writable by none through
-- the anon/authenticated API (pricing edits go through a service-role-only
-- admin path, not client-facing tables).
alter table facilities enable row level security;
alter table facility_hours enable row level security;
alter table facility_pricing_rules enable row level security;
alter table facility_special_fees enable row level security;

create policy "facilities are readable by authenticated users"
  on facilities for select
  to authenticated
  using (true);

create policy "facility_hours are readable by authenticated users"
  on facility_hours for select
  to authenticated
  using (true);

create policy "facility_pricing_rules are readable by authenticated users"
  on facility_pricing_rules for select
  to authenticated
  using (true);

create policy "facility_special_fees are readable by authenticated users"
  on facility_special_fees for select
  to authenticated
  using (true);

-- businesses: a member can read their own business; nobody can read
-- another business's row through the ordinary client API.
alter table businesses enable row level security;

create policy "members can read their own business"
  on businesses for select
  using (is_business_member(id));

-- Tenant-scoped tables: full isolation by business_id membership.
alter table customers enable row level security;
alter table estimates enable row level security;
alter table estimate_photos enable row level security;
alter table jobs enable row level security;
alter table job_completions enable row level security;
alter table learning_records enable row level security;

create policy "members can manage their business's customers"
  on customers for all
  using (is_business_member(business_id))
  with check (is_business_member(business_id));

create policy "members can manage their business's estimates"
  on estimates for all
  using (is_business_member(business_id))
  with check (is_business_member(business_id));

-- estimate_photos has no business_id column of its own — isolation is
-- enforced by joining to the parent estimate's business_id.
create policy "members can manage their business's estimate photos"
  on estimate_photos for all
  using (
    exists (
      select 1 from estimates
      where estimates.id = estimate_photos.estimate_id
        and is_business_member(estimates.business_id)
    )
  )
  with check (
    exists (
      select 1 from estimates
      where estimates.id = estimate_photos.estimate_id
        and is_business_member(estimates.business_id)
    )
  );

create policy "members can manage their business's jobs"
  on jobs for all
  using (is_business_member(business_id))
  with check (is_business_member(business_id));

create policy "members can manage their business's job completions"
  on job_completions for all
  using (
    exists (
      select 1 from jobs
      where jobs.id = job_completions.job_id
        and is_business_member(jobs.business_id)
    )
  )
  with check (
    exists (
      select 1 from jobs
      where jobs.id = job_completions.job_id
        and is_business_member(jobs.business_id)
    )
  );

create policy "members can manage their business's learning records"
  on learning_records for all
  using (is_business_member(business_id))
  with check (is_business_member(business_id));

-- Photo storage: one private bucket, objects path-prefixed by business_id
-- ("{business_id}/estimates/...", "{business_id}/jobs/..."), mirroring the
-- RLS pattern above so storage access rules match table access rules.
insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', false)
on conflict (id) do nothing;

create policy "members can read their business's photos"
  on storage.objects for select
  using (
    bucket_id = 'job-photos'
    and is_business_member((storage.foldername(name))[1]::uuid)
  );

create policy "members can upload their business's photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'job-photos'
    and is_business_member((storage.foldername(name))[1]::uuid)
  );

create policy "members can delete their business's photos"
  on storage.objects for delete
  using (
    bucket_id = 'job-photos'
    and is_business_member((storage.foldername(name))[1]::uuid)
  );
