-- LOCAL TEST-ONLY STUB. Never applied to a real Supabase project, and
-- not part of supabase/migrations/ for that exact reason.
--
-- Supabase provides a real `auth` schema (managed by Supabase Auth /
-- GoTrue) with an `auth.users` table and an `auth.uid()` function that
-- reads the authenticated user's ID from the request's JWT. Our
-- migrations reference both, so they run unmodified against a real
-- Supabase project. This file recreates a minimal, compatible stand-in
-- against a vanilla local Postgres so the exact same RLS policies can
-- be exercised by automated tests without Supabase Auth running.
--
-- Tests set the current "authenticated user" per connection via:
--   select set_config('app.test_current_user_id', '<uuid>', true);
-- auth.uid() below reads that session-local setting.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.test_current_user_id', true), '')::uuid;
$$;
