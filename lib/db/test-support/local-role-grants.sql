-- LOCAL TEST-ONLY SETUP. Never applied to a real Supabase project.
--
-- The `public` schema's table/function privileges are now granted by
-- 00000000000006_grant_table_privileges.sql itself (run as one of the
-- real migrations, in MIGRATION_FILES order) — see that file's comment
-- for why. What's left here is only the local auth-schema *stub*'s own
-- privileges (auth-stub.sql), which aren't part of any real migration
-- since a real Supabase project provides the `auth` schema natively.

grant usage on schema auth to authenticated;
grant select on auth.users to authenticated;
grant execute on function auth.uid() to authenticated;
