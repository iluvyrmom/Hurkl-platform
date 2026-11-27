-- Receipt OCR extraction fields, plus duplicate-receipt detection.
--
-- dump_receipt_image_path is never overwritten once a job is completed
-- (the application layer only ever inserts a completion once — see
-- lib/jobs/service.ts) — that IS "preserve the original receipt": the
-- exact image a crew member uploaded stays the permanent record, and OCR
-- only ever adds assistive, human-reviewable data alongside it.

alter table job_completions
  add column facility_name_guess text,
  add column ticket_number text,
  add column receipt_date date,
  add column receipt_time time,
  add column gross_weight_lbs numeric,
  add column tare_weight_lbs numeric,
  add column net_weight_lbs numeric,
  add column amount_charged numeric,
  -- SHA-256 of the receipt image bytes — the primary duplicate signal
  -- (same photo reused for a second job). Ticket number is a secondary
  -- signal (same physical receipt re-photographed at a different angle).
  add column receipt_image_hash text,
  add column duplicate_of_job_id uuid references jobs (id) on delete set null,
  -- A duplicate match blocks completion (see lib/jobs/service.ts) until a
  -- human explicitly confirms it's not a mistake/reused photo.
  add column duplicate_override_confirmed boolean not null default false,
  add column duplicate_override_by_user_id uuid;

create index job_completions_receipt_hash_idx on job_completions (receipt_image_hash);
create index job_completions_ticket_number_idx on job_completions (ticket_number);
