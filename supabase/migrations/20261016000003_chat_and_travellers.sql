-- Chat for table members, "Travellers" (opt-in people within 5 km) and direct messages between them.
--
-- Privacy and safety model
--   * Nobody is visible to others unless they opt in (profiles.discoverable). Turning it off deletes their location.
--   * Exact locations never leave the database. Others see a dot moved 150–400 m in a direction that is fixed for
--     the day (so repeated looks can't average it out) and a distance rounded to 0.5 km.
--   * A location older than 2 hours counts as gone.
--   * A first direct message is a request: one message only until the receiver replies or accepts.
--   * Anyone can block (hides both ways, stops messages) and report (the founder sees reports).
--   * Table chat is readable and writable only by the table's members.

-- ---------------------------------------------------------------------------
-- Opt-in visibility and locations
-- ---------------------------------------------------------------------------

alter table public.profiles add column discoverable boolean not null default false;

create table public.user_locations (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  location extensions.geography (point, 4326) not null,
  updated_at timestamptz not null default now()
);

create index user_locations_location_idx on public.user_locations using gist (location);

alter table public.user_locations enable row level security;
-- No policies: only the functions below read or write exact locations.
revoke all on public.user_locations from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Blocks and reports
-- ---------------------------------------------------------------------------

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;

create policy "Users see their own blocks"
on public.blocks for select to authenticated
using (blocker_id = (select auth.uid()));

create policy "Users block for themselves"
on public.blocks for insert to authenticated
with check (blocker_id = (select auth.uid()));

create policy "Users unblock for themselves"
on public.blocks for delete to authenticated
using (blocker_id = (select auth.uid()));

create function public.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

revoke execute on function public.is_blocked_between(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

create type public.report_context as enum ('traveller', 'direct', 'table');

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  context public.report_context not null,
  context_id uuid,
  reason text not null check (length(trim(reason)) between 1 and 500),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

alter table public.reports enable row level security;

create policy "Users file reports as themselves"
on public.reports for insert to authenticated
with check (reporter_id = (select auth.uid()));

create policy "Admins read reports"
on public.reports for select to authenticated
using ((select public.is_admin()));

create policy "Admins resolve reports"
on public.reports for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Table (meetup) chat
-- ---------------------------------------------------------------------------

create table public.meetup_messages (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index meetup_messages_meetup_idx on public.meetup_messages (meetup_id, created_at);

alter table public.meetup_messages enable row level security;

create function public.is_meetup_member(p_meetup_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.meetup_members mm where mm.meetup_id = p_meetup_id and mm.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_meetup_member(uuid) from public, anon;
grant execute on function public.is_meetup_member(uuid) to authenticated;

create policy "Members read their table chat"
on public.meetup_messages for select to authenticated
using ((select public.is_meetup_member(meetup_id)));

create policy "Members write in their table chat"
on public.meetup_messages for insert to authenticated
with check (sender_id = (select auth.uid()) and (select public.is_meetup_member(meetup_id)));

-- ---------------------------------------------------------------------------
-- Direct messages
-- ---------------------------------------------------------------------------

create type public.direct_status as enum ('pending', 'accepted', 'declined');

create table public.direct_threads (
  id uuid primary key default gen_random_uuid(),
  -- The pair is stored in a fixed order so each pair has one thread.
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  status public.direct_status not null default 'pending',
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.direct_threads (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index direct_messages_thread_idx on public.direct_messages (thread_id, created_at);

alter table public.direct_threads enable row level security;
alter table public.direct_messages enable row level security;

-- Read-only through the API, and hidden once either person has blocked the other.
create policy "Participants read their threads"
on public.direct_threads for select to authenticated
using (
  (select auth.uid()) in (user_a, user_b)
  and not public.is_blocked_between(user_a, user_b)
);

create policy "Participants read their messages"
on public.direct_messages for select to authenticated
using (
  exists (
    select 1 from public.direct_threads t
    where t.id = thread_id
      and (select auth.uid()) in (t.user_a, t.user_b)
      and not public.is_blocked_between(t.user_a, t.user_b)
  )
);

-- ---------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------
-- Error keys the app translates: auth_required, not_allowed, not_visible, too_far, blocked, empty_message,
-- request_pending, request_declined, not_found.

-- Turn "Show me to travellers nearby" on or off. Off also forgets the stored location.
create function public.set_discoverable(p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  update public.profiles set discoverable = p_on where id = auth.uid();
  if not p_on then
    delete from public.user_locations where user_id = auth.uid();
  end if;
end;
$$;

-- Save the caller's current position (only kept while they're discoverable).
create function public.update_my_location(p_lat double precision, p_lng double precision)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid location' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.discoverable) then
    return;
  end if;
  insert into public.user_locations (user_id, location, updated_at)
  values (auth.uid(), extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography, now())
  on conflict (user_id) do update set location = excluded.location, updated_at = excluded.updated_at;
end;
$$;

-- A position moved 150–400 m in a direction fixed for this person for today.
create function public.fuzzed_location(p_user_id uuid, p_location extensions.geography)
returns extensions.geography
language sql
stable
security definer
set search_path = ''
as $$
  select extensions.st_project(
    p_location,
    150 + (('x' || lpad(substr(md5(p_user_id::text || current_date::text), 1, 8), 16, '0'))::bit(64)::bigint % 251),
    radians((('x' || lpad(substr(md5(p_user_id::text || current_date::text), 9, 8), 16, '0'))::bit(64)::bigint % 360)::double precision)
  )::extensions.geography;
$$;

revoke execute on function public.fuzzed_location(uuid, extensions.geography) from public, anon, authenticated;

-- Discoverable people within 5 km of the caller's last saved position (the caller must be discoverable too).
create function public.nearby_travellers()
returns table (
  user_id uuid,
  display_name text,
  fuzzy_lat double precision,
  fuzzy_lng double precision,
  distance_km numeric,
  minutes_ago integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select l.location
    from public.user_locations l
    join public.profiles p on p.id = l.user_id
    where l.user_id = auth.uid() and p.discoverable and l.updated_at > now() - interval '2 hours'
  ),
  near as (
    select
      o.user_id,
      pr.display_name,
      public.fuzzed_location(o.user_id, o.location) as fuzzy,
      extensions.st_distance(o.location, me.location) as meters,
      o.updated_at
    from me
    join public.user_locations o on extensions.st_dwithin(o.location, me.location, 5000)
    join public.profiles pr on pr.id = o.user_id
    where o.user_id <> auth.uid()
      and pr.discoverable
      and o.updated_at > now() - interval '2 hours'
      and not public.is_blocked_between(o.user_id, auth.uid())
  )
  select
    near.user_id,
    near.display_name,
    extensions.st_y(near.fuzzy::extensions.geometry),
    extensions.st_x(near.fuzzy::extensions.geometry),
    greatest(0.5, round((near.meters / 500)::numeric) * 0.5),
    (extract(epoch from now() - near.updated_at) / 60)::integer
  from near
  order by near.meters
  limit 100;
$$;

-- Send a direct message. Starts a request thread with someone nearby, or continues an existing thread.
create function public.send_direct_message(p_to uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_a uuid := least(auth.uid(), p_to);
  v_b uuid := greatest(auth.uid(), p_to);
  v_thread public.direct_threads%rowtype;
  v_body text := trim(coalesce(p_body, ''));
begin
  if v_me is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if not public.meetup_caller_allowed() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if length(v_body) = 0 or length(v_body) > 1000 then
    raise exception 'empty_message';
  end if;
  if p_to is null or p_to = v_me or not exists (select 1 from public.profiles p where p.id = p_to) then
    raise exception 'not_found';
  end if;
  if public.is_blocked_between(v_me, p_to) then
    raise exception 'blocked';
  end if;

  select * into v_thread from public.direct_threads t where t.user_a = v_a and t.user_b = v_b for update;

  if not found then
    -- A new conversation: both people must be discoverable, recently located and within 5 km.
    if not exists (
      select 1
      from public.user_locations ml
      join public.profiles mp on mp.id = ml.user_id
      join public.user_locations tl on tl.user_id = p_to
      join public.profiles tp on tp.id = tl.user_id
      where ml.user_id = v_me
        and mp.discoverable and tp.discoverable
        and ml.updated_at > now() - interval '2 hours'
        and tl.updated_at > now() - interval '2 hours'
    ) then
      raise exception 'not_visible';
    end if;
    if not exists (
      select 1 from public.user_locations ml, public.user_locations tl
      where ml.user_id = v_me and tl.user_id = p_to and extensions.st_dwithin(ml.location, tl.location, 5000)
    ) then
      raise exception 'too_far';
    end if;

    insert into public.direct_threads (user_a, user_b, requested_by)
    values (v_a, v_b, v_me)
    returning * into v_thread;
  elsif v_thread.status = 'pending' and v_thread.requested_by = v_me then
    raise exception 'request_pending';
  elsif v_thread.status = 'declined' and v_thread.requested_by = v_me then
    raise exception 'request_declined';
  elsif v_thread.status <> 'accepted' then
    -- The receiver replying accepts the request.
    update public.direct_threads set status = 'accepted' where id = v_thread.id;
  end if;

  insert into public.direct_messages (thread_id, sender_id, body) values (v_thread.id, v_me, v_body);
  update public.direct_threads set last_message_at = now() where id = v_thread.id;
  return v_thread.id;
end;
$$;

-- The receiver of a request accepts or declines it.
create function public.respond_direct_request(p_thread_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.direct_threads t
  set status = case when p_accept then 'accepted'::public.direct_status else 'declined'::public.direct_status end
  where t.id = p_thread_id
    and t.status = 'pending'
    and t.requested_by <> auth.uid()
    and auth.uid() in (t.user_a, t.user_b);
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

-- The caller's conversations, newest first, with the other person's name and the last message.
create function public.list_my_threads()
returns table (
  thread_id uuid,
  other_id uuid,
  other_name text,
  status public.direct_status,
  requested_by uuid,
  last_body text,
  last_sender uuid,
  last_message_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.id,
    o.id,
    o.display_name,
    t.status,
    t.requested_by,
    m.body,
    m.sender_id,
    t.last_message_at
  from public.direct_threads t
  join public.profiles o on o.id = case when t.user_a = (select auth.uid()) then t.user_b else t.user_a end
  left join lateral (
    select dm.body, dm.sender_id from public.direct_messages dm
    where dm.thread_id = t.id order by dm.created_at desc limit 1
  ) m on true
  where (select auth.uid()) in (t.user_a, t.user_b)
    -- Declined requests disappear for the person who declined them.
    and not (t.status = 'declined' and t.requested_by <> (select auth.uid()))
  order by t.last_message_at desc;
$$;

revoke execute on function public.set_discoverable(boolean) from public, anon;
revoke execute on function public.update_my_location(double precision, double precision) from public, anon;
revoke execute on function public.nearby_travellers() from public, anon;
revoke execute on function public.send_direct_message(uuid, text) from public, anon;
revoke execute on function public.respond_direct_request(uuid, boolean) from public, anon;
revoke execute on function public.list_my_threads() from public, anon;
grant execute on function public.set_discoverable(boolean) to authenticated;
grant execute on function public.update_my_location(double precision, double precision) to authenticated;
grant execute on function public.nearby_travellers() to authenticated;
grant execute on function public.send_direct_message(uuid, text) to authenticated;
grant execute on function public.respond_direct_request(uuid, boolean) to authenticated;
grant execute on function public.list_my_threads() to authenticated;

-- Live chat. Realtime only delivers rows the receiver may read (RLS above).
alter publication supabase_realtime add table public.meetup_messages, public.direct_messages, public.direct_threads;
