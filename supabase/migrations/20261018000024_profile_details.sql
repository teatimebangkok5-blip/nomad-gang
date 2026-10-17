-- Profile details, first-time questions, friends, trips, countries visited, favourite places and a person's events.
--
-- * About: home country (ISO 3166 code), languages (ISO 639 codes, or 'other'), profession, travel style and
--   interests (keys the app translates), world clocks (IANA zones) and countries visited (ISO codes). Columns on
--   profiles; checked here because people may also update their own row directly.
-- * Birthday: asked once on first sign-in, 18+ only. It is private (profile_private, no API access); profiles only
--   ever show the age. Having a birthday saved = the first-time questions are done.
-- * Friends = mutual follows (are_friends). get_profile now returns the friends count; user_friends lists them.
-- * Trips: places someone is going to or has been (city, dates). Readable by everyone signed in, except across a
--   block; changed only through save_trip / delete_trip (max 50 per person).
-- * Favourite places: places and partner venues someone saved. Private to that person.
-- * profile_meetups: the tables and hangouts someone is going to or went to (not cancelled), for the Events tab.
--
-- Errors: auth_required, name_required, birth_date_required, invalid_birth_date, too_young, invalid_instagram,
-- invalid_country, invalid_details, invalid_time_zone, too_many_clocks, invalid_trip, too_many_trips, not_found.

