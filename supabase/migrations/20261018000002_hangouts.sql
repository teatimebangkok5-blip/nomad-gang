-- Hangouts: groups that meet to do something together (a park walk, a market, a museum, an event), anywhere in
-- Bangkok. They are meetups with kind = 'hangout', so joining, leaving, cancelling, the group chat and live updates
-- work exactly like tables.
--
-- * Where: a partner venue, a place from public.places (food or hangout place), or any spot on the map (a pin with
--   a name the host types, inside the Bangkok box).
-- * Rules: title required, optional description (500 chars), starts within 14 days, lasts 30 min to 12 hours,
--   2–30 people, max 3 open hangouts hosted per person (separate from the 3-table limit). Same caller rules as tables.
-- * Places get a purpose: 'food' (tables) or 'hangout' (attractions, parks, malls, temples, markets, museums, …,
--   seeded by the next migration). Tables can only be at food places and food/drink venues.
-- * Promotions: 'ticket' (entry-ticket discount with a coupon code) and 'free_entry' (no coupon) can be ongoing or
--   limited to dates. Unlike the 3+ check-in rule for discount/offer, a ticket discount can be used by any member
--   of a hangout at that venue (the founder's decision). Enforce that when QR redemption is built.

-- ---------------------------------------------------------------------------
-- Places: food or hangout
-- ---------------------------------------------------------------------------

alter table public.places
  add column purpose text not null default 'food' check (purpose in ('food', 'hangout'));

create index places_purpose_idx on public.places (purpose);

drop function public.places_in_bounds(double precision, double precision, double precision, double precision, integer);

-- Places inside the visible map area of one purpose (food map or hangout map), skipping places that already show as
-- a partner venue. Capped so a zoomed-out map doesn't load thousands of points.
create function public.places_in_bounds(
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision,
  p_limit integer default 400,
  p_purpose text default 'food'
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
  where p.purpose = coalesce(p_purpose, 'food')
    and p.lat between p_south and p_north
    and p.lng between p_west and p_east
    and not exists (select 1 from public.venues v where v.place_id = p.id and v.is_active)
  limit least(greatest(coalesce(p_limit, 400), 1), 1000);
$$;

drop function public.search_places(text);

-- Name search (admin "Find the place on the map"): food and hangout places.
create function public.search_places(p_query text)
returns table (
  id uuid,
  name text,
  name_en text,
  name_th text,
  kind text,
  purpose text,
  lat double precision,
  lng double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.name, p.name_en, p.name_th, p.kind, p.purpose, p.lat, p.lng
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

-- ---------------------------------------------------------------------------
-- Meetups: tables and hangouts
-- ---------------------------------------------------------------------------

create type public.meetup_kind as enum ('table', 'hangout');

alter table public.meetups
  add column kind public.meetup_kind not null default 'table',
  add column description text not null default '' check (length(description) <= 500),
  -- A spot anywhere on the map (hangouts only): the pin and the name the host gave it.
  add column spot_name text,
  add column spot_lat double precision,
  add column spot_lng double precision;

alter table public.meetups drop constraint meetups_max_people_check;
alter table public.meetups add constraint meetups_size_valid check (
  (kind = 'table' and max_people between 3 and 12)
  or (kind = 'hangout' and max_people between 2 and 30)
);

alter table public.meetups add constraint meetups_hangout_title check (kind = 'table' or length(trim(title)) >= 1);

alter table public.meetups add constraint meetups_spot_valid check (
  (spot_name is null and spot_lat is null and spot_lng is null)
  or (
    kind = 'hangout'
    and length(trim(spot_name)) between 1 and 80
    and spot_lat between 13.45 and 14.10
    and spot_lng between 100.25 and 100.95
  )
);

alter table public.meetups drop constraint meetups_place_valid;
alter table public.meetups add constraint meetups_place_valid check (num_nonnulls(venue_id, place_id, spot_lat) = 1);

-- The 3-open-tables limit counts tables only (hangouts have their own limit in create_hangout).
create or replace function public.meetup_check_new(p_starts_at timestamptz, p_max_people integer)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if not public.meetup_caller_allowed() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_starts_at is null
     or p_starts_at < now() - interval '15 minutes'
     or p_starts_at > now() + interval '7 days' then
    raise exception 'invalid_time';
  end if;
  if p_max_people is null or p_max_people not between 3 and 12 then
    raise exception 'invalid_size';
  end if;
  if (
    select count(*) from public.meetups m
    where m.host_id = auth.uid() and m.kind = 'table' and m.status = 'open' and m.ends_at > now()
  ) >= 3 then
    raise exception 'too_many_open';
  end if;
end;
$$;

-- Tables only at food and drink venues (not at hangout venues such as parks or museums).
create or replace function public.create_meetup(
  p_venue_id uuid,
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
  v_id uuid;
begin
  perform public.meetup_check_new(p_starts_at, p_max_people);
  if not exists (
    select 1 from public.venues v
    where v.id = p_venue_id and v.is_active and v.category::text in ('cafe', 'restaurant', 'rooftop', 'bar')
  ) then
    raise exception 'venue_unavailable';
  end if;

  insert into public.meetups (venue_id, host_id, title, starts_at, ends_at, max_people)
  values (p_venue_id, auth.uid(), left(coalesce(trim(p_title), ''), 80), p_starts_at, p_starts_at + interval '3 hours', p_max_people)
  returning id into v_id;

  insert into public.meetup_members (meetup_id, user_id) values (v_id, auth.uid());
  return v_id;
end;
$$;

-- Tables only at food places.
create or replace function public.create_meetup_at_place(
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
  if not exists (select 1 from public.places p where p.id = p_place_id and p.purpose = 'food') then
    raise exception 'venue_unavailable';
  end if;

  insert into public.meetups (place_id, host_id, title, starts_at, ends_at, max_people)
  values (p_place_id, auth.uid(), left(coalesce(trim(p_title), ''), 80), p_starts_at, p_starts_at + interval '3 hours', p_max_people)
  returning id into v_id;

  insert into public.meetup_members (meetup_id, user_id) values (v_id, auth.uid());
  return v_id;
end;
$$;

-- Create a hangout. Give exactly one of: p_venue_id, p_place_id, or p_spot_lat + p_spot_lng + p_spot_name.
-- A place linked to a live partner venue becomes a hangout at that venue (so its promotions apply).
-- Extra error keys: invalid_duration, title_required, invalid_place, outside_bangkok, spot_name_required.
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
  p_spot_name text default null
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
    if p_spot_lng is null or p_spot_lat not between 13.45 and 14.10 or p_spot_lng not between 100.25 and 100.95 then
      raise exception 'outside_bangkok';
    end if;
    if length(trim(coalesce(p_spot_name, ''))) = 0 then
      raise exception 'spot_name_required';
    end if;
  end if;

  insert into public.meetups (
    kind, venue_id, place_id, spot_name, spot_lat, spot_lng,
    host_id, title, description, starts_at, ends_at, max_people
  )
  values (
    'hangout', v_venue_id, v_place_id,
    case when p_spot_lat is not null then left(trim(p_spot_name), 80) end,
    p_spot_lat,
    case when p_spot_lat is not null then p_spot_lng end,
    v_uid, v_title, left(trim(coalesce(p_description, '')), 500),
    p_starts_at, p_starts_at + make_interval(mins => p_duration_minutes), p_max_people
  )
  returning id into v_id;

  insert into public.meetup_members (meetup_id, user_id) values (v_id, v_uid);
  return v_id;
end;
$$;

revoke execute on function public.create_hangout(text, text, timestamptz, integer, integer, uuid, uuid, double precision, double precision, text) from public, anon;
grant execute on function public.create_hangout(text, text, timestamptz, integer, integer, uuid, uuid, double precision, double precision, text) to authenticated;

-- Open tables and hangouts. For a hangout at a spot, place_name/lat/lng are the spot's name and pin.
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
  joined boolean
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
    exists (select 1 from public.meetup_members mm where mm.meetup_id = m.id and mm.user_id = (select auth.uid()))
  from public.meetups m
  left join public.venues v on v.id = m.venue_id
  left join public.places p on p.id = m.place_id
  where m.status = 'open' and m.ends_at > now() and (m.venue_id is null or v.is_active)
  order by m.starts_at;
$$;

revoke execute on function public.list_open_meetups() from public, anon;
grant execute on function public.list_open_meetups() to authenticated;

-- ---------------------------------------------------------------------------
-- Promotions: ticket discounts and free entry
-- ---------------------------------------------------------------------------
-- (Compared as text: the new enum values were added in the previous migration.)

alter table public.deals drop constraint deals_kind_fields_valid;
alter table public.deals add constraint deals_kind_fields_valid check (
  (kind::text in ('discount', 'ticket') and discount_type <> 'other')
  or (kind::text not in ('discount', 'ticket') and discount_type = 'other' and discount_value is null)
);

alter table public.deals drop constraint deals_dates_valid;
alter table public.deals add constraint deals_dates_valid check (
  (kind::text in ('event', 'party') and starts_at is not null and ends_at is not null and ends_at > starts_at)
  or (kind::text in ('discount', 'offer') and starts_at is null and ends_at is null)
  or (
    kind::text in ('ticket', 'free_entry')
    and (
      (starts_at is null and ends_at is null)
      or (starts_at is not null and ends_at is not null and ends_at > starts_at)
    )
  )
);

-- Same signature as before. Coupon code for discount, offer and ticket; discount amount for discount and ticket;
-- dates required for event/party, optional for ticket/free_entry, none for discount/offer.
create or replace function public.admin_save_promotion(
  p_venue_id uuid,
  p_promotion_id uuid,
  p_kind public.promotion_kind,
  p_title_en text,
  p_title_th text,
  p_details_en text,
  p_details_th text,
  p_discount_type public.discount_type,
  p_discount_value numeric,
  p_coupon_code text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_is_active boolean
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_kind text := p_kind::text;
  v_has_coupon boolean := v_kind in ('discount', 'offer', 'ticket');
  v_has_discount boolean := v_kind in ('discount', 'ticket');
  v_discount_type public.discount_type := case when v_has_discount then p_discount_type else 'other' end;
  v_discount_value numeric := case when v_has_discount then p_discount_value else null end;
  v_starts_at timestamptz := case when v_kind in ('discount', 'offer') then null else p_starts_at end;
  v_ends_at timestamptz := case when v_kind in ('discount', 'offer') then null else p_ends_at end;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_has_coupon and length(trim(coalesce(p_coupon_code, ''))) = 0 then
    raise exception 'coupon code required' using errcode = '22023';
  end if;

  if p_promotion_id is null then
    insert into public.deals (
      venue_id, kind, title_en, title_th, details_en, details_th,
      discount_type, discount_value, starts_at, ends_at, is_active
    )
    values (
      p_venue_id, p_kind, p_title_en, p_title_th, p_details_en, p_details_th,
      v_discount_type, v_discount_value, v_starts_at, v_ends_at, p_is_active
    )
    returning id into v_id;
  else
    update public.deals
    set kind = p_kind,
        title_en = p_title_en,
        title_th = p_title_th,
        details_en = p_details_en,
        details_th = p_details_th,
        discount_type = v_discount_type,
        discount_value = v_discount_value,
        starts_at = v_starts_at,
        ends_at = v_ends_at,
        is_active = p_is_active
    where id = p_promotion_id and venue_id = p_venue_id
    returning id into v_id;
    if v_id is null then
      raise exception 'promotion not found' using errcode = 'P0002';
    end if;
  end if;

  if v_has_coupon then
    insert into public.deal_coupons (deal_id, coupon_code)
    values (v_id, trim(p_coupon_code))
    on conflict (deal_id) do update set coupon_code = excluded.coupon_code;
  else
    delete from public.deal_coupons where deal_id = v_id;
  end if;

  return v_id;
end;
$$;
