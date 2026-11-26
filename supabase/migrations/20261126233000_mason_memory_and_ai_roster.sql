-- Mason's memory (the Memory Specialist's store), the AI roster, and the keys that let
-- approved AI tools plug into Mason through the HURKL plug (mason-mcp Edge Function).
--
-- Rules enforced here, in the database itself:
--   * Three walls: hurkl_core (Mason's own skills/lessons), company (one company's private file),
--     founder (Josh's private notes). A company entry must name its company.
--   * Nothing is ever deleted. A change is a new entry that "replaces" the old one.
--   * Rules and decisions written by an AI tool wait for the founder's approval.
--   * Anything that looks like a password, key or card number is refused.
--   * Only HURKL admins can read or write from the app; AI tools go through mason-mcp
--     (service role), which checks their own key and daily write limit.

-- ---------- memory ----------
create table public.mason_memory (
  id            uuid primary key default gen_random_uuid(),
  scope         text not null check (scope in ('hurkl_core','company','founder')),
  company_id    uuid references public.companies(id),
  kind          text not null check (kind in ('decision','rule','lesson','fact','task','note')),
  title         text not null check (char_length(title) between 1 and 200),
  body          text not null default '' check (char_length(body) <= 8000),
  status        text not null default 'active'
                check (status in ('active','pending_approval','replaced','declined')),
  task_status   text check (task_status in ('open','in_progress','done')),
  assigned_to   text check (char_length(assigned_to) <= 80),
  tags          text[] not null default '{}',
  source        text not null check (char_length(source) between 1 and 80),
  source_ref    text check (char_length(source_ref) <= 300),
  replaces_id   uuid references public.mason_memory(id),
  approved_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  search        tsvector generated always as (to_tsvector('english', title || ' ' || body)) stored,
  constraint mason_memory_company_scope check ((scope = 'company') = (company_id is not null)),
  constraint mason_memory_task_fields check ((kind = 'task') = (task_status is not null))
);
create index mason_memory_search_idx on public.mason_memory using gin (search);
create index mason_memory_scope_idx on public.mason_memory (scope, company_id, status, kind);
create index mason_memory_tasks_idx on public.mason_memory (task_status) where kind = 'task';

create or replace function public.mason_text_has_secret(t text)
returns boolean language sql immutable as $$
  select coalesce(t, '') ~* (
    '(sk|rk)_(live|test)_[a-z0-9]{12,}|whsec_[a-z0-9]{12,}|sb_secret_[a-z0-9_-]{10,}'
    || '|akia[0-9a-z]{16}|eyj[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.|-----begin [a-z ]*private key'
    || '|ghp_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,}|xox[abp]-[a-z0-9-]{10,}|aiza[0-9a-z_-]{30,}'
    || '|\msk-[a-z0-9_-]{20,}|mason_[a-f0-9]{40,}'
    || '|(password|passwd|api[ _-]?key|secret[ _-]?key|auth[ _-]?token)\s*[:=]\s*\S{6,}'
    -- card numbers: grouped (1234 5678 9012 3456) or a bare 15-16 digit number starting 3-6
    || '|\m\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,7}\M|\m[3-6]\d{14,15}\M'
  );
$$;

create or replace function public.mason_memory_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.mason_text_has_secret(new.title) or public.mason_text_has_secret(new.body)
     or public.mason_text_has_secret(array_to_string(new.tags, ' ')) then
    raise exception 'mason_memory_refused_secret'
      using hint = 'Passwords, keys and card numbers never go in Mason''s memory.';
  end if;
  if tg_op = 'UPDATE' then
    -- Entries are never rewritten. Only status/task fields may change; a new version is a new row.
    if new.title is distinct from old.title or new.body is distinct from old.body
       or new.scope is distinct from old.scope or new.company_id is distinct from old.company_id
       or new.kind is distinct from old.kind or new.source is distinct from old.source then
      raise exception 'mason_memory_is_append_only'
        using hint = 'Add a new entry that replaces this one instead of editing it.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger mason_memory_guard before insert or update on public.mason_memory
  for each row execute function public.mason_memory_guard();

-- ---------- AI roster ----------
create table public.mason_ai_roster (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique check (char_length(name) between 1 and 80),
  maker            text check (char_length(maker) <= 80),
  connection       text not null default 'opened_by_josh'
                   check (connection in ('plugged_in','opened_by_josh','api_ready','not_set_up')),
  best_for         text[] not null default '{}',
  monthly_cost_usd numeric(10,2),
  cost_notes       text check (char_length(cost_notes) <= 1000),
  notes            text check (char_length(notes) <= 2000),
  last_verified_on date,
  verified_from    text check (char_length(verified_from) <= 500),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.mason_ai_jobs (
  id          uuid primary key default gen_random_uuid(),
  roster_id   uuid not null references public.mason_ai_roster(id),
  task_type   text not null check (char_length(task_type) between 1 and 40),
  outcome     text not null check (outcome in ('great','ok','redo','failed')),
  cost_usd    numeric(10,2),
  summary     text not null default '' check (char_length(summary) <= 2000),
  source      text not null check (char_length(source) between 1 and 80),
  created_at  timestamptz not null default now()
);
create index mason_ai_jobs_roster_idx on public.mason_ai_jobs (roster_id, task_type);

-- Ranked picks for a task type: proven results first, then what's plugged in, then cheapest.
create or replace view public.mason_ai_picks with (security_invoker = true) as
select r.id, r.name, r.connection, r.best_for, r.monthly_cost_usd, r.cost_notes, r.last_verified_on,
       t.task_type,
       count(j.id)                                   as jobs_done,
       round(avg(case j.outcome when 'great' then 1 when 'ok' then .7 when 'redo' then .2 else 0 end)::numeric, 2)
                                                     as success_score,
       round(avg(j.cost_usd)::numeric, 2)            as avg_cost_usd
from public.mason_ai_roster r
cross join lateral unnest(r.best_for) as t(task_type)
left join public.mason_ai_jobs j on j.roster_id = r.id and j.task_type = t.task_type
where r.active
group by r.id, t.task_type;

-- ---------- keys for AI tools (the HURKL plug) ----------
create table public.mason_connectors (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(name) between 1 and 60),
  token_hash        text not null unique,
  daily_write_limit integer not null default 150 check (daily_write_limit between 1 and 2000),
  created_at        timestamptz not null default now(),
  last_used_at      timestamptz,
  revoked_at        timestamptz
);
create table public.mason_connector_usage (
  connector_id uuid not null references public.mason_connectors(id),
  day          date not null default current_date,
  writes       integer not null default 0,
  reads        integer not null default 0,
  primary key (connector_id, day)
);

-- ---------- row-level security ----------
alter table public.mason_memory          enable row level security;
alter table public.mason_ai_roster       enable row level security;
alter table public.mason_ai_jobs         enable row level security;
alter table public.mason_connectors      enable row level security;
alter table public.mason_connector_usage enable row level security;

create policy mason_memory_admin_read   on public.mason_memory    for select to authenticated using (public.is_hurkl_admin());
create policy mason_memory_admin_insert on public.mason_memory    for insert to authenticated with check (public.is_hurkl_admin());
create policy mason_memory_admin_update on public.mason_memory    for update to authenticated using (public.is_hurkl_admin()) with check (public.is_hurkl_admin());
create policy mason_roster_admin_read   on public.mason_ai_roster for select to authenticated using (public.is_hurkl_admin());
create policy mason_roster_admin_write  on public.mason_ai_roster for insert to authenticated with check (public.is_hurkl_admin());
create policy mason_roster_admin_update on public.mason_ai_roster for update to authenticated using (public.is_hurkl_admin()) with check (public.is_hurkl_admin());
create policy mason_jobs_admin_read     on public.mason_ai_jobs   for select to authenticated using (public.is_hurkl_admin());
create policy mason_jobs_admin_insert   on public.mason_ai_jobs   for insert to authenticated with check (public.is_hurkl_admin());
create policy mason_connectors_admin_read on public.mason_connectors for select to authenticated using (public.is_hurkl_admin());
create policy mason_usage_admin_read    on public.mason_connector_usage for select to authenticated using (public.is_hurkl_admin());
-- No delete policies anywhere: nothing in Mason's memory is ever deleted from the app.

grant select, insert, update on public.mason_memory, public.mason_ai_roster to authenticated;
grant select, insert on public.mason_ai_jobs to authenticated;
grant select on public.mason_connector_usage, public.mason_ai_picks to authenticated;
-- Connector key hashes are never readable from the app: column-level grant without token_hash.
grant select (id, name, daily_write_limit, created_at, last_used_at, revoked_at) on public.mason_connectors to authenticated;
revoke all on public.mason_memory, public.mason_ai_roster, public.mason_ai_jobs,
              public.mason_connectors, public.mason_connector_usage, public.mason_ai_picks from anon;

-- ---------- founder actions (app) ----------
create or replace function public.mason_decide(p_id uuid, p_approve boolean)
returns text language plpgsql security definer set search_path = public as $$
declare m public.mason_memory;
begin
  if not public.is_hurkl_admin() then raise exception 'not_allowed'; end if;
  select * into m from public.mason_memory where id = p_id for update;
  if m.id is null or m.status <> 'pending_approval' then return 'not_pending'; end if;
  update public.mason_memory set status = case when p_approve then 'active' else 'declined' end,
         approved_at = case when p_approve then now() end where id = p_id;
  if p_approve and m.replaces_id is not null then
    update public.mason_memory set status = 'replaced' where id = m.replaces_id and status = 'active';
  end if;
  insert into public.audit_log (company_id, actor_user_id, action, autonomy_tier, policy_reference, subject_type, subject_id, metadata)
  values (coalesce(m.company_id, '00000000-0000-0000-0000-000000000001'), auth.uid(),
          case when p_approve then 'mason_memory_approved' else 'mason_memory_declined' end,
          'tier_2_approval_required', 'mason_memory_founder_approval', 'mason_memory', p_id::text,
          jsonb_build_object('kind', m.kind, 'source', m.source));
  return case when p_approve then 'approved' else 'declined' end;
end $$;

create or replace function public.mason_create_connector(p_name text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare tok text;
begin
  if not public.is_hurkl_admin() then raise exception 'not_allowed'; end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 60 then raise exception 'bad_name'; end if;
  tok := 'mason_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.mason_connectors (name, token_hash) values (trim(p_name), encode(extensions.digest(tok, 'sha256'), 'hex'));
  insert into public.audit_log (company_id, actor_user_id, action, autonomy_tier, policy_reference, subject_type, subject_id, metadata)
  values ('00000000-0000-0000-0000-000000000001', auth.uid(), 'mason_connector_created', 'tier_2_approval_required',
          'mason_plug_keys', 'mason_connector', null, jsonb_build_object('name', trim(p_name)));
  return tok; -- shown once to the founder; only its hash is stored
end $$;

create or replace function public.mason_revoke_connector(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_hurkl_admin() then raise exception 'not_allowed'; end if;
  update public.mason_connectors set revoked_at = now() where id = p_id and revoked_at is null;
end $$;

-- ---------- plug helpers (service role only, used by the mason-mcp Edge Function) ----------
create or replace function public.mason_connector_check(p_token text, p_is_write boolean)
returns table (connector_id uuid, connector_name text, allowed boolean)
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare c public.mason_connectors; u public.mason_connector_usage;
begin
  select * into c from public.mason_connectors mc
   where mc.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') and mc.revoked_at is null;
  if c.id is null then return; end if;
  insert into public.mason_connector_usage as mu (connector_id, day, writes, reads)
  values (c.id, current_date, case when p_is_write then 1 else 0 end, case when p_is_write then 0 else 1 end)
  on conflict on constraint mason_connector_usage_pkey do update
    set writes = mu.writes + case when p_is_write then 1 else 0 end,
        reads  = mu.reads  + case when p_is_write then 0 else 1 end
  returning * into u;
  update public.mason_connectors mc set last_used_at = now() where mc.id = c.id;
  return query select c.id, c.name, (not p_is_write) or u.writes <= c.daily_write_limit;
end $$;

revoke all on function public.mason_decide(uuid, boolean), public.mason_create_connector(text),
                       public.mason_revoke_connector(uuid) from public, anon;
grant execute on function public.mason_decide(uuid, boolean), public.mason_create_connector(text),
                          public.mason_revoke_connector(uuid) to authenticated;
revoke all on function public.mason_connector_check(text, boolean) from public, anon, authenticated;
grant execute on function public.mason_connector_check(text, boolean) to service_role;
revoke all on function public.mason_text_has_secret(text) from anon;
