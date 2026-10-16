-- Day planner ("Plan my day"): a rule-based plan of places for one day, saved, shared as a message, or turned into a
-- day hangout others can join.
--
-- * places get planner details (seeded by the next migration): Wikidata id, short descriptions, a Wikimedia Commons
--   photo with its credit, OpenStreetMap opening hours, and a prominence score (how well-known a place is).
-- * transit_stations / transit_lines: Bangkok's BTS, MRT, monorail, Airport Rail Link and SRT Red line stations and
--   their order on each line (OpenStreetMap, seeded later), for "by BTS / MRT" travel estimates.
-- * plan_candidates / plan_food_near: places the app's planner picks from.
-- * day_plans: saved plans (owner only), readable by everyone signed in once turned into a hangout.
--   create_plan_hangout(plan, max_people) makes the plan a day hangout at its first stop.

-- ---------------------------------------------------------------------------
-- Planner details on places
-- ---------------------------------------------------------------------------

alter table public.places
  add column wikidata text check (wikidata is null or wikidata ~ '^Q[0-9]+$'),
  add column description_en text check (description_en is null or length(description_en) <= 200),
  add column description_th text check (description_th is null or length(description_th) <= 200),
  add column image_url text check (image_url is null or (image_url ~ '^https://[^\s]+$' and length(image_url) <= 2000)),
  add column image_credit text check (image_credit is null or length(image_credit) <= 200),
  add column image_page text check (image_page is null or (image_page ~ '^https://[^\s]+$' and length(image_page) <= 2000)),
  add column opening_hours text check (opening_hours is null or length(opening_hours) <= 200),
  add column prominence smallint not null default 0 check (prominence between 0 and 30);

-- ---------------------------------------------------------------------------
-- Rail stations and lines
-- ---------------------------------------------------------------------------

create table public.transit_stations (
  id uuid primary key default gen_random_uuid(),
  osm_type text not null check (osm_type in ('node', 'way', 'relation')),
  osm_id bigint not null,
  name text not null check (length(trim(name)) between 1 and 200),
  name_en text,
  name_th text,
  lat double precision not null check (lat between 13.45 and 14.10),
  lng double precision not null check (lng between 100.25 and 100.95),
  unique (osm_type, osm_id)
);

create table public.transit_lines (
  id uuid primary key default gen_random_uuid(),
  osm_id bigint not null unique,
  -- BTS, MRT, ARL (Airport Rail Link), SRT (Red lines), …
  network text not null,
  name_en text not null,
  name_th text,
  colour text check (colour is null or colour ~ '^#[0-9A-Fa-f]{6}$'),
  -- Stations in travel order.
  station_ids uuid[] not null
);

alter table public.transit_stations enable row level security;
alter table public.transit_lines enable row level security;

create policy "Anyone can read stations" on public.transit_stations for select to anon, authenticated using (true);
create policy "Anyone can read lines" on public.transit_lines for select to anon, authenticated using (true);
create policy "Admins manage stations" on public.transit_stations for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins manage lines" on public.transit_lines for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- What the planner picks from
-- ---------------------------------------------------------------------------

-- Hangout places of the chosen kinds within a radius, best-known first. p_entry limits them to entries such as
-- {free} (null = any). Places shown as a partner venue are left out (the app adds venues itself).
create function public.plan_candidates(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer,
  p_kinds text[],
  p_entry text[] default null
)
returns table (
  id uuid,
  name text,
  name_en text,
  name_th text,
  kind text,
  lat double precision,
  lng double precision,
  website text,
  entry text,
  description_en text,
  description_th text,
  image_url text,
  image_credit text,
  opening_hours text,
  prominence smallint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.name, p.name_en, p.name_th, p.kind, p.lat, p.lng, p.website, p.entry, p.description_en,
         p.description_th, p.image_url, p.image_credit, p.opening_hours, p.prominence
  from public.places p
  where p.purpose = 'hangout'
    and p.kind = any (p_kinds)
    and (p_entry is null or p.entry = any (p_entry))
    and extensions.st_dwithin(
      p.location,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
      least(greatest(coalesce(p_radius_m, 3000), 200), 20000)
    )
    and not exists (select 1 from public.venues v where v.place_id = p.id and v.is_active)
  order by p.prominence desc, extensions.st_distance(
    p.location,
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
  )
  limit 200;
$$;

-- Food or drink places nearest a point (meals and nightlife stops), with their distance in metres.
create function public.plan_food_near(
  p_lat double precision,
  p_lng double precision,
  p_kinds text[],
  p_limit integer default 8
)
returns table (
  id uuid,
  name text,
  name_en text,
  name_th text,
  kind text,
  cuisine text,
  lat double precision,
  lng double precision,
  distance_m double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.name, p.name_en, p.name_th, p.kind, p.cuisine, p.lat, p.lng,
         extensions.st_distance(p.location, extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography)
  from public.places p
  where p.purpose = 'food'
    and p.kind = any (p_kinds)
    and extensions.st_dwithin(
      p.location,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
      1500
    )
    and not exists (select 1 from public.venues v where v.place_id = p.id and v.is_active)
  order by (p.cuisine is not null) desc, 9
  limit least(greatest(coalesce(p_limit, 8), 1), 30);
$$;

-- ---------------------------------------------------------------------------
-- Saved day plans
-- ---------------------------------------------------------------------------

create table public.day_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 80),
  day date not null,
  start_minutes integer not null check (start_minutes between 0 and 1439),
  end_minutes integer not null check (end_minutes between 1 and 1440),
  -- One to all three ways of getting around (walk, taxi, transit).
  travel_modes text[] not null check (
    cardinality(travel_modes) between 1 and 3 and travel_modes <@ array['walk', 'taxi', 'transit']
  ),
  -- The stops as planned (name, position, times, photo, travel to the next stop, …), so a shared plan looks the
  -- same for everyone even if place data changes later.
  stops jsonb not null check (jsonb_typeof(stops) = 'array' and jsonb_array_length(stops) between 1 and 12),
  meetup_id uuid unique references public.meetups (id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_minutes > start_minutes)
);

