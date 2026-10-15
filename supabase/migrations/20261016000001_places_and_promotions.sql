-- Google places on the map + promotion types.
--
-- * The app now shows Google's own restaurants/cafes/bars on the map. People can create a table at any of them.
--   Google's terms allow keeping a place ID; the place name and position of a table are kept only for that table.
-- * Partner venues (added by the founder) can be linked to a Google place via google_place_id.
-- * Deals become promotions with a kind: discount and offer use the coupon (unlocked when 3+ people check in);
--   event and party are dated listings without a coupon. A venue has at most one active coupon promotion and any
--   number of events/parties.

create type public.promotion_kind as enum ('discount', 'offer', 'event', 'party');

-- ---------------------------------------------------------------------------
-- Venues: link to a Google place
-- ---------------------------------------------------------------------------

alter table public.venues add column google_place_id text unique;

-- ---------------------------------------------------------------------------
-- Deals → promotions
-- ---------------------------------------------------------------------------

alter table public.deals
  add column kind public.promotion_kind not null default 'discount',
  add column starts_at timestamptz,
  add column ends_at timestamptz;

-- Existing "other" deals (e.g. a free drink) are offers.
update public.deals set kind = 'offer' where discount_type = 'other';

alter table public.deals add constraint deals_kind_fields_valid check (
  (kind = 'discount' and discount_type <> 'other')
  or (kind <> 'discount' and discount_type = 'other' and discount_value is null)
);

alter table public.deals add constraint deals_dates_valid check (
  (kind in ('event', 'party') and starts_at is not null and ends_at is not null and ends_at > starts_at)
  or (kind in ('discount', 'offer') and starts_at is null and ends_at is null)
);

drop index public.deals_one_active_per_venue;
create unique index deals_one_active_coupon_per_venue
on public.deals (venue_id) where is_active and kind in ('discount', 'offer');

-- Replaces admin_save_deal: create or update one promotion (and its coupon code for discount/offer).
drop function public.admin_save_deal(uuid, uuid, text, text, text, text, public.discount_type, numeric, text, boolean);

create function public.admin_save_promotion(
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
  v_has_coupon boolean := p_kind in ('discount', 'offer');
  v_discount_type public.discount_type := case when p_kind = 'discount' then p_discount_type else 'other' end;
  v_discount_value numeric := case when p_kind = 'discount' then p_discount_value else null end;
  v_starts_at timestamptz := case when v_has_coupon then null else p_starts_at end;
  v_ends_at timestamptz := case when v_has_coupon then null else p_ends_at end;
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

revoke execute on function public.admin_save_promotion(uuid, uuid, public.promotion_kind, text, text, text, text, public.discount_type, numeric, text, timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.admin_save_promotion(uuid, uuid, public.promotion_kind, text, text, text, text, public.discount_type, numeric, text, timestamptz, timestamptz, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Tables at any Google place
-- ---------------------------------------------------------------------------

alter table public.meetups
  alter column venue_id drop not null,
  add column google_place_id text,
  add column place_name text check (place_name is null or length(trim(place_name)) between 1 and 120),
  add column place_lat double precision,
  add column place_lng double precision,
  -- A table is either at a partner venue, or at a Google place in Thailand.
  add constraint meetups_place_valid check (
    venue_id is not null
    or (
      google_place_id is not null and place_name is not null
      and place_lat between 5.5 and 20.5 and place_lng between 97.3 and 105.7
    )
  );

-- Shared checks for creating a table. Raises the same error keys the app already translates.
create function public.meetup_check_new(p_starts_at timestamptz, p_max_people integer)
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
    where m.host_id = auth.uid() and m.status = 'open' and m.ends_at > now()
  ) >= 3 then
    raise exception 'too_many_open';
  end if;
end;
$$;

revoke execute on function public.meetup_check_new(timestamptz, integer) from public, anon, authenticated;

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
  if not exists (select 1 from public.venues v where v.id = p_venue_id and v.is_active) then
    raise exception 'venue_unavailable';
  end if;

  insert into public.meetups (venue_id, host_id, title, starts_at, ends_at, max_people)
  values (p_venue_id, auth.uid(), left(coalesce(trim(p_title), ''), 80), p_starts_at, p_starts_at + interval '3 hours', p_max_people)
  returning id into v_id;

  insert into public.meetup_members (meetup_id, user_id) values (v_id, auth.uid());
  return v_id;
end;
$$;

-- Create a table at a Google place. If the founder has linked a live partner venue to that place, the table is
-- created at the venue instead (so its promotions apply).
create function public.create_meetup_at_place(
  p_google_place_id text,
  p_place_name text,
  p_lat double precision,
  p_lng double precision,
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
  select v.id into v_venue_id from public.venues v where v.google_place_id = p_google_place_id and v.is_active;
  if v_venue_id is not null then
    return public.create_meetup(v_venue_id, p_starts_at, p_max_people, p_title);
  end if;

  perform public.meetup_check_new(p_starts_at, p_max_people);
  if length(trim(coalesce(p_google_place_id, ''))) = 0
     or length(trim(coalesce(p_place_name, ''))) = 0
     or p_lat is null or p_lng is null
     or p_lat not between 5.5 and 20.5 or p_lng not between 97.3 and 105.7 then
    raise exception 'venue_unavailable';
  end if;

  insert into public.meetups (
    google_place_id, place_name, place_lat, place_lng, host_id, title, starts_at, ends_at, max_people
  )
  values (
    trim(p_google_place_id), left(trim(p_place_name), 120), p_lat, p_lng, auth.uid(),
    left(coalesce(trim(p_title), ''), 80), p_starts_at, p_starts_at + interval '3 hours', p_max_people
  )
  returning id into v_id;

  insert into public.meetup_members (meetup_id, user_id) values (v_id, auth.uid());
  return v_id;
end;
$$;

revoke execute on function public.create_meetup_at_place(text, text, double precision, double precision, timestamptz, integer, text) from public, anon;
grant execute on function public.create_meetup_at_place(text, text, double precision, double precision, timestamptz, integer, text) to authenticated;

-- Now also returns tables at Google places (venue_id is null; place_* columns set).
drop function public.list_open_meetups();

create function public.list_open_meetups()
returns table (
  id uuid,
  venue_id uuid,
  google_place_id text,
  place_name text,
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
    m.id, m.venue_id, m.google_place_id, m.place_name, m.place_lat, m.place_lng,
    m.host_id, m.title, m.starts_at, m.ends_at, m.max_people,
    (select count(*)::integer from public.meetup_members mm where mm.meetup_id = m.id),
    exists (select 1 from public.meetup_members mm where mm.meetup_id = m.id and mm.user_id = (select auth.uid()))
  from public.meetups m
  left join public.venues v on v.id = m.venue_id
  where m.status = 'open' and m.ends_at > now() and (m.venue_id is null or v.is_active)
  order by m.starts_at;
$$;

revoke execute on function public.list_open_meetups() from public, anon;
grant execute on function public.list_open_meetups() to authenticated;
