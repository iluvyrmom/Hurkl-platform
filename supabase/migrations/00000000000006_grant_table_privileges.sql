-- Fixes a real production incident (first live Telegram message on
-- 2026-08-06): every migration so far assumed a Supabase project
-- grants standard table privileges (SELECT/INSERT/UPDATE/DELETE) to
-- `anon`/`authenticated`/`service_role` natively, the way Supabase's
-- own project bootstrap normally does. That assumption was already
-- written down for local tests — see
-- lib/db/test-support/local-role-grants.sql's comment: "A real
-- Supabase project grants these to `authenticated` itself, natively."
-- It turned out to be false for this project: every table had only
-- structural privileges (TRIGGER/TRUNCATE/REFERENCES), and every real
-- request from the app — via the service-role client, no less — was
-- failing with Postgres error 42501 ("permission denied"), silently
-- swallowed by lib/communications/telegram-identity.ts's error
-- handling as "unrecognized sender." Row-Level Security was never the
-- problem; the roles never had table-level access to begin with.
--
-- Idempotent: GRANT is a no-op if the privilege already exists, so
-- this is safe to run against a project that already has these
-- (e.g. one bootstrapped normally by Supabase).
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant select on all tables in schema public to anon;

grant usage, select on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

-- Without this, every table created by a *future* migration would
-- silently repeat the exact same incident.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant select on tables to anon;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;
