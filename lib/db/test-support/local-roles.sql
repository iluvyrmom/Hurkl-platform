-- LOCAL TEST-ONLY SETUP. Never applied to a real Supabase project.
--
-- A real Supabase project already provides `anon`, `authenticated`, and
-- `service_role` Postgres roles out of the box. Locally, we recreate
-- just the one this test suite needs (`authenticated`) so RLS policies
-- are actually exercised by a non-superuser connection — the Postgres
-- table owner/superuser bypasses RLS entirely, so testing as that role
-- would prove nothing.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on auth.users to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on function auth.uid() to authenticated;
