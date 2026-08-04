-- LOCAL TEST-ONLY SETUP. Never applied to a real Supabase project.
--
-- The actual table/function privileges for the `authenticated` role
-- (created earlier by local-role-create.sql, before the migrations ran)
-- — these must run AFTER the migrations, since "grant ... on all
-- tables in schema public" only affects tables that already exist at
-- the moment this statement runs, not ones created later. A real
-- Supabase project grants these to `authenticated` itself, natively.

grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on auth.users to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on function auth.uid() to authenticated;
