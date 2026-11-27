-- Denormalized "payment status attached to the job" — kept in sync by
-- lib/payments/service.ts whenever a payments row's status changes
-- (webhook-driven for card payments, immediate for owner-recorded cash).
-- The payments table (migration 00000000000005) remains the source of
-- truth/audit trail; this column exists purely so job list/detail views
-- don't need a join to show payment state.

alter table jobs
  add column payment_status payment_status not null default 'pending';

create index jobs_payment_status_idx on jobs (business_id, payment_status);