create index day_plans_owner_id_idx on public.day_plans (owner_id);

alter table public.day_plans enable row level security;

create policy "People read their own plans, and plans that became a hangout"
on public.day_plans for select
to authenticated
using (owner_id = (select auth.uid()) or meetup_id is not null);

create policy "People save their own plans"
on public.day_plans for insert
to authenticated
with check (owner_id = (select auth.uid()) and meetup_id is null);

create policy "People change their own plans"
on public.day_plans for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "People delete their own plans"
on public.day_plans for delete
to authenticated
using (owner_id = (select auth.uid()));

-- meetup_id (the plan's hangout) is set only by create_plan_hangout, so nobody can attach a plan to someone else's
-- hangout; owner_id can't be changed either.
revoke update on public.day_plans from anon, authenticated;
grant update (title, day, start_minutes, end_minutes, travel_modes, stops) on public.day_plans to authenticated;

-- The plan becomes a day hangout: at the first stop (its venue, place, or spot), for the plan's day and hours (up to
-- 12 hours), titled after the plan, with the stops listed in the description. Errors are create_hangout's, plus
-- not_found and already_hangout.
create function public.create_plan_hangout(p_plan_id uuid, p_max_people integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.day_plans%rowtype;
  v_first jsonb;
  v_starts timestamptz;
  v_minutes integer;
  v_description text;
  v_id uuid;
begin
  select * into v_plan from public.day_plans d where d.id = p_plan_id and d.owner_id = auth.uid() for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_plan.meetup_id is not null then
    raise exception 'already_hangout';
  end if;

  v_first := v_plan.stops -> 0;
  -- Bangkok is UTC+7 all year.
  v_starts := (v_plan.day::timestamp + make_interval(mins => v_plan.start_minutes)) at time zone 'Asia/Bangkok';
  v_minutes := least(v_plan.end_minutes - v_plan.start_minutes, 720);
  select left(string_agg(
           to_char(make_interval(mins => (s ->> 'arrive')::integer), 'HH24:MI') || ' ' || (s ->> 'name'),
           E'\n' order by ord),
         500)
    into v_description
    from jsonb_array_elements(v_plan.stops) with ordinality as t (s, ord);

  v_id := public.create_hangout(
    p_title => v_plan.title,
    p_description => coalesce(v_description, ''),
    p_starts_at => v_starts,
    p_duration_minutes => v_minutes,
    p_max_people => p_max_people,
    p_venue_id => case when v_first ->> 'venue_id' is not null then (v_first ->> 'venue_id')::uuid end,
    p_place_id => case when v_first ->> 'venue_id' is null and v_first ->> 'place_id' is not null
                       then (v_first ->> 'place_id')::uuid end,
    p_spot_lat => case when v_first ->> 'venue_id' is null and v_first ->> 'place_id' is null
                       then (v_first ->> 'lat')::double precision end,
    p_spot_lng => case when v_first ->> 'venue_id' is null and v_first ->> 'place_id' is null
                       then (v_first ->> 'lng')::double precision end,
    p_spot_name => case when v_first ->> 'venue_id' is null and v_first ->> 'place_id' is null
                        then left(v_first ->> 'name', 80) end
  );
  update public.day_plans set meetup_id = v_id where id = p_plan_id;
  return v_id;
end;
$$;

revoke execute on function public.create_plan_hangout(uuid, integer) from public, anon;
grant execute on function public.create_plan_hangout(uuid, integer) to authenticated;
