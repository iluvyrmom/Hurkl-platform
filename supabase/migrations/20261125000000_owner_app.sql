-- HURKL owner app: feature switches, push notifications, and HURKL announcements.
-- Additive only. Nothing existing is dropped or renamed.

-- 1. Feature switches the owner can flip from the app.
--    Existing switches reused: auto_callback_enabled (Angi follow-up), owner_texts_enabled (lead texts),
--    shutoff_guide_enabled (water shut-off picture text).
alter table public.companies
  add column if not exists business_line_enabled boolean not null default false,
  add column if not exists business_line_ready   boolean not null default false, -- set by HURKL once call routing is wired
  add column if not exists booking_enabled       boolean not null default false,
  add column if not exists booking_ready         boolean not null default false; -- set by HURKL once time slots exist

-- 2. Owner flips a switch. Only owners (or HURKL admins) of THAT company; every flip is audited.
create or replace function public.set_mason_feature(feature text, enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_role text;
  v_ready boolean := true;
begin
  if auth.uid() is null or v_company is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select role::text into v_role from public.profiles where id = auth.uid();
  if v_role not in ('owner', 'hurkl_admin') then
    raise exception 'owner_only' using errcode = '42501';
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
end;
$$;
revoke all on function public.set_mason_feature(text, boolean) from public, anon;
grant execute on function public.set_mason_feature(text, boolean) to authenticated;

-- 3. Push subscriptions (one row per phone/browser the owner turns notifications on for).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count int not null default 0
);
create index if not exists push_subscriptions_company_idx on public.push_subscriptions(company_id);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid() and company_id = public.current_company_id());
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- 4. Each notification is sent at most once.
create table if not exists public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('lead', 'attention', 'announcement')),
  ref_id uuid not null,
  sent_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (kind, ref_id)
);
alter table public.push_deliveries enable row level security;

-- 5. "From HURKL" posts shown in the owner app. company_id null = every client.
create table if not exists public.hurkl_announcements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 2000),
  cta_label text check (cta_label is null or char_length(cta_label) <= 40),
  cta_url text check (cta_url is null or cta_url ~ '^(https://|tel:|sms:)'),
  published boolean not null default false,
  notify boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.hurkl_announcements enable row level security;
create policy hurkl_announcements_select_own on public.hurkl_announcements
  for select to authenticated
  using ((published and (company_id is null or company_id = public.current_company_id())) or public.is_hurkl_admin());

-- 6. VAPID keys for Web Push: generated inside the push function on first use and stored in Vault.
--    Nobody ever sees the private key.
create or replace function public.owner_push_vapid_keys()
returns text language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'owner_push_vapid_keys' limit 1;
$$;
create or replace function public.owner_push_store_vapid_keys(keys_json text)
returns boolean language plpgsql security definer set search_path = public, vault as $$
begin
  if exists (select 1 from vault.secrets where name = 'owner_push_vapid_keys') then return false; end if;
  perform vault.create_secret(keys_json, 'owner_push_vapid_keys', 'Web Push VAPID key pair for the HURKL owner app');
  return true;
end;
$$;
revoke all on function public.owner_push_vapid_keys() from public, anon, authenticated;
revoke all on function public.owner_push_store_vapid_keys(text) from public, anon, authenticated;
grant execute on function public.owner_push_vapid_keys() to service_role;
grant execute on function public.owner_push_store_vapid_keys(text) to service_role;

-- 7. Instant push: new lead / new owner alert / published announcement -> owner-push function.
--    Never blocks or fails the original insert.
create or replace function public.queue_owner_push()
returns trigger language plpgsql security definer set search_path = public, extensions, vault as $$
declare
  v_kind text;
begin
  v_kind := case tg_table_name
    when 'leads' then 'lead'
    when 'owner_escalations' then 'attention'
    else 'announcement' end;
  if v_kind = 'announcement' and not (new.published and new.notify) then return new; end if;
  begin
    perform net.http_post(
      url := 'https://atwaixmsvzehheotdymf.supabase.co/functions/v1/owner-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'followup_worker_secret' limit 1)
      ),
      body := jsonb_build_object('kind', v_kind, 'id', new.id),
      timeout_milliseconds := 20000
    );
  exception when others then
    raise warning 'queue_owner_push failed: %', sqlerrm;
  end;
  return new;
end;
$$;

create trigger leads_owner_push after insert on public.leads
  for each row execute function public.queue_owner_push();
create trigger owner_escalations_owner_push after insert on public.owner_escalations
  for each row execute function public.queue_owner_push();
create trigger hurkl_announcements_owner_push after insert or update of published, notify on public.hurkl_announcements
  for each row execute function public.queue_owner_push();
