-- DEFERRD core schema (Supabase / Postgres) with row-level security.
-- Replaces the 22 Base44 entities. Money and status fields are written only by
-- server functions (service role); customers and companies can never set them.
-- This is a NEW, separate database from HURKL. Do not run it against HURKL.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  role text not null default 'customer' check (role in ('customer','admin')),
  created_at timestamptz not null default now()
);

-- Helper functions. SECURITY DEFINER so policies can read profiles/members
-- without recursion. search_path pinned.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  signature_url text,
  default_message text,
  owner_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text,
  role text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members
                 where org_id = p_org and user_id = auth.uid())
$$;

create function public.is_org_owner(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members
                 where org_id = p_org and user_id = auth.uid() and role = 'owner')
$$;

-- Users may not change their own role.
create function public.profiles_lock_role() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.role is distinct from old.role and not public.is_admin()
     and current_user not in ('service_role','postgres','supabase_admin') then
    raise exception 'role cannot be changed';
  end if;
  return new;
end $$;
create trigger profiles_lock_role before update on public.profiles
  for each row execute function public.profiles_lock_role();

-- ---------------------------------------------------------- consumer side
create table public.recipients (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  relationship text, address text, city text, state text, zip_code text,
  birthday date, anniversary date, notes text,
  created_at timestamptz not null default now()
);

create sequence public.confirmation_seq start 100000;
-- Confirmation numbers are created on the server, never in the browser.
create function public.next_confirmation_number() returns text
language sql volatile security definer set search_path = public as $$
  select 'DEF-' || upper(to_hex(nextval('public.confirmation_seq')))
$$;

