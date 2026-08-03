-- LOCAL TEST-ONLY SETUP. Never applied to a real Supabase project.
--
-- Just the role itself, created before the real migrations run — one
-- of those migrations (00000000000003_company_onboarding.sql) grants
-- EXECUTE on a function to `authenticated`, which requires the role to
-- already exist. On a real Supabase project this is a non-issue:
-- `authenticated` is provided natively from day one. See
-- local-role-grants.sql for the privileges themselves, which can only
-- be granted after the migrations create the tables/functions they
-- apply to.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;
