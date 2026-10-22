-- Events (founder, 2026-10-22): bigger, planned meetups anyone creates from the Hangout map ("Create event").
--
-- * An event is a meetup with kind = 'event', so joining, leaving, cancelling, private join requests, women-only, the
--   group chat (Messages lists it under "Events"), push and the bell all work as for hangouts. Like a hangout it is at
--   a partner venue, a place, or a spot anywhere in the world (a dropped pin, a place from the map tiles, or a pin set
--   from a pasted Google Maps link), in that place's time zone.
-- * Rules (create_event): title required, a category, description up to 2,000 characters, 2–150 people, starts within
--   60 days, open for 30 minutes to 7 days ("opening hours": people pick when they arrive), max 3 open events per
--   person (separate from tables and hangouts).
-- * Free or paid. Paid events show an entry price in THB and/or USD, paid to the organiser at the door or on their
--   own https ticket page; **no money goes through TableMeet**. Only verified people (Get verified) can create paid
--   events (verification_required). The cost band (cost_level, for the Budget-friendly filter) is set from the price.
-- * Up to 2 photos: public "event-photos" bucket at <user id>/<random>.jpg (own folder only; admins may list and
--   delete for account deletion), checked to exist when the event is created.
-- * Arrival time: meetup_members.arrival_at, picked when joining (join_event) or later (set_event_arrival), within the
--   event's hours. Members are readable, so the event page shows "who's coming when".
-- * Waiting list (open events only): when it's full people can join_waitlist; when a member leaves, the first in line
--   becomes a member at once (trigger) and gets a push. event_waitlist() tells how many wait and my place in line.
-- * Announcements only (meetups.announce_only): only the organiser can post in the event chat (trigger on
--   meetup_messages, so every way of posting is covered); members still read and react.
--
-- Errors: auth_required, not_allowed, invalid_time, invalid_duration, invalid_size, title_required, invalid_category,
-- invalid_price, verification_required, invalid_link, invalid_photo, invalid_place, venue_unavailable,
-- spot_name_required, invalid_time_zone, invalid_mode, too_many_open, not_verified_woman, not_found, not_event,
-- not_member, invalid_arrival, meetup_cancelled, meetup_ended, meetup_full, not_full, approval_required,
-- already_member, blocked, announce_only.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.meetups
  add column event_category text
    check (event_category in ('music', 'art', 'sports', 'workshop', 'language', 'party', 'food', 'outdoors', 'other')),
  add column entry_fee_thb numeric(10, 2) check (entry_fee_thb > 0 and entry_fee_thb <= 1000000),
  add column entry_fee_usd numeric(10, 2) check (entry_fee_usd > 0 and entry_fee_usd <= 30000),
  add column ticket_url text check (ticket_url ~ '^https://[^\s]+$' and length(ticket_url) <= 500),
  add column photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 2),
  add column announce_only boolean not null default false;

-- Event fields only on events; every event has a category.
alter table public.meetups add constraint meetups_event_fields check (
  case when kind = 'event'
    then event_category is not null
    else event_category is null and entry_fee_thb is null and entry_fee_usd is null and ticket_url is null
         and cardinality(photo_paths) = 0 and not announce_only
  end
);

alter table public.meetups drop constraint meetups_size_valid;
alter table public.meetups add constraint meetups_size_valid check (
  (kind = 'table' and max_people between 3 and 12)
  or (kind = 'hangout' and max_people between 2 and 30)
  or (kind = 'event' and max_people between 2 and 150)
);

alter table public.meetups drop constraint meetups_spot_valid;
alter table public.meetups add constraint meetups_spot_valid check (
  (spot_name is null and spot_lat is null and spot_lng is null)
  or (
    kind in ('hangout', 'event')
    and length(trim(spot_name)) between 1 and 80
    and spot_lat between -85 and 85
    and spot_lng between -180 and 180
  )
);

-- Events may say more.
alter table public.meetups drop constraint meetups_description_check;
alter table public.meetups add constraint meetups_description_check check (
  length(description) <= case when kind = 'event' then 2000 else 500 end
);

alter table public.meetup_members add column arrival_at timestamptz;