create table public.gift_requests (
  id uuid primary key default gen_random_uuid(),
  confirmation_number text unique not null,  -- set by trigger below
  order_id text, order_number text,
  customer_id uuid not null references auth.users(id),
  status text not null default 'Draft' check (status in (
    'Draft','Awaiting Payment','Paid — Monitoring Active','Original Product Available',
    'Original Product Low Stock','Original Product Unavailable','Backup Under Review',
    'Customer Approval Needed','Ready to Purchase','Purchased','Shipped','Delivered',
    'Delayed','Canceled','Partially Refunded','Fully Refunded','Unable to Fulfill')),
  original_product_url text, original_product_name text, original_product_price numeric,
  original_product_variation text, original_product_quantity int default 1,
  original_product_notes text, original_product_image text,
  backup_product_url text, backup_product_name text, backup_product_price numeric,
  backup_product_variation text, backup_product_quantity int default 1,
  backup_product_notes text, backup_product_image text,
  backup_rule text check (backup_rule in ('auto_purchase','contact_me','cancel')),
  recipient_name text,
  occasion text,
  requested_delivery_date date,
  shipping_address text, city text, state text, zip_code text, phone_number text,
  gift_message text, delivery_instructions text,
  -- money fields: server only (see trigger below)
  product_cost numeric, estimated_shipping numeric, estimated_tax numeric,
  service_fee numeric, protection_reserve numeric, total_due_today numeric,
  approved_maximum numeric,
  stripe_payment_reference text, payment_status text,
  target_purchase_date date, next_product_check_date date, final_purchase_deadline date,
  original_availability text, backup_availability text,
  last_observed_original_price numeric, last_observed_backup_price numeric,
  low_stock_status boolean,
  assigned_admin_id uuid,
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  selected_product text check (selected_product in ('original','backup')),
  retailer_order_number text, tracking_number text,
  refundable_balance numeric, amount_refunded numeric, refund_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create function public.gift_requests_set_confirmation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.confirmation_number := public.next_confirmation_number();  -- always server-made
  return new;
end $$;
create trigger gift_requests_set_confirmation before insert on public.gift_requests
  for each row execute function public.gift_requests_set_confirmation();
revoke execute on function public.gift_requests_set_confirmation() from public, anon, authenticated;

create index on public.gift_requests (customer_id);
create index on public.gift_requests (status);

-- Customers can only touch descriptive fields on their own Draft / Awaiting
-- Payment request. Status progress, money, payment, refund and fulfillment
-- fields are server-only. (SECURITY INVOKER on purpose: current_user is the caller.)
create function public.gift_requests_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  protected text[] := array['product_cost','service_fee','protection_reserve','total_due_today',
    'stripe_payment_reference','payment_status','order_id','order_number','retailer_order_number',
    'tracking_number','refundable_balance','amount_refunded','refund_date','assigned_admin_id',
    'selected_product','target_purchase_date','next_product_check_date','final_purchase_deadline',
    'original_availability','backup_availability','last_observed_original_price',
    'last_observed_backup_price','low_stock_status'];
  k text;
begin
  if current_user in ('service_role','postgres','supabase_admin') or public.is_admin() then
    new.updated_at := now();
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'Draft' then raise exception 'new requests must start as Draft'; end if;
    if new.customer_id is distinct from auth.uid() then raise exception 'not your request'; end if;
    foreach k in array protected loop
      if (to_jsonb(new) -> k) <> 'null'::jsonb then
        raise exception 'field % is set by the server', k;
      end if;
    end loop;
    if new.priority <> 'medium' then raise exception 'field priority is set by the server'; end if;
  else
    if old.status not in ('Draft','Awaiting Payment') then
      raise exception 'request can no longer be edited';
    end if;
    if new.status not in ('Draft','Awaiting Payment') then
      raise exception 'status is set by the server';
    end if;
    if new.customer_id is distinct from old.customer_id
       or new.confirmation_number is distinct from old.confirmation_number
       or new.priority is distinct from old.priority then
      raise exception 'protected field changed';
    end if;
    foreach k in array protected loop
      if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
        raise exception 'field % is set by the server', k;
      end if;
    end loop;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger gift_requests_guard before insert or update on public.gift_requests
  for each row execute function public.gift_requests_guard();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  gift_request_id uuid not null references public.gift_requests(id),
  customer_id uuid references auth.users(id),
  stripe_payment_reference text unique,
  product_funds numeric, shipping_funds numeric, estimated_tax numeric,
  service_fee numeric, protection_reserve numeric, total_collected numeric,
  final_retailer_cost numeric, refundable_balance numeric, amount_refunded numeric,
  refund_date date, payment_status text,
  created_at timestamptz not null default now()
);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  gift_request_id uuid not null references public.gift_requests(id),
  customer_id uuid references auth.users(id),
  action text not null, previous_status text, new_status text,
  responsible_user text, notes text,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  gift_request_id uuid not null references public.gift_requests(id),
  customer_id uuid references auth.users(id),
  sender text not null, message text not null,
  customer_visible boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.ops_alerts (
  id uuid primary key default gen_random_uuid(),
  gift_request_id uuid references public.gift_requests(id),
  customer_id uuid, confirmation_number text,
  severity text not null default 'warning' check (severity in ('info','warning','critical')),
  category text not null check (category in ('low_stock','out_of_stock','price_increase',
    'shipping_delay','deadline_approaching','order_failed','address_issue','backup_needed',
    'check_error','other')),
  message text not null, resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.product_checks (
  id uuid primary key default gen_random_uuid(),
  gift_request_id uuid not null references public.gift_requests(id),
  product_type text not null check (product_type in ('original','backup')),
  date_checked timestamptz, availability text, observed_price numeric,
  observed_shipping numeric, notes text, admin_id text,
  -- AI-read page checks are estimates for staff, never confirmed facts.
  is_estimate boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------- corporate side
create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null, description text,
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','annual')),
  price numeric not null default 0, currency text not null default 'usd',
  max_contacts int default 0, max_campaigns int default 0, max_users int default 0,
  monthly_sending_limit int default 0,
  features text[] default '{}', sort_order int default 0, active boolean not null default true,
  stripe_price_id text
);

create table public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status text not null default 'free_trial' check (status in
    ('free_trial','active','past_due','suspended','cancelled','expired')),
  stripe_customer_id text, stripe_subscription_id text,
  trial_ends_at timestamptz, current_period_end timestamptz, cancelled_at timestamptz
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  subscription_id uuid references public.organization_subscriptions(id),
  stripe_invoice_id text unique,
  amount numeric not null default 0,
  status text not null default 'open' check (status in ('draft','open','paid','void','uncollectible')),
  period_start timestamptz, period_end timestamptz, paid_date timestamptz,
  line_items jsonb default '[]'
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text,                       -- optional: a card with no name reads "from [company]"
  email text not null,
  unsubscribed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

create table public.contact_lists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null
);
create table public.contact_list_members (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.contact_lists(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  unique (list_id, contact_id)
);

create table public.card_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null, category text not null, image_url text,
  card_style text check (card_style in ('christmas','thanksgiving')),
  is_system_template boolean not null default true,
  active boolean not null default true
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null,
  template_id uuid references public.card_templates(id),
  list_id uuid references public.contact_lists(id),
  message text, delivery_date date, gift_card_amount numeric,
  card_style text not null default 'christmas' check (card_style in ('christmas','thanksgiving')),
  status text not null default 'draft' check (status in ('draft','pricing_review',
    'approval_required','payment_required','payment_processing','payment_failed',
    'paid_ready_for_fulfillment','in_fulfillment','sent','completed','canceled',
    'partially_refunded','fully_refunded')),
  created_by uuid, approved_by uuid,
  recipient_count int not null default 0,
  pricing_snapshot jsonb, stripe_payment_reference text,
  created_at timestamptz not null default now()
);

