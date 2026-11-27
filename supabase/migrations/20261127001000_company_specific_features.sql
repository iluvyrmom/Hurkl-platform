-- Company walls for owner-app features (founder direction, 2026-11-26).
-- HURKL is an independent hub company with Mason at its center. Each client company's rules live
-- only in that company's own settings. Before this change, three Executive Drains behaviors were
-- platform-wide:
--   1. first payment turned on Angi follow-up AND the water shut-off texts for ANY company;
--   2. the "emergency protocol is always on" lock applied to every company;
--   3. the owner app showed Executive Drains' plumbing emergency card, Angi switch and setup to all.
-- Now each company lists its own modules and first-payment features. Defaults are empty/generic.

alter table public.companies
  add column if not exists owner_app_modules text[] not null default '{owner_texts}',
  add column if not exists first_payment_features text[] not null default '{}',
  add column if not exists emergency_protocol_locked boolean not null default false;

comment on column public.companies.owner_app_modules is
  'Which owner-app switches, cards and setup groups this company sees. Per company; never global. Known: angi_followup, owner_texts, business_line, booking, emergency_water, setup_texting, setup_angi, setup_booking.';
comment on column public.companies.first_payment_features is
  'Features this company asked to turn on automatically at its first payment (auto_callback, shutoff_guide). Per company; empty by default.';
comment on column public.companies.emergency_protocol_locked is
  'When true, this company''s emergency protocol cannot be switched off. Per company; false by default.';

-- Executive Drains keeps exactly what was approved for it. The app-test company mirrors it for previews.
update public.companies
   set owner_app_modules = '{angi_followup,owner_texts,business_line,booking,emergency_water,setup_texting,setup_angi,setup_booking}',
       first_payment_features = '{auto_callback,shutoff_guide}',
       emergency_protocol_locked = true
 where website_slug in ('executive-drains', 'hurkl-app-test');

-- 1. First payment: only the features this company listed.
create or replace function public.billing_activation_defaults()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.billing_status = 'active' and coalesce(old.billing_status, 'none') in ('none', 'canceled') then
    if 'auto_callback' = any(new.first_payment_features) then new.auto_callback_enabled := true; end if;
    if 'shutoff_guide' = any(new.first_payment_features) then new.shutoff_guide_enabled := true; end if;
  end if;
  return new;
end $$;

-- 2. Switches: only modules this company has; the emergency lock only where this company set it.
create or replace function public.set_mason_feature(feature text, enabled boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id();
  v_role text;
  v_ready boolean := true;
  v_modules text[];
  v_locked boolean;
begin
  if auth.uid() is null or v_company is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select role::text into v_role from public.profiles where id = auth.uid();
  if v_role not in ('owner', 'hurkl_admin') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select owner_app_modules, emergency_protocol_locked into v_modules, v_locked from public.companies where id = v_company;
  if not (feature = any(v_modules) or (feature = 'shutoff_guide' and 'emergency_water' = any(v_modules))) then
    raise exception 'feature_not_available' using errcode = 'P0001';
  end if;

  case feature
    when 'angi_followup' then
      update public.companies set auto_callback_enabled = enabled where id = v_company;
    when 'owner_texts' then
      update public.companies
         set owner_texts_enabled = enabled,
             owner_texts_since = case when enabled and owner_texts_since is null then now() else owner_texts_since end
       where id = v_company;
    when 'shutoff_guide' then
      if not enabled and v_locked then raise exception 'emergency_protocol_always_on' using errcode = 'P0001'; end if;
      update public.companies set shutoff_guide_enabled = enabled where id = v_company;
    when 'business_line' then
      select business_line_ready into v_ready from public.companies where id = v_company;
      if enabled and not v_ready then raise exception 'not_ready' using errcode = 'P0001'; end if;
      update public.companies set business_line_enabled = enabled where id = v_company;
    when 'booking' then
      select booking_ready into v_ready from public.companies where id = v_company;
      if enabled and not v_ready then raise exception 'not_ready' using errcode = 'P0001'; end if;
      update public.companies set booking_enabled = enabled where id = v_company;
    else
      raise exception 'unknown_feature' using errcode = '22023';
  end case;

  insert into public.audit_log (company_id, actor_user_id, action, autonomy_tier, policy_reference, subject_type, subject_id, metadata)
  values (v_company, auth.uid(), 'mason_feature_' || case when enabled then 'on' else 'off' end,
          'tier_1_automatic', 'owner_app_switch', 'company', v_company::text, jsonb_build_object('feature', feature));

  return jsonb_build_object('feature', feature, 'enabled', enabled);
end $$;

-- 3. App wording overrides: per company (null = HURKL's generic default wording).
alter table public.mason_feature_copy add column if not exists company_id uuid references public.companies(id);
alter table public.mason_feature_copy drop constraint if exists mason_feature_copy_pkey;
alter table public.mason_feature_copy add column if not exists id uuid not null default gen_random_uuid() primary key;
create unique index if not exists mason_feature_copy_one_per_company
  on public.mason_feature_copy (feature, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid));
-- Owners read HURKL's generic wording plus their own company's wording, never another company's.
alter policy mason_feature_copy_read on public.mason_feature_copy
  using (company_id is null or company_id = public.current_company_id() or public.is_hurkl_admin());
