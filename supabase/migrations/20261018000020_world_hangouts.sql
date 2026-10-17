-- Hangouts anywhere in the world (tables stay Bangkok-only for now).
--
-- * A hangout at a spot (a dropped pin, or a place from the map tiles outside Bangkok) may be anywhere on Earth.
--   Partner venues and public.places are still Bangkok only, so hangouts there stay in Bangkok.
-- * meetups.time_zone: the IANA time zone where the meetup happens, so the app shows its times in local time.
--   Tables and hangouts at venues / places are 'Asia/Bangkok'. For a spot the app sends the zone it looked up from the
--   pin; the server checks it is a real zone name. Without one, a spot in the Bangkok box gets 'Asia/Bangkok' and a
--   spot elsewhere is rejected (invalid_time_zone).
-- * The world map places themselves are not stored: the app draws them from the free OpenFreeMap vector tiles
--   (OpenStreetMap), so nothing new is kept in the database.
-- * Notifications about new tables / hangouts by others only cover meetups near the user: within 50 km of the
--   position the app sends, or inside the Bangkok box when it sends none.

alter table public.meetups add column time_zone text not null default 'Asia/Bangkok'
  check (length(time_zone) between 1 and 64);

alter table public.meetups drop constraint meetups_spot_valid;
alter table public.meetups add constraint meetups_spot_valid check (
  (spot_name is null and spot_lat is null and spot_lng is null)
  or (
    kind = 'hangout'
    and length(trim(spot_name)) between 1 and 80
    and spot_lat between -85 and 85
    and spot_lng between -180 and 180
  )
);

-- True for a point inside the Bangkok box used for tables and places.
create function public.in_bangkok(p_lat double precision, p_lng double precision)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_lat between 13.45 and 14.10 and p_lng between 100.25 and 100.95;
$$;

drop function public.create_hangout(text, text, timestamptz, integer, integer, uuid, uuid, double precision, double precision, text);

