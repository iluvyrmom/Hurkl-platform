-- Founder decision (Session 013): for now only the OWNER sees customer
-- information and changes the company calendar. Employees and managers can
-- only ask for days off, or take their own request back.
--
-- NOT YET APPLIED to production. Review, then apply deliberately. It tightens
-- who can read/write customer tables, so anything that currently reads these
-- tables as a signed-in non-owner (nothing in this repo does) would stop working.
-- The public site, Mason chat and payment webhooks use the service role, which
-- bypasses these policies and is unaffected.
--
-- Also closes a real hole found in this session: public.profiles allowed any
-- signed-in user to UPDATE their own `role` and `company_id`
-- (profiles_update_own_row only checks id = auth.uid()), so an employee could
-- have made themselves owner or moved themselves into another company.

begin;

-- 1. Nobody can edit their own role or company. Only full_name stays editable.
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- 2. Helper: owner of the caller's company, or HURKL admin.
create or replace function public.is_company_owner()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) in ('owner', 'hurkl_admin'),
    false
  );
$$;
grant execute on function public.is_company_owner() to authenticated;

-- 3. Customer information: owner (or HURKL admin) only.
--    Same company_id scoping as before, plus the owner check.
drop policy if exists leads_select_own_company on public.leads;
create policy leads_select_own_company on public.leads for select
  using ((company_id = public.current_company_id() and public.is_company_owner()) or public.is_hurkl_admin());
drop policy if exists leads_update_own_company on public.leads;
create policy leads_update_own_company on public.leads for update
  using (company_id = public.current_company_id() and public.is_company_owner())
  with check (company_id = public.current_company_id() and public.is_company_owner());

drop policy if exists customers_select_own_company on public.customers;
create policy customers_select_own_company on public.customers for select
  using ((company_id = public.current_company_id() and public.is_company_owner()) or public.is_hurkl_admin());
drop policy if exists customers_insert_own_company on public.customers;
create policy customers_insert_own_company on public.customers for insert
  with check (company_id = public.current_company_id() and public.is_company_owner());
drop policy if exists customers_update_own_company on public.customers;
create policy customers_update_own_company on public.customers for update
  using (company_id = public.current_company_id() and public.is_company_owner())
  with check (company_id = public.current_company_id() and public.is_company_owner());

drop policy if exists conversations_select_own_company on public.conversations;
create policy conversations_select_own_company on public.conversations for select
  using ((company_id = public.current_company_id() and public.is_company_owner()) or public.is_hurkl_admin());

drop policy if exists messages_select_own_company on public.messages;
create policy messages_select_own_company on public.messages for select
  using ((company_id = public.current_company_id() and public.is_company_owner()) or public.is_hurkl_admin());

drop policy if exists owner_escalations_select_own_company on public.owner_escalations;
create policy owner_escalations_select_own_company on public.owner_escalations for select
  using ((company_id = public.current_company_id() and public.is_company_owner()) or public.is_hurkl_admin());
drop policy if exists owner_escalations_update_own_company on public.owner_escalations;
create policy owner_escalations_update_own_company on public.owner_escalations for update
  using (company_id = public.current_company_id() and public.is_company_owner())
  with check (company_id = public.current_company_id() and public.is_company_owner());

drop policy if exists booking_reservations_select_own_company on public.booking_reservations;
create policy booking_reservations_select_own_company on public.booking_reservations for select
  using ((company_id = public.current_company_id() and public.is_company_owner()) or public.is_hurkl_admin());

drop policy if exists audit_log_select_own_company on public.audit_log;
create policy audit_log_select_own_company on public.audit_log for select
  using ((company_id = public.current_company_id() and public.is_company_owner()) or public.is_hurkl_admin());

-- 4. Company calendar: everyone in the company can SEE which days are blocked
--    (so staff know the schedule), but only the owner can change it.
drop policy if exists company_calendar_blocks_insert_staff on public.company_calendar_blocks;
create policy company_calendar_blocks_insert_owner on public.company_calendar_blocks for insert
  with check ((company_id = public.current_company_id() and public.is_company_owner()) or public.is_hurkl_admin());
drop policy if exists company_calendar_blocks_update_staff on public.company_calendar_blocks;
create policy company_calendar_blocks_update_owner on public.company_calendar_blocks for update
  using ((company_id = public.current_company_id() and public.is_company_owner()) or public.is_hurkl_admin())
  with check ((company_id = public.current_company_id() and public.is_company_owner()) or public.is_hurkl_admin());
drop policy if exists company_calendar_blocks_delete_staff on public.company_calendar_blocks;
create policy company_calendar_blocks_delete_owner on public.company_calendar_blocks for delete
  using ((company_id = public.current_company_id() and public.is_company_owner()) or public.is_hurkl_admin());

-- 5. Days-off requests.
create table if not exists public.time_off_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  service_date date not null,
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'denied', 'cancelled')),
  note text check (note is null or char_length(note) <= 120),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, service_date)
);
create index if not exists time_off_requests_company_date_idx
  on public.time_off_requests (company_id, service_date);

alter table public.time_off_requests enable row level security;

-- See: your own requests; the owner (or HURKL admin) sees the whole company's.
create policy time_off_select on public.time_off_requests for select
  using (
    (company_id = public.current_company_id() and profile_id = auth.uid())
    or (company_id = public.current_company_id() and public.is_company_owner())
    or public.is_hurkl_admin()
  );

-- Ask: only for yourself, in your own company, and only as "requested".
create policy time_off_insert_own on public.time_off_requests for insert
  with check (
    company_id = public.current_company_id()
    and profile_id = auth.uid()
    and status = 'requested'
    and decided_by is null
    and decided_at is null
  );

-- Take back: you may only move your own request to "cancelled" (or re-ask a
-- cancelled day by setting it back to "requested"). You cannot approve yourself.
create policy time_off_update_own on public.time_off_requests for update
  using (company_id = public.current_company_id() and profile_id = auth.uid())
  with check (
    company_id = public.current_company_id()
    and profile_id = auth.uid()
    and status in ('cancelled', 'requested')
    and decided_by is null
    and decided_at is null
  );

-- Decide: only the owner (or HURKL admin).
create policy time_off_update_owner on public.time_off_requests for update
  using ((company_id = public.current_company_id() and public.is_company_owner()) or public.is_hurkl_admin())
  with check ((company_id = public.current_company_id() and public.is_company_owner()) or public.is_hurkl_admin());

commit;
