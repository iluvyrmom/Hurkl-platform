-- Mason's discretionary-discount authority (owner-configured, tenant-
-- scoped) and a real, durable place for Mason to hand a conversation
-- to the owner instead of reflexively giving out the owner's phone
-- number. See lib/mason/discount-authority.ts, lib/mason/escalation.ts,
-- lib/mason/critical-review.ts, and lib/mason/system-prompt.ts for the
-- full behavior this powers.
--
-- Extends risk.ts's already-documented pattern (its own comment on
-- defaultAutonomyTierFor): "a tenant may configure a narrowly-scoped,
-- pre-approved workflow that runs a specific medium-risk action at
-- Tier 1 instead" — apply_discount defaults to medium risk / Tier 2
-- (Approval Required). This migration is that pre-approved workflow:
-- bounded, owner-configured, tenant-scoped. It is not a new autonomy
-- tier, not a second policy engine, and not a hardcoded A-1 rule —
-- every company gets the column, defaulted to zero (no discretion)
-- until its own owner configures otherwise.

-- ---------------------------------------------------------------------
-- Discretionary discount authority. Additive and optional for every
-- existing and future company. A hard, code-level ceiling
-- (DISCRETIONARY_DISCOUNT_HARD_CEILING_PERCENT in
-- lib/mason/discount-authority.ts) additionally clamps this at
-- runtime regardless of what's stored here — raising the ceiling
-- itself is a deliberate code change, not a configuration edit, per
-- the founder's "5% is a hard ceiling unless the owner explicitly
-- authorizes something else."
-- ---------------------------------------------------------------------
alter table public.companies
  add column discretionary_discount_max_percent numeric not null default 0
    check (discretionary_discount_max_percent >= 0 and discretionary_discount_max_percent <= 5);

-- A-1 Best Moving: the founder-approved 5% discretionary ceiling.
update public.companies
set discretionary_discount_max_percent = 5
where website_slug = 'a1-best-moving';

-- ---------------------------------------------------------------------
-- Owner escalations: a real, queryable place Mason hands a
-- conversation to the owner instead of reflexively surfacing a phone
-- number. Mirrors leads'/customers' shape and conventions (company-
-- scoped, staff-visible, no DELETE policy — append-only business
-- record). Only ever written by this platform's own trusted
-- server-side pipeline (lib/communications/inbound.ts, using the
-- service-role client) — there is no public/anonymous write path into
-- this table, unlike leads' submit_lead(), so (matching leads' own "no
-- INSERT policy for anyone" reasoning) no INSERT policy exists for any
-- role at all.
-- ---------------------------------------------------------------------
create table public.owner_escalations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  reason text not null check (
    reason in (
      'unsupported_pricing_claim_blocked',
      'owner_review_requested',
      'customer_requested_owner_contact'
    )
  ),
  customer_summary text not null,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  created_at timestamptz not null default now()
);

create index owner_escalations_company_id_idx on public.owner_escalations (company_id);

alter table public.owner_escalations enable row level security;

-- Staff can see and update their own company's escalations (e.g. mark
-- one acknowledged/resolved). Same cross-tenant hurkl_admin allowance
-- as leads_select_own_company.
create policy owner_escalations_select_own_company on public.owner_escalations
for select
using (
  company_id = public.current_company_id()
  or public.is_hurkl_admin()
);

create policy owner_escalations_update_own_company on public.owner_escalations
for update
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());