-- ---------------------------------------------------------------------------
-- Photos
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-photos', 'event-photos', true, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy "People list their own event photos; admins all"
on storage.objects for select
to authenticated
using (
  bucket_id = 'event-photos'
  and (split_part(name, '/', 1) = (select auth.uid())::text or (select public.is_admin()))
);

create policy "People upload event photos to their own folder"
on storage.objects for insert
to authenticated
with check (bucket_id = 'event-photos' and split_part(name, '/', 1) = (select auth.uid())::text);

create policy "People delete their own event photos; admins all"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'event-photos'
  and (split_part(name, '/', 1) = (select auth.uid())::text or (select public.is_admin()))
);

-- ---------------------------------------------------------------------------
-- Creating
-- ---------------------------------------------------------------------------

-- The Budget-friendly band for a price (0 free, 1 under ฿300, 2 ฿300–700, 3 ฿700–1,500, 4 more; USD at about ฿35).
create function public.event_cost_level(p_fee_thb numeric, p_fee_usd numeric)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_fee_thb is null and p_fee_usd is null then 0
    when coalesce(p_fee_thb, p_fee_usd * 35) < 300 then 1
    when coalesce(p_fee_thb, p_fee_usd * 35) < 700 then 2
    when coalesce(p_fee_thb, p_fee_usd * 35) < 1500 then 3
    else 4
  end::smallint;
$$;