create table public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  org_id uuid not null references public.organizations(id),
  contact_id uuid not null references public.contacts(id),
  contact_email text,
  -- secret, unguessable link code (>= 32 hex chars). Looked up only by a server function.
  card_token text unique not null default encode(gen_random_bytes(24), 'hex'),
  email_status text not null default 'pending' check (email_status in ('pending','sent','failed')),
  gift_card_status text not null default 'none' check (gift_card_status in
    ('none','pending','issued','redeemed','failed')),
  gift_card_redemption_url text, gift_card_order_id text,
  sent_at timestamptz,
  unique (campaign_id, contact_id)
);
create index on public.campaign_recipients (campaign_id);

create table public.campaign_charges (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id),
  org_id uuid not null references public.organizations(id),
  breakdown jsonb, total numeric not null default 0,
  status text not null default 'pending' check (status in ('pending','payment_processing',
    'paid','payment_failed','partially_refunded','fully_refunded')),
  stripe_payment_reference text, payment_intent_id text unique,
  idempotency_key text unique, pricing_config jsonb,
  recipient_count int not null default 0, failure_reason text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------- revenue / ledger
create table public.revenue_settings (
  id uuid primary key default gen_random_uuid(),
  monthly_price numeric not null default 49, annual_price numeric not null default 470,
  free_trial_length int not null default 14,
  per_campaign_fee numeric not null default 5, per_recipient_fee numeric not null default 0.1,
  flat_service_fee numeric not null default 0, percentage_service_fee numeric not null default 5,
  min_service_fee numeric not null default 2.99, max_service_fee numeric not null default 49.99,
  greeting_card_service_fee numeric not null default 0,
  greeting_card_service_fee_percent numeric not null default 5,
  greeting_card_service_fee_min numeric not null default 2.99,
  greeting_card_service_fee_max numeric not null default 14.99,
  gift_card_service_fee numeric not null default 0.5,
  protection_reserve_rate numeric not null default 0.1,
  premium_feature_price numeric not null default 0,
  currency text not null default 'usd',
  tax_enabled boolean not null default false, tax_rate numeric not null default 0,
  coupon_enabled boolean not null default false, promo_enabled boolean not null default false,
  promo_code text not null default '', promo_discount_percent numeric not null default 0
);
-- only one settings row
create unique index revenue_settings_singleton on public.revenue_settings ((true));

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id),
  customer_id uuid references auth.users(id),
  category text not null check (category in ('subscription','greeting_card',
    'digital_gift_card','campaign','premium_feature','other')),
  product_type text, product_ref text, breakdown jsonb,
  base_amount numeric not null default 0, fee_amount numeric not null default 0,
  total numeric not null default 0,
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  stripe_payment_reference text,
  created_at timestamptz not null default now()
);
create unique index transactions_ref_cat on public.transactions (stripe_payment_reference, category)
  where stripe_payment_reference is not null;

-- Stripe event ids already handled: atomic duplicate protection for the webhook.
create table public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