-- ---------------------------------------------------------------------------
-- About
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column home_country text check (home_country is null or home_country ~ '^[A-Z]{2}$'),
  add column languages text[] not null default '{}'
    check (cardinality(languages) <= 10 and array_to_string(languages, ',') ~ '^([a-z]{2,5}(,[a-z]{2,5})*)?$'),
  add column profession text check (profession is null or profession ~ '^[a-z_]{1,30}$'),
  add column travel_style text check (travel_style is null or travel_style ~ '^[a-z_]{1,30}$'),
  add column interests text[] not null default '{}'
    check (cardinality(interests) <= 15 and array_to_string(interests, ',') ~ '^([a-z_]{1,30}(,[a-z_]{1,30})*)?$'),
  add column world_clocks text[] not null default '{}'
    check (cardinality(world_clocks) <= 6 and array_to_string(world_clocks, ',') ~ '^([A-Za-z0-9_/+-]{1,40}(,[A-Za-z0-9_/+-]{1,40})*)?$'),
  add column visited_countries text[] not null default '{}'
    check (cardinality(visited_countries) <= 250 and array_to_string(visited_countries, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$');

create table public.profile_private (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  birth_date date not null check (birth_date >= date '1900-01-01')
);

alter table public.profile_private enable row level security;
revoke all on public.profile_private from anon, authenticated;

-- Age in whole years today in Bangkok.
create function public.age_on(p_birth_date date)
returns integer
language sql
stable
set search_path = ''
as $$
  select extract(year from age((now() at time zone 'Asia/Bangkok')::date, p_birth_date))::integer;
$$;

revoke execute on function public.age_on(date) from public, anon, authenticated;

-- A list of keys: trimmed, lower case, no blanks or repeats, at most p_max.
create function public.clean_keys(p_keys text[], p_max integer)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_keys text[];
begin
  select coalesce(array_agg(k order by first_at), '{}') into v_keys
  from (
    select lower(trim(x)) as k, min(ord) as first_at
    from unnest(coalesce(p_keys, '{}')) with ordinality as u (x, ord)
    where nullif(trim(x), '') is not null
    group by lower(trim(x))
  ) keys;
  if cardinality(v_keys) > p_max then
    raise exception 'invalid_details';
  end if;
  return v_keys;
end;
$$;

revoke execute on function public.clean_keys(text[], integer) from public, anon, authenticated;

-- My own details, for the first-time questions and the edit page. `onboarded` = a birthday is saved.
create function public.my_profile_details()
returns table (
  display_name text,
  instagram text,
  birth_date date,
  home_country text,
  languages text[],
  profession text,
  travel_style text,
  interests text[],
  onboarded boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name, p.instagram, pp.birth_date, p.home_country, p.languages, p.profession, p.travel_style,
         p.interests, pp.birth_date is not null
  from public.profiles p
  left join public.profile_private pp on pp.user_id = p.id
  where p.id = (select auth.uid());
$$;

-- Saves everything from the first-time questions or the edit page at once.
create function public.save_my_profile(
  p_display_name text,
  p_instagram text,
  p_birth_date date,
  p_home_country text,
  p_languages text[],
  p_profession text,
  p_travel_style text,
  p_interests text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_country text := nullif(upper(trim(coalesce(p_home_country, ''))), '');
  v_profession text := nullif(lower(trim(coalesce(p_profession, ''))), '');
  v_style text := nullif(lower(trim(coalesce(p_travel_style, ''))), '');
  v_languages text[];
  v_interests text[];
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_birth_date is null then
    raise exception 'birth_date_required';
  end if;
  if p_birth_date < date '1900-01-01' or p_birth_date > (now() at time zone 'Asia/Bangkok')::date then
    raise exception 'invalid_birth_date';
  end if;
  if public.age_on(p_birth_date) < 18 then
    raise exception 'too_young';
  end if;
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    raise exception 'invalid_country';
  end if;
  v_languages := public.clean_keys(p_languages, 10);
  v_interests := public.clean_keys(p_interests, 15);
  if array_to_string(v_languages, ',') !~ '^([a-z]{2,5}(,[a-z]{2,5})*)?$'
     or array_to_string(v_interests, ',') !~ '^([a-z_]{1,30}(,[a-z_]{1,30})*)?$'
     or (v_profession is not null and v_profession !~ '^[a-z_]{1,30}$')
     or (v_style is not null and v_style !~ '^[a-z_]{1,30}$') then
    raise exception 'invalid_details';
  end if;

  -- Name and Instagram keep their own checks.
  perform public.update_my_profile(p_display_name, p_instagram);

  update public.profiles
  set home_country = v_country, languages = v_languages, profession = v_profession, travel_style = v_style,
      interests = v_interests
  where id = auth.uid();

  insert into public.profile_private (user_id, birth_date) values (auth.uid(), p_birth_date)
  on conflict (user_id) do update set birth_date = excluded.birth_date;
end;
$$;

-- World clocks on my profile: up to 6 real time zones.
create function public.set_my_world_clocks(p_zones text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zones text[];
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  select coalesce(array_agg(z order by first_at), '{}') into v_zones
  from (
    select trim(x) as z, min(ord) as first_at
    from unnest(coalesce(p_zones, '{}')) with ordinality as u (x, ord)
    where nullif(trim(x), '') is not null
    group by trim(x)
  ) zones;
  if cardinality(v_zones) > 6 then
    raise exception 'too_many_clocks';
  end if;
  if exists (
    select 1 from unnest(v_zones) as z
    where not exists (select 1 from pg_catalog.pg_timezone_names tz where tz.name = z)
  ) then
    raise exception 'invalid_time_zone';
  end if;
  update public.profiles set world_clocks = v_zones where id = auth.uid();
end;
$$;

-- Countries I've been to (ISO codes), sorted.
create function public.set_my_visited_countries(p_codes text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_codes text[];
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct upper(trim(x)) order by upper(trim(x))), '{}') into v_codes
  from unnest(coalesce(p_codes, '{}')) as x
  where nullif(trim(x), '') is not null;
  if cardinality(v_codes) > 250 or array_to_string(v_codes, ',') !~ '^([A-Z]{2}(,[A-Z]{2})*)?$' then
    raise exception 'invalid_country';
  end if;
  update public.profiles set visited_countries = v_codes where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Trips
-- ---------------------------------------------------------------------------

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  city text not null check (length(trim(city)) between 1 and 80),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  starts_on date not null,
  ends_on date not null,
  note text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 366),
  check ((lat is null) = (lng is null))
);

create index trips_user_idx on public.trips (user_id, starts_on);

alter table public.trips enable row level security;
revoke insert, update, delete on public.trips from anon, authenticated;
revoke all on public.trips from anon;

create policy "Signed-in users read trips"
on public.trips for select to authenticated
using (not public.is_blocked_between((select auth.uid()), user_id));

-- Add (p_id null) or change one of my trips. Dates: up to a year long, ending no more than 10 years back or ahead.
create function public.save_trip(
  p_id uuid,
  p_city text,
  p_country_code text,
  p_lat double precision,
  p_lng double precision,
  p_starts_on date,
  p_ends_on date,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_city text := left(trim(coalesce(p_city, '')), 80);
  v_country text := nullif(upper(trim(coalesce(p_country_code, ''))), '');
  v_note text := nullif(left(trim(coalesce(p_note, '')), 200), '');
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if v_city = '' or p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on
     or p_ends_on - p_starts_on > 366
     or p_ends_on < v_today - interval '10 years' or p_starts_on > v_today + interval '10 years'
     or (v_country is not null and v_country !~ '^[A-Z]{2}$')
     or ((p_lat is null) <> (p_lng is null))
     or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180)) then
    raise exception 'invalid_trip';
  end if;

  if p_id is null then
    if (select count(*) from public.trips t where t.user_id = auth.uid()) >= 50 then
      raise exception 'too_many_trips';
    end if;
    insert into public.trips (user_id, city, country_code, lat, lng, starts_on, ends_on, note)
    values (auth.uid(), v_city, v_country, p_lat, p_lng, p_starts_on, p_ends_on, v_note)
    returning id into v_id;
  else
    update public.trips
    set city = v_city, country_code = v_country, lat = p_lat, lng = p_lng, starts_on = p_starts_on,
        ends_on = p_ends_on, note = v_note
    where id = p_id and user_id = auth.uid()
    returning id into v_id;
    if v_id is null then
      raise exception 'not_found';
    end if;
  end if;
  return v_id;
end;
$$;

create function public.delete_trip(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  delete from public.trips where id = p_id and user_id = auth.uid();
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Favourite places
-- ---------------------------------------------------------------------------

create table public.favorite_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  place_id uuid references public.places (id) on delete cascade,
  venue_id uuid references public.venues (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (num_nonnulls(place_id, venue_id) = 1),
  unique (user_id, place_id),
  unique (user_id, venue_id)
);

alter table public.favorite_places enable row level security;
revoke update on public.favorite_places from anon, authenticated;
revoke all on public.favorite_places from anon;

create policy "People read their own favourites"
on public.favorite_places for select to authenticated
using (user_id = (select auth.uid()));

create policy "People add their own favourites"
on public.favorite_places for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "People remove their own favourites"
on public.favorite_places for delete to authenticated
using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Friends and the profile
-- ---------------------------------------------------------------------------

-- Someone's friends (mutual follows), without people blocked with the caller. Hidden across a block.
create function public.user_friends(p_user_id uuid)
returns table (id uuid, display_name text, avatar_path text, home_country text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.avatar_path, p.home_country
  from public.follows f
  join public.profiles p on p.id = f.followee_id
  where f.follower_id = p_user_id
    and (select auth.uid()) is not null
    and not public.is_blocked_between((select auth.uid()), p_user_id)
    and not public.is_blocked_between((select auth.uid()), p.id)
    and public.are_friends(p_user_id, p.id)
  order by lower(p.display_name)
  limit 500;
$$;

-- The tables and hangouts someone is going to (open, not over) or went to (ended), newest first. Not cancelled ones.
create function public.profile_meetups(p_user_id uuid)
returns table (
  id uuid,
  kind text,
  title text,
  place_name text,
  place_name_en text,
  place_name_th text,
  venue_name_en text,
  venue_name_th text,
  starts_at timestamptz,
  ends_at timestamptz,
  time_zone text,
  member_count integer,
  is_host boolean,
  upcoming boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.kind::text, m.title, coalesce(pl.name, m.spot_name), pl.name_en, pl.name_th, v.name_en, v.name_th,
         m.starts_at, m.ends_at, m.time_zone,
         (select count(*)::integer from public.meetup_members x where x.meetup_id = m.id),
         m.host_id = p_user_id, m.ends_at > now()
  from public.meetup_members mm
  join public.meetups m on m.id = mm.meetup_id
  left join public.venues v on v.id = m.venue_id
  left join public.places pl on pl.id = m.place_id
  where mm.user_id = p_user_id
    and m.status = 'open'
    and (select auth.uid()) is not null
    and not public.is_blocked_between((select auth.uid()), p_user_id)
  order by m.starts_at desc
  limit 60;
$$;

-- get_profile: friends instead of followers / following on the page, plus the About and travel details.
drop function public.get_profile(uuid);

create function public.get_profile(p_user_id uuid)
returns table (
  id uuid,
  display_name text,
  instagram text,
  avatar_path text,
  photo_paths text[],
  followers integer,
  following integer,
  friends integer,
  tables integer,
  hangouts integer,
  thumbs_up integer,
  thumbs_down integer,
  i_follow boolean,
  follows_me boolean,
  age integer,
  home_country text,
  languages text[],
  profession text,
  travel_style text,
  interests text[],
  world_clocks text[],
  visited_countries text[],
  upcoming_trips integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.display_name,
    p.instagram,
    p.avatar_path,
    p.photo_paths,
    (select count(*)::integer from public.follows f where f.followee_id = p.id),
    (select count(*)::integer from public.follows f where f.follower_id = p.id),
    (select count(*)::integer from public.follows f
     where f.follower_id = p.id and public.are_friends(p.id, f.followee_id)),
    (select count(*)::integer from public.meetup_members mm join public.meetups m on m.id = mm.meetup_id
     where mm.user_id = p.id and m.kind = 'table' and m.status = 'open' and m.ends_at <= now()),
    (select count(*)::integer from public.meetup_members mm join public.meetups m on m.id = mm.meetup_id
     where mm.user_id = p.id and m.kind = 'hangout' and m.status = 'open' and m.ends_at <= now()),
    (select count(*)::integer from public.member_feedback fb where fb.to_id = p.id and fb.vote = 1),
    (select count(*)::integer from public.member_feedback fb where fb.to_id = p.id and fb.vote = -1),
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id),
    exists (select 1 from public.follows f where f.follower_id = p.id and f.followee_id = auth.uid()),
    (select public.age_on(pp.birth_date) from public.profile_private pp where pp.user_id = p.id),
    p.home_country,
    p.languages,
    p.profession,
    p.travel_style,
    p.interests,
    p.world_clocks,
    p.visited_countries,
    (select count(*)::integer from public.trips t
     where t.user_id = p.id and t.ends_on >= (now() at time zone 'Asia/Bangkok')::date)
  from public.profiles p
  where p.id = p_user_id
    and auth.uid() is not null
    and not public.is_blocked_between(auth.uid(), p.id);
$$;

revoke execute on function public.my_profile_details() from public, anon;
revoke execute on function public.save_my_profile(text, text, date, text, text[], text, text, text[]) from public, anon;
revoke execute on function public.set_my_world_clocks(text[]) from public, anon;
revoke execute on function public.set_my_visited_countries(text[]) from public, anon;
revoke execute on function public.save_trip(uuid, text, text, double precision, double precision, date, date, text) from public, anon;
revoke execute on function public.delete_trip(uuid) from public, anon;
revoke execute on function public.user_friends(uuid) from public, anon;
revoke execute on function public.profile_meetups(uuid) from public, anon;
revoke execute on function public.get_profile(uuid) from public, anon;
grant execute on function public.my_profile_details() to authenticated;
grant execute on function public.save_my_profile(text, text, date, text, text[], text, text, text[]) to authenticated;
grant execute on function public.set_my_world_clocks(text[]) to authenticated;
grant execute on function public.set_my_visited_countries(text[]) to authenticated;
grant execute on function public.save_trip(uuid, text, text, double precision, double precision, date, date, text) to authenticated;
grant execute on function public.delete_trip(uuid) to authenticated;
grant execute on function public.user_friends(uuid) to authenticated;
grant execute on function public.profile_meetups(uuid) to authenticated;
grant execute on function public.get_profile(uuid) to authenticated;
