-- Replace Google places with OpenStreetMap places (free, no API key, no billing).
--
-- * public.places holds Bangkok's food and drink places from OpenStreetMap (restaurants, cafes, bars, pubs, fast
--   food, food courts, bakeries, ice cream, tea/coffee shops, …). The data is © OpenStreetMap contributors (ODbL);
--   the app shows that credit on the map. It is seeded by the next migration and can be refreshed later.
-- * Tables can be created at any place in this list (they are all Bangkok food places, so the app no longer needs
--   Google to check). Partner venues can be linked to a place (venues.place_id).
-- * The Google columns and the Google-based create_meetup_at_place are removed.

create table public.places (
  id uuid primary key default gen_random_uuid(),
  osm_type text not null check (osm_type in ('node', 'way', 'relation')),
  osm_id bigint not null,
  name text not null check (length(trim(name)) between 1 and 200),
  name_en text,
  name_th text,
  -- OpenStreetMap amenity/shop value: restaurant, cafe, bar, pub, fast_food, food_court, ice_cream, bakery, …
  kind text not null,
  cuisine text,
  lat double precision not null check (lat between 13.45 and 14.10),
  lng double precision not null check (lng between 100.25 and 100.95),
  location extensions.geography (point, 4326) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (osm_type, osm_id)
);

-- Same lat/lng → PostGIS sync as venues.
create trigger places_sync_location
before insert or update of lat, lng on public.places
for each row execute function public.venues_sync_location();

create trigger places_set_updated_at
before update on public.places
for each row execute function public.set_updated_at();

create index places_location_idx on public.places using gist (location);
create index places_name_lower_idx on public.places (lower(name));

alter table public.places enable row level security;

create policy "Anyone can read places"
on public.places for select
to anon, authenticated
using (true);

create policy "Admins manage places"
on public.places for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Venues: link to a place instead of a Google place
-- ---------------------------------------------------------------------------

alter table public.venues drop column google_place_id;
alter table public.venues add column place_id uuid unique references public.places (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Tables at places
-- ---------------------------------------------------------------------------

-- Tables at Google places can't be moved over (there's no Google place list any more).
delete from public.meetups where venue_id is null;

drop function public.create_meetup_at_place(text, text, double precision, double precision, timestamptz, integer, text);
drop function public.list_open_meetups();

alter table public.meetups drop constraint meetups_place_valid;
alter table public.meetups
  drop column google_place_id,
  drop column place_name,
  drop column place_lat,
  drop column place_lng,
  add column place_id uuid references public.places (id) on delete cascade,
  add constraint meetups_place_valid check (venue_id is not null or place_id is not null);

create index meetups_place_id_idx on public.meetups (place_id);

-- Create a table at a place. If a live partner venue is linked to that place, the table is created at the venue
-- (so its promotions apply).
create function public.create_meetup_at_place(
  p_place_id uuid,
  p_starts_at timestamptz,
  p_max_people integer,
  p_title text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venue_id uuid;
  v_id uuid;
begin
  select v.id into v_venue_id from public.venues v where v.place_id = p_place_id and v.is_active;
  if v_venue_id is not null then
    return public.create_meetup(v_venue_id, p_starts_at, p_max_people, p_title);
  end if;

  perform public.meetup_check_new(p_starts_at, p_max_people);
  if not exists (select 1 from public.places p where p.id = p_place_id) then
    raise exception 'venue_unavailable';
  end if;

  insert into public.meetups (place_id, host_id, title, starts_at, ends_at, max_people)
  values (p_place_id, auth.uid(), left(coalesce(trim(p_title), ''), 80), p_starts_at, p_starts_at + interval '3 hours', p_max_people)
  returning id into v_id;

  insert into public.meetup_members (meetup_id, user_id) values (v_id, auth.uid());
  return v_id;
end;
$$;

revoke execute on function public.create_meetup_at_place(uuid, timestamptz, integer, text) from public, anon;
grant execute on function public.create_meetup_at_place(uuid, timestamptz, integer, text) to authenticated;

-- Open tables, with the place's name and position for tables that aren't at a partner venue.
create function public.list_open_meetups()
returns table (
  id uuid,
  venue_id uuid,
  place_id uuid,
  place_name text,
  place_name_en text,
  place_name_th text,
  place_lat double precision,
  place_lng double precision,
  host_id uuid,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  max_people integer,
  member_count integer,
  joined boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.id, m.venue_id, m.place_id, p.name, p.name_en, p.name_th, p.lat, p.lng,
    m.host_id, m.title, m.starts_at, m.ends_at, m.max_people,
    (select count(*)::integer from public.meetup_members mm where mm.meetup_id = m.id),
    exists (select 1 from public.meetup_members mm where mm.meetup_id = m.id and mm.user_id = (select auth.uid()))
  from public.meetups m
  left join public.venues v on v.id = m.venue_id
  left join public.places p on p.id = m.place_id
  where m.status = 'open' and m.ends_at > now() and (m.venue_id is null or v.is_active)
  order by m.starts_at;
$$;

revoke execute on function public.list_open_meetups() from public, anon;
grant execute on function public.list_open_meetups() to authenticated;

-- Places inside the visible map area (for the map's place dots), skipping places that already show as a partner
-- venue. Capped so a zoomed-out map doesn't load thousands of points.
create function public.places_in_bounds(
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision,
  p_limit integer default 400
)
returns table (
  id uuid,
  name text,
  name_en text,
  name_th text,
  kind text,
  lat double precision,
  lng double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.name, p.name_en, p.name_th, p.kind, p.lat, p.lng
  from public.places p
  where p.lat between p_south and p_north
    and p.lng between p_west and p_east
    and not exists (select 1 from public.venues v where v.place_id = p.id and v.is_active)
  limit least(greatest(coalesce(p_limit, 400), 1), 1000);
$$;

-- Name search (admin "Find place", and later in the app).
create function public.search_places(p_query text)
returns table (
  id uuid,
  name text,
  name_en text,
  name_th text,
  kind text,
  lat double precision,
  lng double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.name, p.name_en, p.name_th, p.kind, p.lat, p.lng
  from public.places p
  where length(trim(coalesce(p_query, ''))) >= 2
    and (
      p.name ilike '%' || trim(p_query) || '%'
      or p.name_en ilike '%' || trim(p_query) || '%'
      or p.name_th ilike '%' || trim(p_query) || '%'
    )
  order by position(lower(trim(p_query)) in lower(p.name)), length(p.name)
  limit 20;
$$;