-- Create an event. Where: exactly one of p_venue_id, p_place_id, or p_spot_lat + p_spot_lng + p_spot_name (+ the spot's
-- p_time_zone), as for hangouts. No price = free. p_women_only needs a verified woman.
create function public.create_event(
  p_title text,
  p_description text,
  p_category text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_max_people integer,
  p_venue_id uuid default null,
  p_place_id uuid default null,
  p_spot_lat double precision default null,
  p_spot_lng double precision default null,
  p_spot_name text default null,
  p_time_zone text default null,
  p_meeting_point text default null,
  p_fee_thb numeric default null,
  p_fee_usd numeric default null,
  p_ticket_url text default null,
  p_photo_paths text[] default '{}',
  p_announce_only boolean default false,
  p_join_mode text default 'open',
  p_women_only boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_venue_id uuid := p_venue_id;
  v_place_id uuid := p_place_id;
  v_title text := left(trim(coalesce(p_title, '')), 80);
  v_photos text[] := coalesce(p_photo_paths, '{}');
  v_link text := nullif(trim(coalesce(p_ticket_url, '')), '');
  v_fee_thb numeric := round(p_fee_thb, 2);
  v_fee_usd numeric := round(p_fee_usd, 2);
  v_zone text := 'Asia/Bangkok';
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if not public.meetup_caller_allowed() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_starts_at is null
     or p_starts_at < now() - interval '15 minutes'
     or p_starts_at > now() + interval '60 days' then
    raise exception 'invalid_time';
  end if;
  if p_ends_at is null or p_ends_at < p_starts_at + interval '30 minutes' or p_ends_at > p_starts_at + interval '7 days' then
    raise exception 'invalid_duration';
  end if;
  if p_max_people is null or p_max_people not between 2 and 150 then
    raise exception 'invalid_size';
  end if;
  if v_title = '' then
    raise exception 'title_required';
  end if;
  if p_category is null
     or p_category not in ('music', 'art', 'sports', 'workshop', 'language', 'party', 'food', 'outdoors', 'other') then
    raise exception 'invalid_category';
  end if;
  if (v_fee_thb is not null and v_fee_thb not between 1 and 1000000)
     or (v_fee_usd is not null and v_fee_usd not between 0.5 and 30000) then
    raise exception 'invalid_price';
  end if;
  if (v_fee_thb is not null or v_fee_usd is not null)
     and not exists (select 1 from public.profile_verification v where v.user_id = v_uid) then
    raise exception 'verification_required';
  end if;
  if v_link is not null and (v_link !~ '^https://[^\s]+$' or length(v_link) > 500) then
    raise exception 'invalid_link';
  end if;
  if cardinality(v_photos) > 2
     or cardinality(v_photos) <> (select count(distinct p) from unnest(v_photos) p)
     or exists (
       select 1 from unnest(v_photos) p
       where split_part(p, '/', 1) <> v_uid::text
          or not exists (select 1 from storage.objects o where o.bucket_id = 'event-photos' and o.name = p)
     ) then
    raise exception 'invalid_photo';
  end if;
  if coalesce(p_join_mode, 'open') not in ('open', 'private') then
    raise exception 'invalid_mode';
  end if;
  if num_nonnulls(p_venue_id, p_place_id, p_spot_lat) <> 1 then
    raise exception 'invalid_place';
  end if;
  if (
    select count(*) from public.meetups m
    where m.host_id = v_uid and m.kind = 'event' and m.status = 'open' and m.ends_at > now()
  ) >= 3 then
    raise exception 'too_many_open';
  end if;
  if coalesce(p_women_only, false) and not public.is_verified_woman(v_uid) then
    raise exception 'not_verified_woman';
  end if;

  if v_place_id is not null then
    select v.id into v_venue_id from public.venues v where v.place_id = v_place_id and v.is_active;
    if v_venue_id is not null then
      v_place_id := null;
    elsif not exists (select 1 from public.places p where p.id = v_place_id) then
      raise exception 'venue_unavailable';
    end if;
  elsif v_venue_id is not null then
    if not exists (select 1 from public.venues v where v.id = v_venue_id and v.is_active) then
      raise exception 'venue_unavailable';
    end if;
  else
    if p_spot_lng is null or p_spot_lat not between -85 and 85 or p_spot_lng not between -180 and 180 then
      raise exception 'invalid_place';
    end if;
    if length(trim(coalesce(p_spot_name, ''))) = 0 then
      raise exception 'spot_name_required';
    end if;
    if p_time_zone is not null then
      if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_time_zone) then
        raise exception 'invalid_time_zone';
      end if;
      v_zone := p_time_zone;
    elsif not public.in_bangkok(p_spot_lat, p_spot_lng) then
      raise exception 'invalid_time_zone';
    end if;
  end if;

  -- Read by the meetups_women_only trigger.
  perform set_config('tablemeet.women_only', case when coalesce(p_women_only, false) then 'on' else 'off' end, true);
  insert into public.meetups (
    kind, venue_id, place_id, spot_name, spot_lat, spot_lng,
    host_id, title, description, starts_at, ends_at, max_people, time_zone,
    event_category, entry_fee_thb, entry_fee_usd, ticket_url, photo_paths, announce_only,
    join_mode, meeting_point, cost_level
  )
  values (
    'event', v_venue_id, v_place_id,
    case when p_spot_lat is not null then left(trim(p_spot_name), 80) end,
    p_spot_lat,
    case when p_spot_lat is not null then p_spot_lng end,
    v_uid, v_title, left(trim(coalesce(p_description, '')), 2000),
    p_starts_at, p_ends_at, p_max_people, v_zone,
    p_category, v_fee_thb, v_fee_usd, v_link, v_photos, coalesce(p_announce_only, false),
    coalesce(p_join_mode, 'open'), nullif(left(trim(coalesce(p_meeting_point, '')), 120), ''),
    public.event_cost_level(v_fee_thb, v_fee_usd)
  )
  returning id into v_id;
  perform set_config('tablemeet.women_only', 'off', true);

  insert into public.meetup_members (meetup_id, user_id) values (v_id, v_uid);
  return v_id;
end;
$$;

