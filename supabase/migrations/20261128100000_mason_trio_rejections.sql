-- Why a check said no. Each Talk reply's audit row keeps every rejection from Memory or the
-- Verifier (which attempt, and the reasons), whether the corrected reply then passed or not.
-- This is what the Learner learns from (founder direction 2026-11-28: "learn, improve").
alter table public.mason_trio_checks
  add column if not exists rejections jsonb not null default '[]'::jsonb;
