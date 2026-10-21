-- Vibe tags, "Work & coffee" daytime tables, vibe match, co-working places and pit-stops (founder, 2026-10-21).
--
-- * meetups.vibe: the mood the host picks for a table or hangout: chill (🤫 quiet & chill), party (🍻 party &
--   pre-game), foodies (📸 foodies & photographers), networking (💼 networking & tech) or cowork (💻 work & coffee,
--   the daytime mode). Set right after creating with set_meetup_vibe. A "Work & coffee" table may last 1–8 hours
--   instead of the usual 3 ("Working from Bean till 3 PM").
-- * profiles.vibes: the vibes someone likes (set_my_vibes); the app marks tables and hangouts with one of them as
--   "Your vibe".
-- * 21 named Bangkok co-working spaces from OpenStreetMap (kind 'coworking', purpose 'food', so tables can be made
--   there; 2 more were already in as cafés and stay cafés). © OpenStreetMap contributors, ODbL.
-- * Pit-stops: "Heading to X in 15 min". A short hangout (meetups.pitstop) starting within the hour, 30–120 minutes
--   long, 2–8 people, max 1 open per person (it also counts as one of the 3 open hangouts). create_pitstop.
--
-- Errors: auth_required, not_host, not_found, invalid_vibe, invalid_duration, invalid_time, invalid_size,
-- too_many_open (and create_hangout's).

alter table public.meetups
  add column vibe text check (vibe in ('chill', 'party', 'foodies', 'networking', 'cowork')),
  add column pitstop boolean not null default false;

alter table public.profiles
  add column vibes text[] not null default '{}'
    check (vibes <@ array['chill', 'party', 'foodies', 'networking', 'cowork'] and cardinality(vibes) <= 5);

-- The host sets the vibe (null = none). p_hours: only for a "Work & coffee" table, its length (1–8 hours).
create function public.set_meetup_vibe(p_meetup_id uuid, p_vibe text, p_hours integer default null)
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
  if p_vibe is not null and p_vibe not in ('chill', 'party', 'foodies', 'networking', 'cowork') then
    raise exception 'invalid_vibe';
  end if;
  select * into v_meetup from public.meetups m where m.id = p_meetup_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_meetup.host_id <> auth.uid() or v_meetup.status <> 'open' or v_meetup.ends_at <= now() then
    raise exception 'not_host';
  end if;
  if p_hours is not null and (v_meetup.kind <> 'table' or p_vibe is distinct from 'cowork' or p_hours not between 1 and 8) then
    raise exception 'invalid_duration';
  end if;
  update public.meetups m
  set vibe = p_vibe,
      ends_at = case when p_hours is not null then m.starts_at + make_interval(hours => p_hours) else m.ends_at end
  where m.id = p_meetup_id;
end;
$$;

revoke execute on function public.set_meetup_vibe(uuid, text, integer) from public, anon;
grant execute on function public.set_meetup_vibe(uuid, text, integer) to authenticated;

create function public.set_my_vibes(p_vibes text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if not (coalesce(p_vibes, '{}') <@ array['chill', 'party', 'foodies', 'networking', 'cowork']) then
    raise exception 'invalid_vibe';
  end if;
  update public.profiles
  set vibes = (select coalesce(array_agg(distinct v order by v), '{}') from unnest(coalesce(p_vibes, '{}')) v)
  where id = auth.uid();
end;
$$;

revoke execute on function public.set_my_vibes(text[]) from public, anon;
grant execute on function public.set_my_vibes(text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Co-working spaces
-- ---------------------------------------------------------------------------

insert into public.places (osm_type, osm_id, name, name_en, name_th, kind, cuisine, lat, lng, purpose) values
  ('node', 444402401, 'Sci Space', 'Sci Space', null, 'coworking', null, 13.7365387, 100.5304172, 'food'),
  ('node', 3593895307, 'Ma:D Social Entepreneurs Hub', 'Ma:D Social Entepreneurs Hub', 'มาดี', 'coworking', null, 13.7245800, 100.5873074, 'food'),
  ('node', 4841595724, 'The Work Loft', 'The Work Loft', null, 'coworking', null, 13.7281090, 100.5338990, 'food'),
  ('node', 10048722799, 'BOB Space', null, null, 'coworking', null, 13.7468547, 100.5575652, 'food'),
  ('node', 10575864894, 'CU Hangout Space', 'CU Hangout Space', null, 'coworking', null, 13.7420256, 100.5272742, 'food'),
  ('node', 10638664715, 'PLEARN Space', 'PLEARN Space', null, 'coworking', null, 13.7350713, 100.5320956, 'food'),
  ('node', 10685524664, 'Mint Worklounge Serviced Office Thonglor Soi 13', 'Mint Worklounge Serviced Office Thonglor Soi 13', null, 'coworking', null, 13.7335349, 100.5820929, 'food'),
  ('node', 10772641961, 'สโมสรธรรมทาน', 'Co Dhamma Space', null, 'coworking', null, 13.8170826, 100.5561979, 'food'),
  ('node', 10960662791, 'C asean Samyan CO-OP', 'C asean Samyan CO-OP', null, 'coworking', null, 13.7338529, 100.5281169, 'food'),
  ('node', 11271475035, 'Kloud', null, null, 'coworking', null, 13.7444482, 100.5325754, 'food'),
  ('node', 11282650914, 'Coqoon', null, null, 'coworking', null, 13.7150734, 100.5398538, 'food'),
  ('node', 11380819280, 'คิดNap', 'Kiddnap', 'คิดNap', 'coworking', null, 13.7450464, 100.5236297, 'food'),
  ('node', 11419961276, 'theCanvas', null, null, 'coworking', null, 13.7259651, 100.5384889, 'food'),
  ('node', 12317637826, 'Paper Plane Project', null, null, 'coworking', null, 13.7222582, 100.5804018, 'food'),
  ('node', 12317920489, 'WeWork', null, null, 'coworking', null, 13.7221983, 100.5806298, 'food'),
  ('node', 12774716882, 'ที่ดินพี่เรือน', null, null, 'coworking', null, 13.9027822, 100.3849603, 'food'),
  ('node', 13390035898, 'MIX Co-Working Space', null, null, 'coworking', null, 13.8838100, 100.5650420, 'food'),
  ('way', 292574906, 'The Hive', null, null, 'coworking', null, 13.7320059, 100.5766205, 'food'),
  ('way', 395155243, 'Spaces', null, null, 'coworking', null, 13.8206477, 100.5640537, 'food'),
  ('way', 457285024, 'Hubba', null, null, 'coworking', null, 13.7252911, 100.5876503, 'food'),
  ('way', 1228623859, 'WOLF Co-Working Space', null, null, 'coworking', null, 13.7212758, 100.5190178, 'food'),
  ('way', 1232561059, 'TLoft', null, null, 'coworking', null, 13.7242943, 100.5165946, 'food'),
  ('way', 1387773006, 'WE Workspace', null, null, 'coworking', null, 13.7849036, 100.5362683, 'food')
on conflict (osm_type, osm_id) do nothing;

-- ---------------------------------------------------------------------------
-- Pit-stops
-- ---------------------------------------------------------------------------

-- "Heading to <where> in <minutes>": a hangout starting 0–60 minutes from now, 30–120 minutes long, 2–8 people.
create function public.create_pitstop(
  p_title text,
  p_starts_in_minutes integer,
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
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_starts_in_minutes is null or p_starts_in_minutes not between 0 and 60 then
    raise exception 'invalid_time';
  end if;
  if p_duration_minutes is null or p_duration_minutes not between 30 and 120 then
    raise exception 'invalid_duration';
  end if;
  if p_max_people is null or p_max_people not between 2 and 8 then
    raise exception 'invalid_size';
  end if;
  if exists (
    select 1 from public.meetups m
    where m.host_id = auth.uid() and m.pitstop and m.status = 'open' and m.ends_at > now()
  ) then
    raise exception 'too_many_open';
  end if;
  v_id := public.create_hangout(
    p_title, '', now() + make_interval(mins => p_starts_in_minutes), p_duration_minutes, p_max_people,
    p_venue_id, p_place_id, p_spot_lat, p_spot_lng, p_spot_name, p_time_zone
  );
  update public.meetups set pitstop = true where id = v_id;
  return v_id;
end;
$$;

revoke execute on function public.create_pitstop(text, integer, integer, integer, uuid, uuid, double precision, double precision, text, text) from public, anon;
grant execute on function public.create_pitstop(text, integer, integer, integer, uuid, uuid, double precision, double precision, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The open list, now with vibe and pitstop
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
  pitstop boolean
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
    m.pitstop
  from public.meetups m
  left join public.venues v on v.id = m.venue_id
  left join public.places p on p.id = m.place_id
  left join lateral public.area_near(coalesce(p.lat, m.spot_lat, v.lat), coalesce(p.lng, m.spot_lng, v.lng)) a on true
  where m.status = 'open' and m.ends_at > now() and (m.venue_id is null or v.is_active)
  order by m.starts_at;
$$;
revoke execute on function public.list_open_meetups() from public, anon;
grant execute on function public.list_open_meetups() to authenticated;
