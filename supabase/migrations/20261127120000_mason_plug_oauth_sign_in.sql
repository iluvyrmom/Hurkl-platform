-- HURKL plug: sign-in (OAuth) connections, for ChatGPT.
--
-- Claude keeps its plug key (mason_connector_check, unchanged). An AI that connects by signing in
-- through Supabase Auth's OAuth server (ChatGPT) gets one mason_connectors row per OAuth client,
-- so it has the same daily write limit, the same last-used time and the same Revoke button in the
-- Mason app as a plug key. The row is created the first time a signed-in client calls the plug;
-- that client exists only because the founder approved it on the consent page.
-- Once revoked, that client stays blocked even while its sign-in token is still valid.

alter table public.mason_connectors
  add column if not exists oauth_client_id text unique,
  add column if not exists oauth_user_id uuid references auth.users(id);

comment on column public.mason_connectors.oauth_client_id is
  'Set for sign-in (OAuth) connections such as ChatGPT; null for plug keys. token_hash then holds a placeholder that no plug key can match.';

create or replace function public.mason_oauth_connector_check(p_client_id text, p_user_id uuid, p_is_write boolean)
returns table (connector_id uuid, connector_name text, allowed boolean)
language plpgsql security definer set search_path = public, auth
as $$
#variable_conflict use_column
declare c public.mason_connectors; u public.mason_connector_usage; v_name text;
begin
  if coalesce(p_client_id, '') = '' or p_user_id is null then return; end if;
  select * into c from public.mason_connectors mc where mc.oauth_client_id = p_client_id;
  if c.id is null then
    select left(coalesce(nullif(trim(oc.client_name), ''), 'Signed-in AI'), 60) into v_name
      from auth.oauth_clients oc where oc.id::text = p_client_id and oc.deleted_at is null;
    if v_name is null then return; end if;  -- unknown or deleted client
    insert into public.mason_connectors (name, token_hash, oauth_client_id, oauth_user_id)
    values (v_name || ' (sign-in)', 'oauth:' || p_client_id, p_client_id, p_user_id)
    on conflict (oauth_client_id) do nothing;
    select * into c from public.mason_connectors mc where mc.oauth_client_id = p_client_id;
  end if;
  if c.revoked_at is not null then return; end if;
  insert into public.mason_connector_usage as mu (connector_id, day, writes, reads)
  values (c.id, current_date, case when p_is_write then 1 else 0 end, case when p_is_write then 0 else 1 end)
  on conflict on constraint mason_connector_usage_pkey do update
    set writes = mu.writes + case when p_is_write then 1 else 0 end,
        reads  = mu.reads  + case when p_is_write then 0 else 1 end
  returning * into u;
  update public.mason_connectors mc set last_used_at = now() where mc.id = c.id;
  return query select c.id, c.name, (not p_is_write) or u.writes <= c.daily_write_limit;
end $$;

revoke all on function public.mason_oauth_connector_check(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.mason_oauth_connector_check(text, uuid, boolean) to service_role;
