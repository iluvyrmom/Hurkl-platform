-- A-1 Dump Estimator — schema skeleton, Phase 1.
--
-- Facilities are shared reference data (real-world dump sites), never owned
-- by a single tenant — every business_id-scoped table below references
-- them, but facilities themselves are not tenant-scoped. This is what lets
-- "the application chooses the best facility" work correctly once more than
-- one business/city is onboarded.
--
-- No Row-Level Security policies yet: Phase 1 has exactly one tenant (the
-- pilot business), same reasoning hurkl-platform's own M1.5 milestone used
-- for its throwaway-safe schema step. RLS keyed on business_id is real,
-- necessary work before a second tenant's data ever lands in this schema —
-- do not treat this table design as "already multi-tenant safe."

create extension if not exists "pgcrypto";

create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  phone text,
  email text,
  primary_address text,
  primary_latitude double precision,
  primary_longitude double precision,
  brand_primary_color text,
  brand_accent_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type facility_type as enum (
  'landfill',
  'transfer_station',
  'recycling_center',
  'donation_center',
  'scrap_yard'
);

create type debris_category as enum (
  'general_junk',
  'yard_debris',
  'construction_debris',
  'appliances',
  'tires',
  'electronics',
  'mattresses',
  'furniture',
  'metal_scrap',
  'hazmat'
);

create table facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  facility_type facility_type not null,
  address text not null,
  city text not null,
  state text not null,
  postal_code text not null,
  latitude double precision not null,
  longitude double precision not null,
  phone text,
  website text,
  accepted_debris debris_category[] not null default '{}',
  prohibited_debris debris_category[] not null default '{}',
  hazmat_notes text,
  max_load_weight_lbs numeric,
  is_active boolean not null default true,
  -- Provenance for the facility's own listed facts (address/phone/hours/
  -- accepted materials) — see facility_pricing_rules and
  -- facility_special_fees for the same provenance on rates. Never trust a
  -- facility record for a real customer quote while requires_verification
  -- is true without a human confirming it against source_url first.
  source_url text,
  last_verified_date date,
  requires_verification boolean not null default true,
  verification_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index facilities_city_state_idx on facilities (state, city);
create index facilities_active_idx on facilities (is_active) where is_active;

create table facility_hours (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  opens_at time,
  closes_at time,
  closed boolean not null default false,
  unique (facility_id, day_of_week)
);

create type pricing_unit as enum ('per_ton', 'per_yard', 'per_item', 'flat');

-- Historical + future pricing: a row's validity window is
-- [effective_date, end_date). end_date null = currently in effect. Old rows
-- are never overwritten, so a past estimate stays auditable against the
-- rate that was actually live when it was quoted.
create table facility_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities (id) on delete cascade,
  debris_category debris_category not null,
  unit pricing_unit not null,
  rate numeric not null check (rate >= 0),
  minimum_fee numeric check (minimum_fee is null or minimum_fee >= 0),
  effective_date date not null,
  end_date date,
  notes text,
  -- Same provenance contract as facilities.source_url/last_verified_date/
  -- requires_verification: a rate entered here without a confirmed source
  -- must be marked requires_verification = true, never presented to a
  -- customer as a firm number. See lib/domain/facility.ts SourceVerification.
  source_url text,
  last_verified_date date,
  requires_verification boolean not null default true,
  verification_notes text,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date > effective_date)
);

create index facility_pricing_rules_lookup_idx
  on facility_pricing_rules (facility_id, debris_category, effective_date);

create table facility_special_fees (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities (id) on delete cascade,
  item_label text not null,
  fee numeric not null check (fee >= 0),
  effective_date date not null,
  end_date date,
  notes text,
  source_url text,
  last_verified_date date,
  requires_verification boolean not null default true,
  verification_notes text,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date > effective_date)
);

create index facility_special_fees_lookup_idx on facility_special_fees (facility_id, item_label);