-- Create a hangout. Give exactly one of: p_venue_id, p_place_id, or p_spot_lat + p_spot_lng + p_spot_name (+ the
-- spot's p_time_zone). A place linked to a live partner venue becomes a hangout at that venue (so its promotions
-- apply). Extra error keys: invalid_duration, title_required, invalid_place, spot_name_required, invalid_time_zone.
create function public.create_hangout(
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_max_people integer,
  p_venue_id uuid default null,
  p_place_id uuid default null,
  p_spot_lat double precision default null,
  p_spot_lng double precision default null,
  p_spot_name text default null,
  p_time_zone text default null
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
     or p_starts_at > now() + interval '14 days' then
    raise exception 'invalid_time';
  end if;
  if p_duration_minutes is null or p_duration_minutes not between 30 and 720 then
    raise exception 'invalid_duration';
  end if;
  if p_max_people is null or p_max_people not between 2 and 30 then
    raise exception 'invalid_size';
  end if;
  if v_title = '' then
    raise exception 'title_required';
  end if;
  if num_nonnulls(p_venue_id, p_place_id, p_spot_lat) <> 1 then
    raise exception 'invalid_place';
  end if;
  if (
    select count(*) from public.meetups m
    where m.host_id = v_uid and m.kind = 'hangout' and m.status = 'open' and m.ends_at > now()
  ) >= 3 then
    raise exception 'too_many_open';
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

  insert into public.meetups (
    kind, venue_id, place_id, spot_name, spot_lat, spot_lng,
    host_id, title, description, starts_at, ends_at, max_people, time_zone
  )
  values (
    'hangout', v_venue_id, v_place_id,
    case when p_spot_lat is not null then left(trim(p_spot_name), 80) end,
    p_spot_lat,
    case when p_spot_lat is not null then p_spot_lng end,
    v_uid, v_title, left(trim(coalesce(p_description, '')), 500),
    p_starts_at, p_starts_at + make_interval(mins => p_duration_minutes), p_max_people, v_zone
  )
  returning id into v_id;

  insert into public.meetup_members (meetup_id, user_id) values (v_id, v_uid);
  return v_id;
end;
$$;

revoke execute on function public.create_hangout(text, text, timestamptz, integer, integer, uuid, uuid, double precision, double precision, text, text) from public, anon;
grant execute on function public.create_hangout(text, text, timestamptz, integer, integer, uuid, uuid, double precision, double precision, text, text) to authenticated;

-- Same as before, plus each meetup's time zone.
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
  time_zone text
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
    m.time_zone
  from public.meetups m
  left join public.venues v on v.id = m.venue_id
  left join public.places p on p.id = m.place_id
  where m.status = 'open' and m.ends_at > now() and (m.venue_id is null or v.is_active)
  order by m.starts_at;
$$;

revoke execute on function public.list_open_meetups() from public, anon;
grant execute on function public.list_open_meetups() to authenticated;

-- Notifications: as before, but new tables / hangouts by others only when they are near me (50 km from p_lat/p_lng,
-- or in the Bangkok box when no position is given), so a hangout in Paris doesn't notify everyone in Bangkok.
drop function public.my_notifications(integer);

create function public.my_notifications(
  p_limit integer default 60,
  p_lat double precision default null,
  p_lng double precision default null
)
returns table (
  id text,
  kind text,
  at timestamptz,
  actor_id uuid,
  actor_name text,
  actor_avatar text,
  meetup_id uuid,
  meetup_kind text,
  title text,
  place_name text,
  place_name_en text,
  place_name_th text,
  venue_id uuid,
  venue_name_en text,
  venue_name_th text,
  venue_category text,
  promo_kind text,
  promo_title_en text,
  promo_title_th text,
  body text,
  unread boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as id,
           coalesce((select s.seen_at from public.notification_state s where s.user_id = (select auth.uid())),
                    '-infinity'::timestamptz) as seen
  ),
  my_meetups as (
    select mm.meetup_id from public.meetup_members mm where mm.user_id = (select me.id from me)
  ),
  items as (
    -- New tables and hangouts near me by others that are still open.
    select 'meetup:' || m.id as id,
           case when m.kind = 'hangout' then 'new_hangout' else 'new_table' end as kind,
           m.created_at as at, m.host_id as actor_id, m.id as meetup_id, null::text as body,
           null::uuid as deal_id
    from public.meetups m
    left join public.venues v on v.id = m.venue_id
    left join public.places pl on pl.id = m.place_id
    cross join lateral (
      select coalesce(v.lat, pl.lat, m.spot_lat) as lat, coalesce(v.lng, pl.lng, m.spot_lng) as lng
    ) at_
    where m.host_id <> (select me.id from me)
      and m.status = 'open' and m.ends_at > now()
      and m.created_at > now() - interval '7 days'
      and (m.venue_id is null or v.is_active)
      and case
            when p_lat is null or p_lng is null then public.in_bangkok(at_.lat, at_.lng)
            else extensions.st_dwithin(
                   extensions.st_setsrid(extensions.st_makepoint(at_.lng, at_.lat), 4326)::extensions.geography,
                   extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
                   50000)
          end
    union all
    -- People who joined my tables and hangouts.
    select 'join:' || mm.meetup_id || ':' || mm.user_id, 'joined', mm.joined_at, mm.user_id, m.id, null, null
    from public.meetup_members mm
    join public.meetups m on m.id = mm.meetup_id
    where m.host_id = (select me.id from me) and mm.user_id <> m.host_id
      and m.status = 'open'
      and mm.joined_at > now() - interval '14 days'
    union all
    -- The latest message from others in each chat I'm in.
    select * from (
      select distinct on (msg.meetup_id)
             'chat:' || msg.meetup_id, 'chat_message', msg.created_at, msg.sender_id, msg.meetup_id,
             left(msg.body, 140), null::uuid
      from public.meetup_messages msg
      where msg.meetup_id in (select my_meetups.meetup_id from my_meetups)
        and msg.sender_id <> (select me.id from me)
        and msg.created_at > now() - interval '14 days'
      order by msg.meetup_id, msg.created_at desc
    ) chats
    union all
    -- The latest message from the other person in each conversation (a request until it's accepted).
    select * from (
      select distinct on (t.id)
             'dm:' || t.id,
             case when t.status = 'pending' then 'dm_request' else 'direct_message' end,
             dm.created_at, dm.sender_id, null::uuid, left(dm.body, 140), null::uuid
      from public.direct_threads t
      join public.direct_messages dm on dm.thread_id = t.id
      where (select me.id from me) in (t.user_a, t.user_b)
        and t.status <> 'declined'
        and dm.sender_id <> (select me.id from me)
        and dm.created_at > now() - interval '14 days'
      order by t.id, dm.created_at desc
    ) dms
    union all
    -- New followers.
    select 'follow:' || f.follower_id, 'follow', f.created_at, f.follower_id, null, null, null
    from public.follows f
    where f.followee_id = (select me.id from me)
      and f.created_at > now() - interval '30 days'
    union all
    -- New promotions at partner venues that haven't ended.
    select 'promo:' || d.id, 'promotion', d.created_at, null, null, null, d.id
    from public.deals d
    join public.venues v on v.id = d.venue_id
    where d.is_active and v.is_active
      and (d.ends_at is null or d.ends_at > now())
      and d.created_at > now() - interval '30 days'
  )
  select i.id, i.kind, i.at, i.actor_id, a.display_name, a.avatar_path,
         i.meetup_id, m.kind::text, m.title,
         coalesce(pl.name, m.spot_name), pl.name_en, pl.name_th,
         coalesce(dv.id, mv.id), coalesce(dv.name_en, mv.name_en), coalesce(dv.name_th, mv.name_th),
         coalesce(dv.category, mv.category)::text,
         d.kind::text, d.title_en, d.title_th,
         i.body,
         i.at > (select me.seen from me)
  from items i
  left join public.profiles a on a.id = i.actor_id
  left join public.meetups m on m.id = i.meetup_id
  left join public.places pl on pl.id = m.place_id
  left join public.venues mv on mv.id = m.venue_id
  left join public.deals d on d.id = i.deal_id
  left join public.venues dv on dv.id = d.venue_id
  where (select me.id from me) is not null
    and (i.actor_id is null or not public.is_blocked_between((select me.id from me), i.actor_id))
  order by i.at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 100);
$$;

revoke execute on function public.my_notifications(integer, double precision, double precision) from public, anon;
grant execute on function public.my_notifications(integer, double precision, double precision) to authenticated;