-- ============================================================ security (RLS)
do $$
declare t text;
begin
  foreach t in array array['profiles','organizations','organization_members','recipients',
    'gift_requests','payments','activity_log','messages','ops_alerts','product_checks',
    'subscription_plans','organization_subscriptions','invoices','contacts','contact_lists',
    'contact_list_members','card_templates','campaigns','campaign_recipients',
    'campaign_charges','revenue_settings','transactions','stripe_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- Browser roles get table rights only; RLS decides rows. Nothing for anon except cards.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on function public.next_confirmation_number() from public, anon, authenticated;

-- profiles
grant select, update (full_name, phone) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- recipients (customer's own address book)
grant select, insert, update, delete on public.recipients to authenticated;
create policy recipients_all on public.recipients for all to authenticated
  using (customer_id = auth.uid() or public.is_admin())
  with check (customer_id = auth.uid() or public.is_admin());

-- gift requests: own rows; the guard trigger limits what customers may write
grant select, insert, update, delete on public.gift_requests to authenticated;
create policy gift_read on public.gift_requests for select to authenticated
  using (customer_id = auth.uid() or public.is_admin());
create policy gift_insert on public.gift_requests for insert to authenticated
  with check (customer_id = auth.uid() or public.is_admin());
create policy gift_update on public.gift_requests for update to authenticated
  using ((customer_id = auth.uid() and status in ('Draft','Awaiting Payment')) or public.is_admin())
  with check (customer_id = auth.uid() or public.is_admin());
create policy gift_delete on public.gift_requests for delete to authenticated
  using ((customer_id = auth.uid() and status in ('Draft','Awaiting Payment')) or public.is_admin());

-- read-only for customers on their own history; staff manage via admin policies
grant select on public.payments, public.activity_log to authenticated;
create policy payments_read on public.payments for select to authenticated
  using (customer_id = auth.uid() or public.is_admin());
create policy activity_read on public.activity_log for select to authenticated
  using (customer_id = auth.uid() or public.is_admin());
grant select on public.messages to authenticated;
create policy messages_read on public.messages for select to authenticated
  using ((customer_id = auth.uid() and customer_visible) or public.is_admin());
grant insert on public.messages to authenticated;
create policy messages_admin_write on public.messages for insert to authenticated
  with check (public.is_admin());

-- ops-only tables
grant select, insert, update, delete on public.ops_alerts, public.product_checks,
  public.revenue_settings, public.transactions to authenticated;
create policy ops_admin on public.ops_alerts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy checks_admin on public.product_checks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy revenue_admin on public.revenue_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy tx_admin_read on public.transactions for select to authenticated
  using (public.is_admin() or (org_id is not null and public.is_org_owner(org_id)));
create policy tx_admin_write on public.transactions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- stripe_events: no policy at all = server (service role) only.

-- plans: any signed-in user sees active plans; admin edits
grant select, insert, update, delete on public.subscription_plans to authenticated;
create policy plans_read on public.subscription_plans for select to authenticated
  using (active or public.is_admin());
create policy plans_admin on public.subscription_plans for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- organizations: members read; owners update name/branding; creation by server
grant select, update (name, logo_url, signature_url, default_message) on public.organizations to authenticated;
create policy org_read on public.organizations for select to authenticated
  using (public.is_org_member(id) or public.is_admin());
create policy org_update on public.organizations for update to authenticated
  using (public.is_org_owner(id) or public.is_admin())
  with check (public.is_org_owner(id) or public.is_admin());

grant select on public.organization_members to authenticated;
create policy members_read on public.organization_members for select to authenticated
  using (public.is_org_member(org_id) or public.is_admin());

-- subscription / invoices: org members read; all writes by Stripe webhook (server)
grant select on public.organization_subscriptions, public.invoices to authenticated;
create policy subs_read on public.organization_subscriptions for select to authenticated
  using (public.is_org_member(org_id) or public.is_admin());
create policy invoices_read on public.invoices for select to authenticated
  using (public.is_org_owner(org_id) or public.is_admin());

-- contacts and lists: members manage their own company's
grant select, insert, update, delete on public.contacts, public.contact_lists,
  public.contact_list_members to authenticated;
create policy contacts_all on public.contacts for all to authenticated
  using (public.is_org_member(org_id) or public.is_admin())
  with check (public.is_org_member(org_id) or public.is_admin());
create policy lists_all on public.contact_lists for all to authenticated
  using (public.is_org_member(org_id) or public.is_admin())
  with check (public.is_org_member(org_id) or public.is_admin());
create policy list_members_all on public.contact_list_members for all to authenticated
  using (public.is_org_member(org_id) or public.is_admin())
  with check (public.is_org_member(org_id) or public.is_admin());

-- card templates: anyone signed in reads; admin writes
grant select, insert, update, delete on public.card_templates to authenticated;
create policy templates_read on public.card_templates for select to authenticated
  using (active or public.is_admin());
create policy templates_admin on public.card_templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- campaigns: members read their company's; creating/paying/sending is server-only
grant select on public.campaigns, public.campaign_recipients, public.campaign_charges to authenticated;
create policy campaigns_read on public.campaigns for select to authenticated
  using (public.is_org_member(org_id) or public.is_admin());
create policy recipients_read on public.campaign_recipients for select to authenticated
  using (public.is_org_member(org_id) or public.is_admin());
create policy charges_read on public.campaign_charges for select to authenticated
  using (public.is_org_owner(org_id) or public.is_admin());

-- Seed: one settings row so pricing has a source (values match current Base44 defaults,
-- unconfirmed by founder).
insert into public.revenue_settings default values;