revoke execute on function public.create_event(text, text, text, timestamptz, timestamptz, integer, uuid, uuid, double precision, double precision, text, text, text, numeric, numeric, text, text[], boolean, text, boolean) from public, anon;
grant execute on function public.create_event(text, text, text, timestamptz, timestamptz, integer, uuid, uuid, double precision, double precision, text, text, text, numeric, numeric, text, text[], boolean, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Arrival times
-- ---------------------------------------------------------------------------

-- An arrival time within the event's hours (null = not given).
create function public.event_arrival_ok(p_meetup public.meetups, p_arrival_at timestamptz)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_arrival_at is null or (p_arrival_at >= p_meetup.starts_at and p_arrival_at < p_meetup.ends_at);
$$;

-- Join an open event and say when I'll arrive (join_meetup's rules and errors, plus invalid_arrival).
create function public.join_event(p_meetup_id uuid, p_arrival_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meetup public.meetups%rowtype;
begin
  select * into v_meetup from public.meetups m where m.id = p_meetup_id;
  if not found then
    raise exception 'not_found';
  end if;
  if v_meetup.kind <> 'event' then
    raise exception 'not_event';
  end if;
  if not public.event_arrival_ok(v_meetup, p_arrival_at) then
    raise exception 'invalid_arrival';
  end if;
  perform public.join_meetup(p_meetup_id);
  update public.meetup_members mm set arrival_at = p_arrival_at
  where mm.meetup_id = p_meetup_id and mm.user_id = auth.uid();
end;
$$;

revoke execute on function public.join_event(uuid, timestamptz) from public, anon;
grant execute on function public.join_event(uuid, timestamptz) to authenticated;

-- Members change (or clear) their arrival time while the event is on.
create function public.set_event_arrival(p_meetup_id uuid, p_arrival_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meetup public.meetups%rowtype;
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  select * into v_meetup from public.meetups m where m.id = p_meetup_id;
  if not found then
    raise exception 'not_found';
  end if;
  if v_meetup.kind <> 'event' then
    raise exception 'not_event';
  end if;
  if v_meetup.status <> 'open' then
    raise exception 'meetup_cancelled';
  end if;
  if v_meetup.ends_at <= now() then
    raise exception 'meetup_ended';
  end if;
  if not public.event_arrival_ok(v_meetup, p_arrival_at) then
    raise exception 'invalid_arrival';
  end if;
  update public.meetup_members mm set arrival_at = p_arrival_at
  where mm.meetup_id = p_meetup_id and mm.user_id = auth.uid();
  if not found then
    raise exception 'not_member';
  end if;
end;
$$;

revoke execute on function public.set_event_arrival(uuid, timestamptz) from public, anon;
grant execute on function public.set_event_arrival(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Waiting list
-- ---------------------------------------------------------------------------

create table public.meetup_waitlist (
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  arrival_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);

create index meetup_waitlist_user_idx on public.meetup_waitlist (user_id);
create index meetup_waitlist_line_idx on public.meetup_waitlist (meetup_id, created_at);

alter table public.meetup_waitlist enable row level security;
revoke insert, update, delete on public.meetup_waitlist from anon, authenticated;

create policy "People see their own place in line; organisers see their lines"
on public.meetup_waitlist for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (select 1 from public.meetups m where m.id = meetup_id and m.host_id = (select auth.uid()))
);

-- Women-only events: nobody else waits either.
create trigger meetup_waitlist_women_only
before insert on public.meetup_waitlist
for each row execute function public.meetup_members_women_only();

-- Join the line of a full open event. Errors: auth_required, not_allowed, not_found, not_event, meetup_cancelled,
-- meetup_ended, approval_required, already_member, blocked, not_full (just join), invalid_arrival.
create function public.join_waitlist(p_meetup_id uuid, p_arrival_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_meetup public.meetups%rowtype;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if not public.meetup_caller_allowed() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into v_meetup from public.meetups m where m.id = p_meetup_id for update;
  if not found or (v_meetup.women_only and not public.can_see_women_only()) then
    raise exception 'not_found';
  end if;
  if v_meetup.kind <> 'event' then
    raise exception 'not_event';
  end if;
  if v_meetup.status <> 'open' then
    raise exception 'meetup_cancelled';
  end if;
  if v_meetup.ends_at <= now() then
    raise exception 'meetup_ended';
  end if;
  if v_meetup.join_mode <> 'open' then
    raise exception 'approval_required';
  end if;
  if exists (select 1 from public.meetup_members mm where mm.meetup_id = p_meetup_id and mm.user_id = v_uid) then
    raise exception 'already_member';
  end if;
  if public.is_blocked_between(v_uid, v_meetup.host_id) then
    raise exception 'blocked';
  end if;
  if (select count(*) from public.meetup_members mm where mm.meetup_id = p_meetup_id) < v_meetup.max_people then
    raise exception 'not_full';
  end if;
  if not public.event_arrival_ok(v_meetup, p_arrival_at) then
    raise exception 'invalid_arrival';
  end if;
  insert into public.meetup_waitlist (meetup_id, user_id, arrival_at) values (p_meetup_id, v_uid, p_arrival_at)
  on conflict (meetup_id, user_id) do update set arrival_at = excluded.arrival_at;
end;
$$;

revoke execute on function public.join_waitlist(uuid, timestamptz) from public, anon;
grant execute on function public.join_waitlist(uuid, timestamptz) to authenticated;

create function public.leave_waitlist(p_meetup_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.meetup_waitlist w where w.meetup_id = p_meetup_id and w.user_id = (select auth.uid());
$$;

revoke execute on function public.leave_waitlist(uuid) from public, anon;
grant execute on function public.leave_waitlist(uuid) to authenticated;

-- How many wait for an event, and my place in line (null when I'm not in it).
create function public.event_waitlist(p_meetup_id uuid)
returns table (waiting integer, my_position integer)
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*)::integer from public.meetup_waitlist w where w.meetup_id = m.id),
         (select x.pos from (
            select w.user_id, row_number() over (order by w.created_at, w.user_id)::integer as pos
            from public.meetup_waitlist w where w.meetup_id = m.id
          ) x where x.user_id = (select auth.uid()))
  from public.meetups m
  where m.id = p_meetup_id
    and (select auth.uid()) is not null
    and (not m.women_only or public.can_see_women_only());
$$;

revoke execute on function public.event_waitlist(uuid) from public, anon;
grant execute on function public.event_waitlist(uuid) to authenticated;

-- A new member leaves the line (however they got in).
create function public.meetup_members_leave_waitlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.meetup_waitlist w where w.meetup_id = new.meetup_id and w.user_id = new.user_id;
  return null;
end;
$$;

create trigger meetup_members_leave_waitlist
after insert on public.meetup_members
for each row execute function public.meetup_members_leave_waitlist();

-- When someone leaves an open event, the first in line takes the place and gets a push. Never blocks the leaving.
create function public.promote_event_waitlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meetup public.meetups%rowtype;
  v_next public.meetup_waitlist%rowtype;
begin
  begin
    select * into v_meetup from public.meetups m where m.id = old.meetup_id for update;
    if not found or v_meetup.kind <> 'event' or v_meetup.status <> 'open' or v_meetup.ends_at <= now()
       or v_meetup.join_mode <> 'open' then
      return null;
    end if;
    while (select count(*) from public.meetup_members mm where mm.meetup_id = old.meetup_id) < v_meetup.max_people loop
      select * into v_next from public.meetup_waitlist w
      where w.meetup_id = old.meetup_id and w.user_id <> old.user_id
      order by w.created_at, w.user_id limit 1;
      exit when not found;
      insert into public.meetup_members (meetup_id, user_id, arrival_at)
      values (old.meetup_id, v_next.user_id, v_next.arrival_at)
      on conflict do nothing;
      delete from public.meetup_waitlist w where w.meetup_id = old.meetup_id and w.user_id = v_next.user_id;
      perform public.push_send(
        v_next.user_id, 'waitlist',
        'You''re in!',
        'A place opened up at "' || public.push_meetup_label(old.meetup_id, 'en') || '"',
        'คุณได้ที่แล้ว!',
        'มีที่ว่างใน "' || public.push_meetup_label(old.meetup_id, 'th') || '" แล้ว',
        '/table/' || old.meetup_id
      );
    end loop;
  exception when others then
    raise warning 'promote_event_waitlist failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger meetup_members_promote_waitlist
after delete on public.meetup_members
for each row execute function public.promote_event_waitlist();

alter publication supabase_realtime add table public.meetup_waitlist;

-- ---------------------------------------------------------------------------
-- Announcements-only chats
-- ---------------------------------------------------------------------------

create function public.meetup_messages_announce_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.meetups m
    where m.id = new.meetup_id and m.announce_only and m.host_id is distinct from new.sender_id
  ) then
    raise exception 'announce_only';
  end if;
  return new;
end;
$$;

create trigger meetup_messages_announce_only
before insert on public.meetup_messages
for each row execute function public.meetup_messages_announce_only();

-- The organiser switches it on or off.
create function public.set_event_announce_only(p_meetup_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  update public.meetups m set announce_only = coalesce(p_on, false)
  where m.id = p_meetup_id and m.kind = 'event' and m.host_id = auth.uid() and m.status = 'open';
  if not found then
    if exists (select 1 from public.meetups m where m.id = p_meetup_id) then
      raise exception 'not_host';
    end if;
    raise exception 'not_found';
  end if;
end;
$$;

revoke execute on function public.set_event_announce_only(uuid, boolean) from public, anon;
grant execute on function public.set_event_announce_only(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Push wording: "event"
-- ---------------------------------------------------------------------------

create function public.meetup_kind_word(p_kind public.meetup_kind, p_language text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'event' then case when p_language = 'th' then 'อีเวนต์' else 'event' end
    when 'hangout' then case when p_language = 'th' then 'แฮงเอาท์' else 'hangout' end
    else case when p_language = 'th' then 'โต๊ะ' else 'table' end
  end;
$$;

revoke execute on function public.meetup_kind_word(public.meetup_kind, text) from public, anon, authenticated;

create or replace function public.push_on_join_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meetup public.meetups%rowtype;
  v_name text;
begin
  begin
    select * into v_meetup from public.meetups m where m.id = new.meetup_id;
    if tg_op = 'INSERT' and new.status = 'pending' then
      select p.display_name into v_name from public.profiles p where p.id = new.user_id;
      perform public.push_send(
        v_meetup.host_id, 'join_request',
        'Join request',
        v_name || ' asked to join your ' || public.meetup_kind_word(v_meetup.kind, 'en') || ' "'
          || public.push_meetup_label(v_meetup.id, 'en') || '"',
        'คำขอเข้าร่วม',
        v_name || ' ขอเข้าร่วม' || public.meetup_kind_word(v_meetup.kind, 'th') || 'ของคุณ "'
          || public.push_meetup_label(v_meetup.id, 'th') || '"',
        '/table/' || v_meetup.id
      );
    elsif tg_op = 'UPDATE' and new.status = 'approved' and old.status = 'pending' then
      select p.display_name into v_name from public.profiles p where p.id = v_meetup.host_id;
      perform public.push_send(
        new.user_id, 'request_approved',
        'You''re in!',
        v_name || ' approved your request to join "' || public.push_meetup_label(v_meetup.id, 'en') || '"',
        'คุณได้เข้าร่วมแล้ว!',
        v_name || ' อนุมัติคำขอเข้าร่วม "' || public.push_meetup_label(v_meetup.id, 'th') || '" ของคุณ',
        '/table/' || v_meetup.id
      );
    end if;
  exception when others then
    raise warning 'push_on_join_request failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create or replace function public.push_on_join()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meetup public.meetups%rowtype;
  v_name text;
begin
  begin
    select * into v_meetup from public.meetups m where m.id = new.meetup_id;
    if v_meetup.host_id is not null and v_meetup.host_id <> new.user_id and v_meetup.status = 'open'
       and v_meetup.join_mode = 'open'
       and not public.is_blocked_between(v_meetup.host_id, new.user_id) then
      select p.display_name into v_name from public.profiles p where p.id = new.user_id;
      perform public.push_send(
        v_meetup.host_id, 'joined',
        'New member',
        v_name || ' joined your ' || public.meetup_kind_word(v_meetup.kind, 'en')
          || ' "' || public.push_meetup_label(v_meetup.id, 'en') || '"',
        'มีคนเข้าร่วม',
        v_name || ' เข้าร่วม' || public.meetup_kind_word(v_meetup.kind, 'th')
          || 'ของคุณ "' || public.push_meetup_label(v_meetup.id, 'th') || '"',
        '/table/' || v_meetup.id
      );
    end if;
  exception when others then
    raise warning 'push_on_join failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create or replace function public.push_on_new_meetup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lat double precision;
  v_lng double precision;
  v_active boolean := true;
  v_when text;
  v_host text;
  r record;
begin
  begin
    if new.status <> 'open' then
      return null;
    end if;
    if new.venue_id is not null then
      select v.lat, v.lng, v.is_active into v_lat, v_lng, v_active from public.venues v where v.id = new.venue_id;
    elsif new.place_id is not null then
      select pl.lat, pl.lng into v_lat, v_lng from public.places pl where pl.id = new.place_id;
    else
      v_lat := new.spot_lat;
      v_lng := new.spot_lng;
    end if;
    if v_lat is null or v_lng is null or not coalesce(v_active, false) then
      return null;
    end if;
    v_when := to_char(new.starts_at at time zone coalesce(new.time_zone, 'Asia/Bangkok'), 'DD/MM HH24:MI');
    select p.display_name into v_host from public.profiles p where p.id = new.host_id;

    for r in
      select distinct d.user_id from public.push_devices d
      where d.user_id <> new.host_id and d.area_lat is not null
        and extensions.st_dwithin(
              extensions.st_setsrid(extensions.st_makepoint(d.area_lng, d.area_lat), 4326)::extensions.geography,
              extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography,
              20000)
        and not public.is_blocked_between(d.user_id, new.host_id)
        and (not new.women_only or public.is_verified_woman(d.user_id))
    loop
      perform public.push_send(
        r.user_id, 'nearby',
        case new.kind when 'event' then 'New event near you' when 'hangout' then 'New hangout near you'
             else 'New table near you' end,
        v_host || ' created "' || public.push_meetup_label(new.id, 'en') || '" · ' || v_when,
        case new.kind when 'event' then 'อีเวนต์ใหม่ใกล้คุณ' when 'hangout' then 'แฮงเอาท์ใหม่ใกล้คุณ'
             else 'โต๊ะใหม่ใกล้คุณ' end,
        v_host || ' สร้าง "' || public.push_meetup_label(new.id, 'th') || '" · ' || v_when,
        '/table/' || new.id
      );
    end loop;
  exception when others then
    raise warning 'push_on_new_meetup failed: %', sqlerrm;
  end;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- The open list, now with the event fields
-- ---------------------------------------------------------------------------

drop function public.list_open_meetups();

create function public.list_open_meetups()
returns table (
  id uuid,
  kind public.meetup_kind,
  venue_id uuid,
  place_id uuid,
  place_name text,
  place_name_en text,
  place_name_th text,
  place_lat double precision,
  place_lng double precision,
  host_id uuid,
  title text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  max_people integer,
  member_count integer,
  joined boolean,
  time_zone text,
  place_kind text,
  cost_level smallint,
  meeting_point text,
  area_name text,
  area_name_en text,
  area_name_th text,
  challenge_id uuid,
  join_mode text,
  my_request text,
  vibe text,
  pitstop boolean,
  women_only boolean,
  event_category text,
  entry_fee_thb numeric,
  entry_fee_usd numeric,
  photo_paths text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.id, m.kind, m.venue_id, m.place_id,
    coalesce(p.name, m.spot_name), p.name_en, p.name_th, coalesce(p.lat, m.spot_lat), coalesce(p.lng, m.spot_lng),
    m.host_id, m.title, m.description, m.starts_at, m.ends_at, m.max_people,
    (select count(*)::integer from public.meetup_members mm where mm.meetup_id = m.id),
    exists (select 1 from public.meetup_members mm where mm.meetup_id = m.id and mm.user_id = (select auth.uid())),
    m.time_zone,
    p.kind, m.cost_level, m.meeting_point,
    a.name, a.name_en, a.name_th,
    m.challenge_id,
    m.join_mode,
    (select r.status from public.meetup_join_requests r
     where r.meetup_id = m.id and r.user_id = (select auth.uid()) and r.status <> 'approved'),
    m.vibe,
    m.pitstop,
    m.women_only,
    m.event_category,
    m.entry_fee_thb,
    m.entry_fee_usd,
    m.photo_paths
  from public.meetups m
  left join public.venues v on v.id = m.venue_id
  left join public.places p on p.id = m.place_id
  left join lateral public.area_near(coalesce(p.lat, m.spot_lat, v.lat), coalesce(p.lng, m.spot_lng, v.lng)) a on true
  where m.status = 'open' and m.ends_at > now() and (m.venue_id is null or v.is_active)
  order by m.starts_at;
$$;
revoke execute on function public.list_open_meetups() from public, anon;
grant execute on function public.list_open_meetups() to authenticated;
