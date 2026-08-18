-- Customers, estimates, and estimate photos. All business_id-scoped —
-- future RLS policy will key on this column once a second tenant exists.

create table customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  address text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_business_idx on customers (business_id);
create index customers_phone_idx on customers (business_id, phone);

create type estimate_status as enum (
  'draft',
  'sent',
  'approved',
  'declined',
  'expired',
  'converted_to_job'
);

create type estimate_tier as enum ('low', 'recommended', 'premium');

create table estimates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  quote_number text not null unique,
  customer_id uuid references customers (id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  address text not null,
  latitude double precision,
  longitude double precision,
  notes text not null default '',
  manual_items jsonb not null default '[]',
  status estimate_status not null default 'draft',
  -- Computed tiers/breakdowns are stored as a point-in-time snapshot (the
  -- engine's output), not recomputed on every read — a sent quote must
  -- never silently change price if pricing rules are edited later.
  tiers jsonb not null default '[]',
  selected_tier estimate_tier,
  selected_facility_id uuid references facilities (id) on delete set null,
  selected_facility_snapshot jsonb,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index estimates_business_idx on estimates (business_id, created_at desc);
create index estimates_customer_idx on estimates (customer_id);

create table estimate_photos (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references estimates (id) on delete cascade,
  storage_path text not null,
  source text not null check (source in ('upload', 'camera')),
  analysis jsonb,
  uploaded_at timestamptz not null default now()
);

create index estimate_photos_estimate_idx on estimate_photos (estimate_id);
