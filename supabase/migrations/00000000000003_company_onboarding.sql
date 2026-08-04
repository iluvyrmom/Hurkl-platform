-- Atomic company creation + owner assignment. See
-- docs/business-intelligence (onboarding is Phase 3 territory) and
-- SECURITY.md §1/§3 — this is the one reliable mechanism that creates a
-- company, attaches the calling user's profile to it, and assigns the
-- owner role, without ever leaving behind a company with no owner or a
-- profile with no company. A plpgsql function body is one transaction:
-- if it raises, everything inside it rolls back.

create or replace function public.create_company_and_assign_owner(
  p_company_name text,
  p_owner_name text,
  p_business_phone text default null,
  p_business_email text default null,
  p_industry text default null,
  p_timezone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_new_company_id uuid;
  v_rows_claimed int;
begin
  if v_user_id is null then
    raise exception 'Must be authenticated to create a company';
  end if;

  if p_company_name is null or length(trim(p_company_name)) = 0 then
    raise exception 'Company name is required';
  end if;

  if p_owner_name is null or length(trim(p_owner_name)) = 0 then
    raise exception 'Owner name is required';
  end if;

  insert into public.companies (name)
  values (trim(p_company_name))
  returning id into v_new_company_id;

  -- Insert-or-claim the profile row, but only if it doesn't already
  -- belong to a company. This single statement is what makes the
  -- function safe against two concurrent "create company" submissions
  -- from the same user (double-click, retried request): Postgres
  -- serializes concurrent inserts on the same profiles.id via the
  -- primary key, so the second call's WHERE clause is evaluated only
  -- after the first has committed — and finds company_id already set.
  insert into public.profiles (id, company_id, role, full_name)
  values (v_user_id, v_new_company_id, 'owner', trim(p_owner_name))
  on conflict (id) do update
    set company_id = excluded.company_id,
        role = excluded.role,
        full_name = excluded.full_name
    where public.profiles.company_id is null;

  get diagnostics v_rows_claimed = row_count;
  if v_rows_claimed = 0 then
    -- The profile already belonged to a company. Raising here rolls
    -- back the company insert above too, so no orphaned company is
    -- left behind (see the "safe against partial creation" requirement).
    raise exception 'User already belongs to a company';
  end if;

  insert into public.audit_log (
    company_id, actor_user_id, action, autonomy_tier,
    policy_reference, subject_type, subject_id, metadata
  )
  values (
    v_new_company_id,
    v_user_id,
    'company_created_owner_assigned',
    'tier_1_automatic',
    'company_onboarding',
    'company',
    v_new_company_id::text,
    jsonb_build_object(
      'business_phone', p_business_phone,
      'business_email', p_business_email,
      'industry', p_industry,
      'timezone', p_timezone
    )
  );

  return v_new_company_id;
end;
$$;

-- Least privilege: only signed-in users may call this, never the
-- anonymous role, and never as a general-purpose function other code
-- can misuse (SECURITY.md's "default to least privilege").
revoke all on function public.create_company_and_assign_owner(text, text, text, text, text, text) from public;
grant execute on function public.create_company_and_assign_owner(text, text, text, text, text, text) to authenticated;
