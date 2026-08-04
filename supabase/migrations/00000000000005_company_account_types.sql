-- HURKL's internal ownership/account-classification system. See
-- docs/internal-ownership-system.md for the full design.
--
-- NOT a customer feature — an internal platform feature. Distinguishes
-- companies HURKL itself owns/uses/demos from real, billable tenants,
-- so that "does this company ever get billed" is one centralized,
-- database-verified fact — never a client-supplied value, never
-- scattered across billing call sites (see
-- lib/billing/authorization.ts, which is the only code allowed to read
-- this column for a billing decision).

-- CHECK list, not an enum — same reasoning as audit_log.autonomy_tier
-- and conversations.channel: account types are expected to grow
-- (Enterprise is already anticipated), and a CHECK list means adding
-- one later is a one-line ALTER, not a schema-wide enum migration.
alter table public.companies
  add column account_type text not null default 'production_customer' check (
    account_type in (
      'production_customer',
      'internal_hurkl',
      'demo',
      'development',
      'partner'
    )
  );

-- The existing seeded "HURKL (Internal)" company (see
-- 00000000000004_communications.sql) is HURKL's own internal company —
-- classify it accordingly. This is also the company the founder's own
-- owner profile attaches to (see docs/internal-ownership-system.md).
update public.companies
set account_type = 'internal_hurkl'
where id = '00000000-0000-0000-0000-000000000001';

-- Changing a company's account_type is a sensitive, platform-owner-only
-- action — never exposed to customers, never a bare table UPDATE (the
-- companies table already has no UPDATE policy for ordinary roles at
-- all; this function is the one deliberate, audited path). The
-- authorization check happens INSIDE the function, in the database
-- itself, not just at the application layer — so even a direct RPC
-- call from a non-admin authenticated user is rejected server-side,
-- never trusting a client-supplied role claim.
create or replace function public.set_company_account_type(
  p_company_id uuid,
  p_new_account_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_account_type text;
begin
  if not public.is_hurkl_admin() then
    raise exception 'Only a HURKL admin may change a company''s account type';
  end if;

  select account_type into v_old_account_type
  from public.companies
  where id = p_company_id;

  if v_old_account_type is null then
    raise exception 'Company % not found', p_company_id;
  end if;

  update public.companies
  set account_type = p_new_account_type
  where id = p_company_id;

  -- tier_1_automatic, not tier_2: SECURITY.md's autonomy tiers govern
  -- Mason's own behavior toward a tenant, not a human platform owner's
  -- direct administrative action. This executes immediately once
  -- is_hurkl_admin() passes — there is no further pending-approval step
  -- to represent, so tier_2 ("approval required") would misdescribe
  -- what actually happened. Same reasoning already applied to
  -- 'company_created_owner_assigned' in migration 3.
  insert into public.audit_log (
    company_id, actor_user_id, action, autonomy_tier,
    policy_reference, subject_type, subject_id, metadata
  )
  values (
    p_company_id,
    auth.uid(),
    'company_account_type_changed',
    'tier_1_automatic',
    'internal_ownership_system',
    'company',
    p_company_id::text,
    jsonb_build_object('from', v_old_account_type, 'to', p_new_account_type)
  );
end;
$$;

-- The CHECK constraint on companies.account_type validates the new
-- value at the table level regardless, but this still runs as any
-- authenticated user could otherwise attempt to invoke it (and be
-- rejected by the is_hurkl_admin() check above) — least privilege,
-- same pattern as create_company_and_assign_owner.
revoke all on function public.set_company_account_type(uuid, text) from public;
grant execute on function public.set_company_account_type(uuid, text) to authenticated;
