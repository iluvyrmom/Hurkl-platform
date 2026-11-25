-- Job Rooms: a private, shareable photo + chat space for one upcoming job.
--
-- The owner creates a room in the HURKL owner app and texts its link to a
-- customer, contractor, or property manager. The guest opens the link with no
-- account and sees ONLY that one room. See owner-app/README.md and
-- docs/job-rooms.md.
--
-- Add-on: every company starts with job_rooms_addon = false. Only HURKL can
-- turn it on (it is sold separately), so nothing here changes how any existing
-- company's app behaves until HURKL switches it on for them.
--
-- Security model:
--   * Owners read and write ONLY through the jr_* functions below (each checks:
--     signed in, role = owner, add-on on, room belongs to the owner's company).
--     RLS select policies are defense in depth.
--   * Guests never touch the database directly. The job-room Edge Function
--     (service role) calls the jr_guest_* functions, which resolve everything
--     from the room's link token and enforce link on/off, 90-day expiry, and
--     rate limits in the database itself.
--   * Photos live in a PRIVATE storage bucket and are only ever shown through
--     short-lived signed URLs created by the Edge Function.
--
-- Additive only: three new tables, one new companies column, one new private
-- bucket, and 'job_room' added to push_deliveries' allowed kinds.
-- Rollback (removes all Job Room data):
--   drop table public.job_room_messages, public.job_room_guests, public.job_rooms;
--   alter table public.companies drop column job_rooms_addon;
--   (and remove the 'job-room-photos' bucket from the Storage dashboard)

-- ---------------------------------------------------------------------------
-- Add-on switch (HURKL-controlled, per company)
-- ---------------------------------------------------------------------------
alter table public.companies
  add column if not exists job_rooms_addon boolean not null default false;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.job_rooms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- The share link's secret. Random 256-bit value, base64url. Readable only by
  -- the room's own owner (through jr_owner_rooms) so they can re-share the link.
  link_token text not null unique check (char_length(link_token) >= 40),
  link_enabled boolean not null default true,
  last_activity_at timestamptz not null default now(),
  owner_last_read_at timestamptz not null default now(),
  last_notified_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index job_rooms_company_idx on public.job_rooms (company_id, last_activity_at desc);

create table public.job_room_guests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.job_rooms (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  -- SHA-256 of the guest's device secret. The secret itself is only ever held
  -- by the guest's browser.
  secret_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index job_room_guests_room_idx on public.job_room_guests (room_id, created_at);

create table public.job_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.job_rooms (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  author_kind text not null check (author_kind in ('owner', 'guest')),
  author_user_id uuid references auth.users (id) on delete set null,
  guest_id uuid references public.job_room_guests (id) on delete set null,
  body text check (body is null or char_length(btrim(body)) between 1 and 2000),
  photo_path text,
  photo_mime text check (photo_mime is null or photo_mime in ('image/jpeg', 'image/png', 'image/heic', 'image/heif')),
  photo_bytes integer check (photo_bytes is null or photo_bytes between 1 and 10485760),
  state text not null default 'visible' check (state in ('pending_upload', 'visible', 'deleted')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint job_room_messages_has_content check (state = 'deleted' or body is not null or photo_path is not null)
);
create index job_room_messages_room_idx on public.job_room_messages (room_id, created_at);
create index job_room_messages_guest_idx on public.job_room_messages (guest_id, created_at);

alter table public.job_rooms enable row level security;
alter table public.job_room_guests enable row level security;
alter table public.job_room_messages enable row level security;

-- Nobody signed out may read these tables, ever.
revoke all on public.job_rooms, public.job_room_guests, public.job_room_messages from anon;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.jr_new_secret()
returns text language sql volatile set search_path = public, extensions as $$
  select rtrim(translate(encode(gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
$$;

create or replace function public.jr_hash(p_value text)
returns text language sql immutable set search_path = public, extensions as $$
  select encode(digest(coalesce(p_value, ''), 'sha256'), 'hex');
$$;

-- The company id of the signed-in owner, if Job Rooms is on for that company.
-- Used by RLS policies (returns null instead of raising).
create or replace function public.jr_owner_company_or_null()
returns uuid language sql stable security definer set search_path = public as $$
  select p.company_id
    from public.profiles p
    join public.companies c on c.id = p.company_id
   where p.id = auth.uid() and p.role = 'owner' and c.job_rooms_addon;
$$;

-- Same, but raises a clear error for the owner functions below.
create or replace function public.jr_require_owner()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  v_company uuid;
  v_role text;
  v_addon boolean;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select p.company_id, p.role::text, c.job_rooms_addon
    into v_company, v_role, v_addon
    from public.profiles p
    left join public.companies c on c.id = p.company_id
   where p.id = auth.uid();
  if v_company is null or v_role is distinct from 'owner' then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if not coalesce(v_addon, false) then
    raise exception 'job_rooms_off' using errcode = '42501';
  end if;
  return v_company;
end;
$$;

-- A room the signed-in owner may manage, locked for update.
create or replace function public.jr_owner_room(p_room_id uuid)
returns public.job_rooms language plpgsql volatile security definer set search_path = public as $$
declare
  v_company uuid := public.jr_require_owner();
  v_room public.job_rooms;
begin
  select * into v_room from public.job_rooms where id = p_room_id and company_id = v_company for update;
  if v_room.id is null then
    raise exception 'room_not_found' using errcode = 'P0002';
  end if;
  return v_room;
end;
$$;

-- 'ok' | 'off' | 'expired'. A link expires after 90 days with no activity.
create or replace function public.jr_room_status(p_room public.job_rooms)
returns text language sql stable set search_path = public as $$
  select case
    when not coalesce((select c.job_rooms_addon from public.companies c where c.id = p_room.company_id), false) then 'off'
    when not p_room.link_enabled then 'off'
    when p_room.last_activity_at < now() - interval '90 days' then 'expired'
    else 'ok'
  end;
$$;

create or replace function public.jr_audit(p_company uuid, p_action text, p_room uuid, p_meta jsonb default '{}'::jsonb)
returns void language sql volatile security definer set search_path = public as $$
  insert into public.audit_log (company_id, actor_user_id, action, autonomy_tier, policy_reference, subject_type, subject_id, metadata)
  values (p_company, auth.uid(), p_action, 'tier_1_automatic', 'job_rooms', 'job_room', p_room::text, coalesce(p_meta, '{}'::jsonb));
$$;

-- Ask owner-push to notify the owner about a guest message. At most one alert
-- per room every 10 minutes so a burst of photos is one notification. Never
-- blocks the guest's post if notifications are unavailable.
create or replace function public.jr_notify_owner(p_room_id uuid, p_message_id uuid)
returns void language plpgsql volatile security definer set search_path = public, extensions, vault as $$
declare
  v_claimed uuid;
begin
  update public.job_rooms
     set last_notified_at = now()
   where id = p_room_id
     and (last_notified_at is null or last_notified_at < now() - interval '10 minutes')
  returning id into v_claimed;
  if v_claimed is null then
    return;
  end if;
  begin
    perform net.http_post(
      url := 'https://atwaixmsvzehheotdymf.supabase.co/functions/v1/owner-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'followup_worker_secret' limit 1)
      ),
      body := jsonb_build_object('kind', 'job_room', 'id', p_message_id),
      timeout_milliseconds := 20000
    );
  exception when others then
    raise warning 'jr_notify_owner failed: %', sqlerrm;
  end;
end;
$$;

-- Messages as the owner or a guest sees them. photo_path is only used by the
-- Edge Function to make a short-lived signed URL; it is never sent to a browser.
create or replace function public.jr_room_messages(p_room_id uuid, p_viewer_guest uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(m order by m.created_at), '[]'::jsonb)
    from (
      select jm.id, jm.author_kind,
             case when jm.author_kind = 'owner' then c.name else g.display_name end as author_name,
             jm.body, jm.photo_path, jm.photo_mime, jm.created_at,
             coalesce(p_viewer_guest is not null and jm.guest_id = p_viewer_guest, false) as mine
        from public.job_room_messages jm
        join public.companies c on c.id = jm.company_id
        left join public.job_room_guests g on g.id = jm.guest_id
       where jm.room_id = p_room_id and jm.state = 'visible'
       order by jm.created_at desc
       limit 300
    ) m;
$$;

-- ---------------------------------------------------------------------------
-- RLS (defense in depth: the app reads through the functions below)
-- ---------------------------------------------------------------------------
create policy job_rooms_owner_select on public.job_rooms
  for select to authenticated using (company_id = public.jr_owner_company_or_null());
create policy job_room_guests_owner_select on public.job_room_guests
  for select to authenticated using (company_id = public.jr_owner_company_or_null());
create policy job_room_messages_owner_select on public.job_room_messages
  for select to authenticated using (company_id = public.jr_owner_company_or_null() and state <> 'deleted');
-- No insert/update/delete policies: every write goes through a function.

-- ---------------------------------------------------------------------------
-- Owner functions (signed-in owner, add-on on)
-- ---------------------------------------------------------------------------
create or replace function public.jr_owner_rooms()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_company uuid := public.jr_require_owner();
begin
  return coalesce((
    select jsonb_agg(r order by r.last_activity_at desc)
      from (
        select jr.id, jr.name, jr.link_token, jr.link_enabled, jr.last_activity_at, jr.created_at,
               public.jr_room_status(jr) as status,
               jr.last_activity_at + interval '90 days' as expires_at,
               (select count(*) from public.job_room_messages m
                 where m.room_id = jr.id and m.author_kind = 'guest' and m.state = 'visible'
                   and m.created_at > jr.owner_last_read_at) as unread,
               (select count(*) from public.job_room_guests g where g.room_id = jr.id) as guests
          from public.job_rooms jr
         where jr.company_id = v_company
         order by jr.last_activity_at desc
         limit 200
      ) r
  ), '[]'::jsonb);
end;
$$;

create or replace function public.jr_create_room(p_name text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_company uuid := public.jr_require_owner();
  v_name text := btrim(coalesce(p_name, ''));
  v_room public.job_rooms;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'bad_name' using errcode = '22023';
  end if;
  if (select count(*) from public.job_rooms where company_id = v_company) >= 500 then
    raise exception 'too_many_rooms' using errcode = 'P0001';
  end if;
  insert into public.job_rooms (company_id, name, link_token, created_by)
  values (v_company, v_name, public.jr_new_secret(), auth.uid())
  returning * into v_room;
  perform public.jr_audit(v_company, 'job_room_created', v_room.id, jsonb_build_object('name', v_name));
  return jsonb_build_object('id', v_room.id, 'name', v_room.name, 'link_token', v_room.link_token);
end;
$$;

-- Turn the current link off for good and issue a new one.
create or replace function public.jr_new_link(p_room_id uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_room public.job_rooms := public.jr_owner_room(p_room_id);
  v_token text := public.jr_new_secret();
begin
  update public.job_rooms
     set link_token = v_token, link_enabled = true, last_activity_at = now()
   where id = v_room.id;
  perform public.jr_audit(v_room.company_id, 'job_room_link_replaced', v_room.id);
  return v_token;
end;
$$;

create or replace function public.jr_set_link_enabled(p_room_id uuid, p_enabled boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_room public.job_rooms := public.jr_owner_room(p_room_id);
begin
  update public.job_rooms
     set link_enabled = coalesce(p_enabled, false),
         last_activity_at = case when p_enabled then now() else last_activity_at end
   where id = v_room.id;
  perform public.jr_audit(v_room.company_id, case when p_enabled then 'job_room_link_on' else 'job_room_link_off' end, v_room.id);
end;
$$;

-- Restart the 90-day clock.
create or replace function public.jr_renew(p_room_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_room public.job_rooms := public.jr_owner_room(p_room_id);
begin
  update public.job_rooms set last_activity_at = now() where id = v_room.id;
  perform public.jr_audit(v_room.company_id, 'job_room_renewed', v_room.id);
end;
$$;

create or replace function public.jr_owner_messages(p_room_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_room public.job_rooms := public.jr_owner_room(p_room_id);
begin
  update public.job_rooms set owner_last_read_at = now() where id = v_room.id;
  return jsonb_build_object(
    'room', jsonb_build_object('id', v_room.id, 'name', v_room.name, 'link_token', v_room.link_token,
                               'link_enabled', v_room.link_enabled, 'status', public.jr_room_status(v_room),
                               'expires_at', v_room.last_activity_at + interval '90 days'),
    'messages', public.jr_room_messages(v_room.id, null)
  );
end;
$$;

create or replace function public.jr_owner_post(p_room_id uuid, p_body text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_room public.job_rooms := public.jr_owner_room(p_room_id);
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then
    raise exception 'bad_message' using errcode = '22023';
  end if;
  if (select count(*) from public.job_room_messages
       where room_id = v_room.id and author_kind = 'owner' and created_at > now() - interval '10 minutes') >= 60 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into public.job_room_messages (room_id, company_id, author_kind, author_user_id, body)
  values (v_room.id, v_room.company_id, 'owner', auth.uid(), v_body)
  returning id into v_id;
  update public.job_rooms set last_activity_at = now(), owner_last_read_at = now() where id = v_room.id;
  return v_id;
end;
$$;

create or replace function public.jr_owner_photo_begin(p_room_id uuid, p_mime text, p_bytes integer)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_room public.job_rooms := public.jr_owner_room(p_room_id);
  v_id uuid := gen_random_uuid();
  v_path text;
begin
  if p_mime is null or p_mime not in ('image/jpeg', 'image/png', 'image/heic', 'image/heif') then
    raise exception 'bad_photo_type' using errcode = '22023';
  end if;
  if p_bytes is null or p_bytes < 1 or p_bytes > 10485760 then
    raise exception 'photo_too_big' using errcode = '22023';
  end if;
  if (select count(*) from public.job_room_messages
       where room_id = v_room.id and author_kind = 'owner' and photo_mime is not null
         and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  v_path := v_room.company_id || '/' || v_room.id || '/' || v_id;
  insert into public.job_room_messages (id, room_id, company_id, author_kind, author_user_id, photo_path, photo_mime, photo_bytes, state)
  values (v_id, v_room.id, v_room.company_id, 'owner', auth.uid(), v_path, p_mime, p_bytes, 'pending_upload');
  return jsonb_build_object('message_id', v_id, 'path', v_path);
end;
$$;

-- The storage path of the owner's own pending upload (for the Edge Function).
create or replace function public.jr_owner_pending_photo(p_message_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_company uuid := public.jr_require_owner();
  v_path text;
begin
  select photo_path into v_path from public.job_room_messages
   where id = p_message_id and company_id = v_company and author_kind = 'owner'
     and author_user_id = auth.uid() and state = 'pending_upload';
  if v_path is null then
    raise exception 'upload_not_found' using errcode = 'P0002';
  end if;
  return v_path;
end;
$$;

-- Delete any message or photo in the owner's own rooms. Returns the photo's
-- storage path (or null) so the Edge Function can remove the file itself.
create or replace function public.jr_delete_message(p_message_id uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_company uuid := public.jr_require_owner();
  v_msg public.job_room_messages;
begin
  select * into v_msg from public.job_room_messages
   where id = p_message_id and company_id = v_company and state <> 'deleted' for update;
  if v_msg.id is null then
    raise exception 'message_not_found' using errcode = 'P0002';
  end if;
  update public.job_room_messages
     set state = 'deleted', body = null, photo_path = null, deleted_at = now(), deleted_by = auth.uid()
   where id = v_msg.id;
  perform public.jr_audit(v_company, 'job_room_message_deleted', v_msg.room_id,
    jsonb_build_object('message_id', v_msg.id, 'author_kind', v_msg.author_kind, 'had_photo', v_msg.photo_path is not null));
  return v_msg.photo_path;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guest functions (service role only; called by the job-room Edge Function)
-- ---------------------------------------------------------------------------
create or replace function public.jr_room_for_token(p_token text)
returns public.job_rooms language sql stable security definer set search_path = public as $$
  select * from public.job_rooms
   where p_token is not null and char_length(p_token) between 40 and 100 and link_token = p_token;
$$;

-- The guest for this room and device secret, or null.
create or replace function public.jr_guest_for(p_room_id uuid, p_secret text)
returns public.job_room_guests language sql stable security definer set search_path = public as $$
  select * from public.job_room_guests
   where room_id = p_room_id and p_secret is not null and char_length(p_secret) >= 40
     and secret_hash = public.jr_hash(p_secret);
$$;

create or replace function public.jr_guest_open(p_token text, p_secret text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_room public.job_rooms := public.jr_room_for_token(p_token);
  v_status text;
  v_guest public.job_room_guests;
  v_company text;
begin
  if v_room.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  select name into v_company from public.companies where id = v_room.company_id;
  v_status := public.jr_room_status(v_room);
  if v_status <> 'ok' then
    return jsonb_build_object('status', v_status, 'company_name', v_company);
  end if;
  v_guest := public.jr_guest_for(v_room.id, p_secret);
  if v_guest.id is not null then
    update public.job_room_guests set last_seen_at = now() where id = v_guest.id;
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'room_id', v_room.id,
    'room_name', v_room.name,
    'company_name', v_company,
    'guest_name', v_guest.display_name,
    'messages', case when v_guest.id is null then '[]'::jsonb else public.jr_room_messages(v_room.id, v_guest.id) end
  );
end;
$$;

-- Raises unless the link works and the guest belongs to this room.
create or replace function public.jr_guest_auth(p_token text, p_secret text)
returns public.job_room_guests language plpgsql stable security definer set search_path = public as $$
declare
  v_room public.job_rooms := public.jr_room_for_token(p_token);
  v_guest public.job_room_guests;
begin
  if v_room.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if public.jr_room_status(v_room) <> 'ok' then
    raise exception 'link_unavailable' using errcode = '42501';
  end if;
  v_guest := public.jr_guest_for(v_room.id, p_secret);
  if v_guest.id is null then
    raise exception 'name_needed' using errcode = '42501';
  end if;
  return v_guest;
end;
$$;

create or replace function public.jr_guest_join(p_token text, p_name text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_room public.job_rooms := public.jr_room_for_token(p_token);
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_secret text := public.jr_new_secret();
begin
  if v_room.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if public.jr_room_status(v_room) <> 'ok' then
    raise exception 'link_unavailable' using errcode = '42501';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'bad_name' using errcode = '22023';
  end if;
  if (select count(*) from public.job_room_guests
       where room_id = v_room.id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into public.job_room_guests (room_id, company_id, display_name, secret_hash)
  values (v_room.id, v_room.company_id, v_name, public.jr_hash(v_secret));
  return jsonb_build_object('secret', v_secret, 'name', v_name);
end;
$$;

create or replace function public.jr_guest_post(p_token text, p_secret text, p_body text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_guest public.job_room_guests := public.jr_guest_auth(p_token, p_secret);
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then
    raise exception 'bad_message' using errcode = '22023';
  end if;
  if (select count(*) from public.job_room_messages
       where guest_id = v_guest.id and created_at > now() - interval '10 minutes') >= 20
     or (select count(*) from public.job_room_messages
       where room_id = v_guest.room_id and author_kind = 'guest' and created_at > now() - interval '1 day') >= 300 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into public.job_room_messages (room_id, company_id, author_kind, guest_id, body)
  values (v_guest.room_id, v_guest.company_id, 'guest', v_guest.id, v_body)
  returning id into v_id;
  update public.job_rooms set last_activity_at = now() where id = v_guest.room_id;
  update public.job_room_guests set last_seen_at = now() where id = v_guest.id;
  perform public.jr_notify_owner(v_guest.room_id, v_id);
  return v_id;
end;
$$;

create or replace function public.jr_guest_photo_begin(p_token text, p_secret text, p_mime text, p_bytes integer)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_guest public.job_room_guests := public.jr_guest_auth(p_token, p_secret);
  v_id uuid := gen_random_uuid();
  v_path text;
begin
  if p_mime is null or p_mime not in ('image/jpeg', 'image/png', 'image/heic', 'image/heif') then
    raise exception 'bad_photo_type' using errcode = '22023';
  end if;
  if p_bytes is null or p_bytes < 1 or p_bytes > 10485760 then
    raise exception 'photo_too_big' using errcode = '22023';
  end if;
  -- Upload limits (attempts count, so failed uploads can't be used to spam):
  -- 15 photos per guest per hour, 100 guest photos per room per day, and
  -- 400 photos in a room overall (keeps storage costs bounded).
  if (select count(*) from public.job_room_messages
       where guest_id = v_guest.id and photo_mime is not null and created_at > now() - interval '1 hour') >= 15
     or (select count(*) from public.job_room_messages
       where room_id = v_guest.room_id and author_kind = 'guest' and photo_mime is not null
         and created_at > now() - interval '1 day') >= 100
     or (select count(*) from public.job_room_messages
       where room_id = v_guest.room_id and photo_path is not null and state <> 'deleted') >= 400 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  v_path := v_guest.company_id || '/' || v_guest.room_id || '/' || v_id;
  insert into public.job_room_messages (id, room_id, company_id, author_kind, guest_id, photo_path, photo_mime, photo_bytes, state)
  values (v_id, v_guest.room_id, v_guest.company_id, 'guest', v_guest.id, v_path, p_mime, p_bytes, 'pending_upload');
  return jsonb_build_object('message_id', v_id, 'path', v_path);
end;
$$;

create or replace function public.jr_guest_pending_photo(p_token text, p_secret text, p_message_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_guest public.job_room_guests := public.jr_guest_auth(p_token, p_secret);
  v_path text;
begin
  select photo_path into v_path from public.job_room_messages
   where id = p_message_id and guest_id = v_guest.id and state = 'pending_upload';
  if v_path is null then
    raise exception 'upload_not_found' using errcode = 'P0002';
  end if;
  return v_path;
end;
$$;

-- Called by the Edge Function after it has checked the uploaded file itself.
create or replace function public.jr_photo_finish(p_message_id uuid, p_bytes integer)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_msg public.job_room_messages;
begin
  update public.job_room_messages
     set state = 'visible', photo_bytes = p_bytes, created_at = now()
   where id = p_message_id and state = 'pending_upload'
  returning * into v_msg;
  if v_msg.id is null then
    raise exception 'upload_not_found' using errcode = 'P0002';
  end if;
  update public.job_rooms
     set last_activity_at = now(),
         owner_last_read_at = case when v_msg.author_kind = 'owner' then now() else owner_last_read_at end
   where id = v_msg.room_id;
  if v_msg.author_kind = 'guest' then
    perform public.jr_notify_owner(v_msg.room_id, v_msg.id);
  end if;
end;
$$;

create or replace function public.jr_photo_discard(p_message_id uuid)
returns void language sql volatile security definer set search_path = public as $$
  update public.job_room_messages
     set state = 'deleted', photo_path = null, deleted_at = now()
   where id = p_message_id and state = 'pending_upload';
$$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  -- Internal helpers: nobody calls these directly.
  foreach f in array array[
    'public.jr_new_secret()', 'public.jr_hash(text)', 'public.jr_require_owner()',
    'public.jr_owner_room(uuid)', 'public.jr_room_status(public.job_rooms)',
    'public.jr_audit(uuid, text, uuid, jsonb)', 'public.jr_notify_owner(uuid, uuid)',
    'public.jr_room_messages(uuid, uuid)', 'public.jr_room_for_token(text)',
    'public.jr_guest_for(uuid, text)', 'public.jr_guest_auth(text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;

  -- The RLS helper must be callable by signed-in users (policies run as them).
  execute 'revoke all on function public.jr_owner_company_or_null() from public, anon';
  execute 'grant execute on function public.jr_owner_company_or_null() to authenticated';

  -- Owner functions: signed-in users only (each checks owner + add-on itself).
  foreach f in array array[
    'public.jr_owner_rooms()', 'public.jr_create_room(text)', 'public.jr_new_link(uuid)',
    'public.jr_set_link_enabled(uuid, boolean)', 'public.jr_renew(uuid)',
    'public.jr_owner_messages(uuid)', 'public.jr_owner_post(uuid, text)',
    'public.jr_owner_photo_begin(uuid, text, integer)', 'public.jr_owner_pending_photo(uuid)',
    'public.jr_delete_message(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;

  -- Guest + upload-finishing functions: only the Edge Function (service role).
  foreach f in array array[
    'public.jr_guest_open(text, text)', 'public.jr_guest_join(text, text)',
    'public.jr_guest_post(text, text, text)', 'public.jr_guest_photo_begin(text, text, text, integer)',
    'public.jr_guest_pending_photo(text, text, uuid)', 'public.jr_photo_finish(uuid, integer)',
    'public.jr_photo_discard(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner notifications: allow the new 'job_room' kind (owner-push dedupe table)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.push_deliveries') is not null then
    alter table public.push_deliveries drop constraint if exists push_deliveries_kind_check;
    alter table public.push_deliveries add constraint push_deliveries_kind_check
      check (kind in ('lead', 'attention', 'announcement', 'job_room'));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Private photo bucket: 10 MB max, JPG/PNG/HEIC only, never public.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('job-room-photos', 'job-room-photos', false, 10485760,
            array['image/jpeg', 'image/png', 'image/heic', 'image/heif'])
    on conflict (id) do update
      set public = false, file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end;
$$;
