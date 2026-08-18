-- Scheduling, job completion, and the estimator's learning-system tables.

create type job_status as enum ('scheduled', 'in_progress', 'completed', 'cancelled');

create table jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  estimate_id uuid not null references estimates (id) on delete restrict,
  customer_id uuid not null references customers (id) on delete restrict,
  selected_tier estimate_tier not null,
  agreed_price numeric not null check (agreed_price >= 0),
  crew_size smallint not null check (crew_size between 1 and 4),
  facility_id uuid references facilities (id) on delete set null,
  scheduled_at timestamptz not null,
  status job_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_business_schedule_idx on jobs (business_id, scheduled_at);
create index jobs_status_idx on jobs (business_id, status);

-- Job completion requires clean-site photos and an official dump receipt
-- before a job can be marked complete — enforced at the application layer
-- (see lib/jobs/service.ts); this table just stores the evidence.
create table job_completions (
  job_id uuid primary key references jobs (id) on delete cascade,
  clean_site_photo_paths text[] not null default '{}',
  dump_receipt_image_path text,
  dump_receipt_ocr jsonb,
  dump_receipt_verified_by uuid,
  actual_weight_lbs numeric,
  actual_dump_fee numeric,
  actual_labor_hours numeric,
  completed_at timestamptz,
  completed_by_user_id uuid
);

-- One row per completed job: estimated vs. actual, across weight, dump
-- fee, labor, and profit. This is the raw material for the learning
-- system — nothing here decides *how* future estimates use this history,
-- that's service-layer logic still to be built past Phase 1.
create table learning_records (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references jobs (id) on delete cascade,
  business_id uuid not null references businesses (id) on delete cascade,
  estimated_weight_lbs numeric not null,
  actual_weight_lbs numeric,
  estimated_dump_fee numeric not null,
  actual_dump_fee numeric,
  estimated_labor_hours numeric not null,
  actual_labor_hours numeric,
  estimated_profit numeric not null,
  actual_profit numeric,
  recorded_at timestamptz not null default now()
);

create index learning_records_business_idx on learning_records (business_id, recorded_at desc);
