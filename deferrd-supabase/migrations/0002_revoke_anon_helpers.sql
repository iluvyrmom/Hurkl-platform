-- Helper functions are only needed by signed-in users' policies, not by anonymous callers.
revoke execute on function public.is_admin(), public.is_org_member(uuid), public.is_org_owner(uuid) from public, anon;
grant execute on function public.is_admin(), public.is_org_member(uuid), public.is_org_owner(uuid) to authenticated, service_role;
