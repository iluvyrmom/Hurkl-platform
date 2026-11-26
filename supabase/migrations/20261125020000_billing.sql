-- HURKL billing: $500/month flat (per-company amount), 72-hour grace, pause, restart-today option.
-- Additive only.

alter table public.companies
  add column if not exists billing_enforced boolean not null default false,  -- HURKL turns this on at a client's go-live
  add column if not exists billing_exempt boolean not null default false,    -- free access (owner's own businesses, friends/family)
  add column if not exists billing_plan_cents integer not null default 50000 check (billing_plan_cents between 0 and 10000000),
  add column if not exists billing_status text not null default 'none'
    check (billing_status in ('none', 'active', 'past_due', 'paused', 'canceled')),
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists billing_period_end timestamptz,
  add column if not exists payment_failed_at timestamptz,
  add column if not exists grace_ends_at timestamptz,
  add column if not exists grace_warning_sent boolean not null default false,
  add column if not exists mason_paused boolean not null default false,
  add column if not exists mason_paused_at timestamptz;

create unique index if not exists companies_stripe_customer_uidx on public.companies(stripe_customer_id) where stripe_customer_id is not null;

-- Is Mason allowed to work for this company right now? Single source of truth for the pause rule.
create or replace function public.mason_service_active(c public.companies)
returns boolean language sql stable as $$
  select c.billing_exempt
      or not c.billing_enforced
      or (c.billing_status = 'active')
      or (c.billing_status = 'past_due' and (c.grace_ends_at is null or c.grace_ends_at > now()));
$$;

-- Stripe webhook events already processed (idempotency). Service role only.
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;

-- Stripe ids created once per mode (test/live), e.g. the "Mason" product. Service role only.
create table if not exists public.billing_config (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table public.billing_config enable row level security;

-- Every 5 minutes: 24-hour warning, then pause at the 72-hour mark. Owner alerts go through owner_escalations
-- (which also triggers the phone notification).
create or replace function public.enforce_billing_grace()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  warned int := 0;
  paused int := 0;
  r record;
begin
  for r in
    update public.companies
       set grace_warning_sent = true
     where billing_status = 'past_due' and not billing_exempt and billing_enforced
       and not grace_warning_sent and grace_ends_at is not null
       and grace_ends_at - now() <= interval '24 hours' and grace_ends_at > now()
    returning id, grace_ends_at, billing_plan_cents
  loop
    warned := warned + 1;
    insert into public.owner_escalations (company_id, reason, customer_summary)
    values (r.id, 'owner_review_requested',
      '[Billing: 24 hours left] Your HURKL payment still hasn''t gone through. Mason pauses in about 24 hours unless it''s paid. Open Billing in your Mason app to pay.');
  end loop;

  for r in
    update public.companies
       set billing_status = 'paused', mason_paused = true, mason_paused_at = now()
     where billing_status = 'past_due' and not billing_exempt and billing_enforced
       and grace_ends_at is not null and grace_ends_at <= now()
    returning id
  loop
    paused := paused + 1;
    insert into public.owner_escalations (company_id, reason, customer_summary)
    values (r.id, 'owner_review_requested',
      '[Billing: Mason paused] Mason is paused because the HURKL payment didn''t go through. Your calls still ring through to you and new leads still show up in your app, but Mason won''t call them. Pay in the Billing section to turn Mason back on.');
    insert into public.audit_log (company_id, action, autonomy_tier, policy_reference, subject_type, subject_id, metadata)
    values (r.id, 'mason_paused_for_billing', 'tier_1_automatic', 'billing_grace_72h', 'company', r.id::text, '{}'::jsonb);
  end loop;

  return jsonb_build_object('warned', warned, 'paused', paused);
end;
$$;
revoke all on function public.enforce_billing_grace() from public, anon, authenticated;

select cron.schedule('billing-grace-enforcer', '*/5 * * * *', $$select public.enforce_billing_grace();$$);

-- HURKL's own businesses never pay.
update public.companies set billing_exempt = true
 where name in ('HURKL (Internal)') or name ilike 'A-1 Best Moving%' or website_slug = 'hurkl-app-test';
