-- LOCAL TEST-ONLY SETUP. Never applied to a real Supabase project.
--
-- Just the roles themselves, created before the real migrations run —
-- one of those migrations (00000000000003_company_onboarding.sql)
-- grants EXECUTE on a function to `authenticated`, and
-- 00000000000006_grant_table_privileges.sql grants table/function
-- privileges to all three, both of which require the roles to already
-- exist. On a real Supabase project this is a non-issue: `anon`,
-- `authenticated`, and `service_role` are provided natively from day
-- one. See local-role-grants.sql for the remaining auth-schema-stub
-- privileges, which can only be granted after the migrations run.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end
$$;
