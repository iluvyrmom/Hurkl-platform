-- Payment transactions: digital-first (Stripe Checkout) with an
-- owner-recorded cash fallback. Webhook-authoritative — only the Stripe
-- webhook handler (app/api/stripe/webhook/route.ts) ever moves a row from
-- 'pending' to 'paid'/'failed'; a client-side redirect is never trusted.

create type payment_method as enum ('card', 'cash');
create type payment_status as enum ('pending', 'paid', 'refunded', 'partially_refunded', 'failed');

create table payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  job_id uuid not null references jobs (id) on delete restrict,
  provider text not null,
  method payment_method not null,
  provider_session_id text,
  provider_payment_intent_id text,
  amount numeric not null check (amount >= 0),
  currency text not null default 'usd',
  status payment_status not null default 'pending',
  refunded_amount numeric not null default 0 check (refunded_amount >= 0),
  -- Enforces "retrying a charge never double-charges" at the database
  -- layer, not just in application code.
  idempotency_key text not null unique,
  recorded_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (refunded_amount <= amount)
);

create index payments_business_idx on payments (business_id, created_at desc);
create index payments_job_idx on payments (job_id);
create index payments_session_idx on payments (provider_session_id);
create index payments_payment_intent_idx on payments (provider_payment_intent_id);

alter table payments enable row level security;

create policy "members can manage their business's payments"
  on payments for all
  using (is_business_member(business_id))
  with check (is_business_member(business_id));

-- The Stripe webhook handler runs with the service-role key (never a user
-- session — Stripe isn't a signed-in business member), so it bypasses RLS
-- by design by using the service role client, not by a broader policy here.
