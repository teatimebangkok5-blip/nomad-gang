-- Editing an event (founder, 2026-10-22): only its organiser, while it is open and not over (update_event).
--
-- * Everything from the create form can change except who can join and women-only: name, category, description,
--   place (venue, place or spot, with the spot's time zone), start and end, max people, meeting point, price, ticket
--   link, photos, announcements only. The same rules as create_event apply; also:
--   - once it has started, the start stays (invalid_time);
--   - max people can't go below the people already in (size_below_members); raising it lets the waiting list in;
--   - arrival times outside the new hours are cleared (people pick again);
--   - a new place resets the city (Bangkok is set here; elsewhere the app looks it up and saves it with
--     set_meetup_area, as when creating).
-- * Members get a push when the time, place or price changes (kind 'event_update').
-- * Photos the organiser removed are deleted from storage by the app after saving.
--
-- Errors: create_event's, plus not_found, not_event, not_host, meetup_cancelled, meetup_ended, size_below_members.

-- Moves the first people in line in while there's room (open events). The caller holds the meetup row lock.
create function public.event_fill_from_waitlist(p_meetup_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meetup public.meetups%rowtype;
  v_next public.meetup_waitlist%rowtype;
begin
  select * into v_meetup from public.meetups m where m.id = p_meetup_id;
  if not found or v_meetup.kind <> 'event' or v_meetup.status <> 'open' or v_meetup.ends_at <= now()
     or v_meetup.join_mode <> 'open' then
    return;
  end if;
  while (select count(*) from public.meetup_members mm where mm.meetup_id = p_meetup_id) < v_meetup.max_people loop
    select * into v_next from public.meetup_waitlist w
    where w.meetup_id = p_meetup_id
    order by w.created_at, w.user_id limit 1;
    exit when not found;
    insert into public.meetup_members (meetup_id, user_id, arrival_at)
    values (p_meetup_id, v_next.user_id, v_next.arrival_at)
    on conflict do nothing;
    delete from public.meetup_waitlist w where w.meetup_id = p_meetup_id and w.user_id = v_next.user_id;
    perform public.push_send(
      v_next.user_id, 'waitlist',
      'You''re in!',
      'A place opened up at "' || public.push_meetup_label(p_meetup_id, 'en') || '"',
      'คุณได้ที่แล้ว!',
      'มีที่ว่างใน "' || public.push_meetup_label(p_meetup_id, 'th') || '" แล้ว',
      '/table/' || p_meetup_id
    );
  end loop;
end;
$$;

revoke execute on function public.event_fill_from_waitlist(uuid) from public, anon, authenticated;

-- Same as before, through the shared function.
create or replace function public.promote_event_waitlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform 1 from public.meetups m where m.id = old.meetup_id for update;
    if found then
      perform public.event_fill_from_waitlist(old.meetup_id);
    end if;
  exception when others then
    raise warning 'promote_event_waitlist failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create function public.update_event(
  p_meetup_id uuid,
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
  p_announce_only boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_old public.meetups%rowtype;
  v_venue_id uuid := p_venue_id;
  v_place_id uuid := p_place_id;
  v_title text := left(trim(coalesce(p_title, '')), 80);
  v_photos text[] := coalesce(p_photo_paths, '{}');
  v_link text := nullif(trim(coalesce(p_ticket_url, '')), '');
  v_fee_thb numeric := round(p_fee_thb, 2);
  v_fee_usd numeric := round(p_fee_usd, 2);
  v_zone text := 'Asia/Bangkok';
  v_spot_name text;
  v_in_bangkok boolean := true;
  v_moved boolean;
  v_retimed boolean;
  v_repriced boolean;
  v_what_en text[] := '{}';
  v_what_th text[] := '{}';
  r record;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  select * into v_old from public.meetups m where m.id = p_meetup_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_old.kind <> 'event' then
    raise exception 'not_event';
  end if;
  if v_old.host_id <> v_uid then
    raise exception 'not_host';
  end if;
  if v_old.status <> 'open' then
    raise exception 'meetup_cancelled';
  end if;
  if v_old.ends_at <= now() then
    raise exception 'meetup_ended';
  end if;

  if p_starts_at is null then
    raise exception 'invalid_time';
  end if;
  if v_old.starts_at <= now() then
    if p_starts_at <> v_old.starts_at then
      raise exception 'invalid_time';
    end if;
  elsif p_starts_at < now() - interval '15 minutes' or p_starts_at > now() + interval '60 days' then
    raise exception 'invalid_time';
  end if;
  if p_ends_at is null or p_ends_at < p_starts_at + interval '30 minutes' or p_ends_at > p_starts_at + interval '7 days'
     or p_ends_at <= now() then
    raise exception 'invalid_duration';
  end if;
  if p_max_people is null or p_max_people not between 2 and 150 then
    raise exception 'invalid_size';
  end if;
  if p_max_people < (select count(*) from public.meetup_members mm where mm.meetup_id = p_meetup_id) then
    raise exception 'size_below_members';
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
  if num_nonnulls(p_venue_id, p_place_id, p_spot_lat) <> 1 then
    raise exception 'invalid_place';
  end if;

  if v_place_id is not null then
    select v.id into v_venue_id from public.venues v where v.place_id = v_place_id and v.is_active;
    if v_venue_id is not null then
      v_place_id := null;
    elsif not exists (select 1 from public.places p where p.id = v_place_id) then
      raise exception 'venue_unavailable';
    end if;
  elsif v_venue_id is not null then
    -- The event's own venue stays fine even if it was hidden since.
    if v_venue_id is distinct from v_old.venue_id
       and not exists (select 1 from public.venues v where v.id = v_venue_id and v.is_active) then
      raise exception 'venue_unavailable';
    end if;
  else
    if p_spot_lng is null or p_spot_lat not between -85 and 85 or p_spot_lng not between -180 and 180 then
      raise exception 'invalid_place';
    end if;
    v_spot_name := left(trim(coalesce(p_spot_name, '')), 80);
    if v_spot_name = '' then
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
    v_in_bangkok := public.in_bangkok(p_spot_lat, p_spot_lng);
  end if;

  v_moved := v_venue_id is distinct from v_old.venue_id
          or v_place_id is distinct from v_old.place_id
          or p_spot_lat is distinct from v_old.spot_lat
          or (p_spot_lat is not null and p_spot_lng is distinct from v_old.spot_lng);
  v_retimed := p_starts_at <> v_old.starts_at or p_ends_at <> v_old.ends_at;
  v_repriced := v_fee_thb is distinct from v_old.entry_fee_thb or v_fee_usd is distinct from v_old.entry_fee_usd;

  update public.meetups m
  set title = v_title,
      description = left(trim(coalesce(p_description, '')), 2000),
      event_category = p_category,
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      max_people = p_max_people,
      venue_id = v_venue_id,
      place_id = v_place_id,
      spot_name = v_spot_name,
      spot_lat = p_spot_lat,
      spot_lng = case when p_spot_lat is not null then p_spot_lng end,
      time_zone = v_zone,
      meeting_point = nullif(left(trim(coalesce(p_meeting_point, '')), 120), ''),
      entry_fee_thb = v_fee_thb,
      entry_fee_usd = v_fee_usd,
      ticket_url = v_link,
      photo_paths = v_photos,
      announce_only = coalesce(p_announce_only, false),
      cost_level = public.event_cost_level(v_fee_thb, v_fee_usd),
      city = case when not v_moved then m.city when v_in_bangkok then 'Bangkok' end,
      country_code = case when not v_moved then m.country_code when v_in_bangkok then 'TH' end
  where m.id = p_meetup_id;

  -- Arrival times outside the new hours no longer make sense.
  if v_retimed then
    update public.meetup_members mm set arrival_at = null
    where mm.meetup_id = p_meetup_id and (mm.arrival_at < p_starts_at or mm.arrival_at >= p_ends_at);
    update public.meetup_waitlist w set arrival_at = null
    where w.meetup_id = p_meetup_id and (w.arrival_at < p_starts_at or w.arrival_at >= p_ends_at);
  end if;
  if p_max_people > v_old.max_people then
    perform public.event_fill_from_waitlist(p_meetup_id);
  end if;

  -- Tell the members what changed.
  if v_moved or v_retimed or v_repriced then
    begin
      if v_retimed then
        v_what_en := array_append(v_what_en, 'new time');
        v_what_th := array_append(v_what_th, 'เวลาใหม่');
      end if;
      if v_moved then
        v_what_en := array_append(v_what_en, 'new place');
        v_what_th := array_append(v_what_th, 'สถานที่ใหม่');
      end if;
      if v_repriced then
        v_what_en := array_append(v_what_en, 'new price');
        v_what_th := array_append(v_what_th, 'ราคาใหม่');
      end if;
      for r in
        select mm.user_id from public.meetup_members mm
        where mm.meetup_id = p_meetup_id and mm.user_id <> v_uid
          and not public.is_blocked_between(mm.user_id, v_uid)
      loop
        perform public.push_send(
          r.user_id, 'event_update',
          'Event updated',
          '"' || public.push_meetup_label(p_meetup_id, 'en') || '": ' || array_to_string(v_what_en, ', '),
          'อีเวนต์มีการเปลี่ยนแปลง',
          '"' || public.push_meetup_label(p_meetup_id, 'th') || '": ' || array_to_string(v_what_th, ', '),
          '/table/' || p_meetup_id
        );
      end loop;
    exception when others then
      raise warning 'update_event push failed: %', sqlerrm;
    end;
  end if;
end;
$$;

revoke execute on function public.update_event(uuid, text, text, text, timestamptz, timestamptz, integer, uuid, uuid, double precision, double precision, text, text, text, numeric, numeric, text, text[], boolean) from public, anon;
grant execute on function public.update_event(uuid, text, text, text, timestamptz, timestamptz, integer, uuid, uuid, double precision, double precision, text, text, text, numeric, numeric, text, text[], boolean) to authenticated;
