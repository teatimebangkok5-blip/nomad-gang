-- Travel deals as a host reward (founder, 2026-10-17). When a table or hangout ends (not cancelled) with at least 4
-- people, its host unlocks travel deals for the city where it happened: coupons and deals the founder adds in the
-- admin panel (activities, hotels, flights, cruises, …) for that city, its country or everywhere. The app also shows
-- "Find deals in {city}" buttons to official deal / search pages (no data needed). No affiliate programs yet; deal
-- links can become affiliate links later.
--
-- * meetups.city / country_code: where it happened. Bangkok for everything in the Bangkok box (set by a trigger);
--   the app sets it for hangouts elsewhere (set_meetup_area, from OpenStreetMap's reverse geocoding).
-- * travel_deals: admins only. Users only see deals through my_rewards(), for meetups they hosted that qualify.
--   City deals match within radius_km of the meetup; country deals by country code; world deals everywhere. Max 8 per
--   meetup, city first.
-- * travel_deal_reports: "Didn't work?" A deal reported by 3 people is hidden until the founder clears the reports;
--   it's hidden at once for the person who reported it.
-- * The bell gets a "reward" notification when a hosted table / hangout qualifies (14 days).

alter table public.meetups
  add column city text check (city is null or length(city) between 1 and 80),
  add column country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$');

update public.meetups m
set city = 'Bangkok', country_code = 'TH'
where m.spot_lat is null or public.in_bangkok(m.spot_lat, m.spot_lng);

-- Tables and hangouts at venues, places or spots in the Bangkok box are in Bangkok.
create function public.meetups_set_bangkok_area()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.city is null and (new.spot_lat is null or public.in_bangkok(new.spot_lat, new.spot_lng)) then
    new.city := 'Bangkok';
    new.country_code := 'TH';
  end if;
  return new;
end;
$$;

create trigger meetups_bangkok_area
before insert on public.meetups
for each row execute function public.meetups_set_bangkok_area();

-- The host names the city / country of a hangout outside Bangkok once (the app looks it up from the pin).
create function public.set_meetup_area(p_meetup_id uuid, p_city text, p_country_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_city text := nullif(left(trim(coalesce(p_city, '')), 80), '');
  v_country text := upper(nullif(trim(coalesce(p_country_code, '')), ''));
begin
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    v_country := null;
  end if;
  update public.meetups m
  set city = v_city, country_code = v_country
  where m.id = p_meetup_id and m.host_id = auth.uid() and m.city is null;
end;
$$;

revoke execute on function public.set_meetup_area(uuid, text, text) from public, anon;
grant execute on function public.set_meetup_area(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Travel deals (admin panel)
-- ---------------------------------------------------------------------------

create table public.travel_deals (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (length(trim(brand)) between 1 and 60),
  category text not null check (category in ('activity', 'hotel', 'flight', 'cruise', 'other')),
  title_en text not null check (length(trim(title_en)) between 1 and 120),
  title_th text not null check (length(trim(title_th)) between 1 and 120),
  details_en text not null default '' check (length(details_en) <= 500),
  details_th text not null default '' check (length(details_th) <= 500),
  code text check (code is null or length(trim(code)) between 1 and 60),
  url text check (url is null or url ~ '^https://\S+$'),
  scope text not null check (scope in ('city', 'country', 'world')),
  city_name text check (city_name is null or length(trim(city_name)) between 1 and 80),
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  radius_km integer not null default 50 check (radius_km between 1 and 500),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint travel_deals_code_or_url check (code is not null or url is not null),
  constraint travel_deals_scope_valid check (
    (scope = 'city' and city_name is not null and lat is not null and lng is not null)
    or (scope = 'country' and country_code is not null)
    or scope = 'world'
  ),
  constraint travel_deals_dates_valid check (starts_at is null or ends_at is null or ends_at > starts_at)
);

alter table public.travel_deals enable row level security;

create policy "Admins manage travel deals"
on public.travel_deals for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create table public.travel_deal_reports (
  deal_id uuid not null references public.travel_deals (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (deal_id, user_id)
);

alter table public.travel_deal_reports enable row level security;

create policy "Admins read and clear deal reports"
on public.travel_deal_reports for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Host rewards
-- ---------------------------------------------------------------------------

-- Tables and hangouts I hosted that ended (not cancelled) with at least 4 people, newest first, each with the deals
-- for where it happened.
create function public.my_rewards()
returns table (
  meetup_id uuid,
  meetup_kind text,
  title text,
  place_name text,
  place_name_en text,
  place_name_th text,
  venue_name_en text,
  venue_name_th text,
  city text,
  country_code text,
  lat double precision,
  lng double precision,
  ended_at timestamptz,
  member_count integer,
  deals json
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select m.id, m.kind, m.title, m.city, m.country_code, m.ends_at,
           coalesce(pl.name, m.spot_name) as place_name, pl.name_en as place_name_en, pl.name_th as place_name_th,
           v.name_en as venue_name_en, v.name_th as venue_name_th,
           coalesce(v.lat, pl.lat, m.spot_lat) as lat, coalesce(v.lng, pl.lng, m.spot_lng) as lng,
           (select count(*)::integer from public.meetup_members x where x.meetup_id = m.id) as member_count
    from public.meetups m
    left join public.venues v on v.id = m.venue_id
    left join public.places pl on pl.id = m.place_id
    where m.host_id = (select auth.uid()) and m.status = 'open' and m.ends_at < now()
  )
  select r.id, r.kind::text, r.title, r.place_name, r.place_name_en, r.place_name_th, r.venue_name_en,
         r.venue_name_th, r.city, r.country_code, r.lat, r.lng, r.ends_at, r.member_count,
         (
           select coalesce(json_agg(d order by d.rank, d.created_at desc), '[]'::json)
           from (
             select td.id, td.brand, td.category, td.title_en, td.title_th, td.details_en, td.details_th, td.code,
                    td.url, td.ends_at, td.scope, td.created_at,
                    case td.scope when 'city' then 0 when 'country' then 1 else 2 end as rank
             from public.travel_deals td
             where td.is_active
               and (td.starts_at is null or td.starts_at <= now())
               and (td.ends_at is null or td.ends_at > now())
               and (select count(*) from public.travel_deal_reports rp where rp.deal_id = td.id) < 3
               and not exists (
                 select 1 from public.travel_deal_reports rp where rp.deal_id = td.id and rp.user_id = (select auth.uid())
               )
               and (
                 td.scope = 'world'
                 or (td.scope = 'country' and td.country_code = r.country_code)
                 or (
                   td.scope = 'city' and r.lat is not null
                   and extensions.st_dwithin(
                     extensions.st_setsrid(extensions.st_makepoint(td.lng, td.lat), 4326)::extensions.geography,
                     extensions.st_setsrid(extensions.st_makepoint(r.lng, r.lat), 4326)::extensions.geography,
                     td.radius_km * 1000)
                 )
               )
             order by rank, td.created_at desc
             limit 8
           ) d
         )
  from mine r
  where r.member_count >= 4
  order by r.ends_at desc
  limit 50;
$$;

-- "Didn't work?" Only hosts who have a reward can report.
create function public.report_travel_deal(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.my_rewards()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  insert into public.travel_deal_reports (deal_id, user_id)
  select td.id, auth.uid() from public.travel_deals td where td.id = p_deal_id
  on conflict do nothing;
end;
$$;

revoke execute on function public.my_rewards() from public, anon;
revoke execute on function public.report_travel_deal(uuid) from public, anon;
grant execute on function public.my_rewards() to authenticated;
grant execute on function public.report_travel_deal(uuid) to authenticated;
revoke execute on function public.meetups_set_bangkok_area() from public, anon, authenticated;

-- The bell: as before, plus host rewards.
create or replace function public.my_notifications(
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
    -- Message requests waiting for me (other messages count on the Messages button instead).
    select * from (
      select distinct on (t.id)
             'dm:' || t.id,
             'dm_request',
             dm.created_at, dm.sender_id, null::uuid, left(dm.body, 140), null::uuid
      from public.direct_threads t
      join public.direct_messages dm on dm.thread_id = t.id
      where (select me.id from me) in (t.user_a, t.user_b)
        and t.status = 'pending' and t.requested_by <> (select me.id from me)
        and dm.sender_id <> (select me.id from me)
        and dm.created_at > now() - interval '14 days'
      order by t.id, dm.created_at desc
    ) dms
    union all
    -- My table / hangout ended with 4+ people: travel deals unlocked (host reward), 14 days.
    select 'reward:' || m.id, 'reward', m.ends_at, null, m.id, null, null
    from public.meetups m
    where m.host_id = (select me.id from me) and m.status = 'open'
      and m.ends_at < now() and m.ends_at > now() - interval '14 days'
      and (select count(*) from public.meetup_members x where x.meetup_id = m.id) >= 4
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
