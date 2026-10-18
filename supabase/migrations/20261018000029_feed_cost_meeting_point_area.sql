-- Activity feed: expected cost and meeting point on tables / hangouts, and the Bangkok area each one is in.
--
-- * meetups.cost_level: expected cost per person as a band (0 free, 1 under ฿300, 2 ฿300–700, 3 ฿700–1,500,
--   4 over ฿1,500), null = not given. Budget-friendly in the app = 0 or 1.
-- * meetups.meeting_point: where exactly to meet ("at the main gate"), optional, max 120 characters.
--   Both are set by the host right after creating, with set_meetup_details (the create functions stay as they are).
-- * list_open_meetups also returns the place kind (food / drinks filters), cost, meeting point and the nearest
--   named neighbourhood / subdistrict (public.areas) for "near Ari"-style lines. Only public places are used, never
--   anyone's own location.

alter table public.meetups
  add column cost_level smallint check (cost_level between 0 and 4),
  add column meeting_point text check (meeting_point is null or length(meeting_point) between 1 and 120);

-- Host only, while the table / hangout is open and not over. Errors: auth_required, invalid_cost, not_host, not_found.
create function public.set_meetup_details(p_meetup_id uuid, p_cost_level smallint, p_meeting_point text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_cost_level is not null and p_cost_level not between 0 and 4 then
    raise exception 'invalid_cost';
  end if;
  update public.meetups m
  set cost_level = p_cost_level,
      meeting_point = nullif(left(trim(coalesce(p_meeting_point, '')), 120), '')
  where m.id = p_meetup_id and m.host_id = v_uid and m.status = 'open' and m.ends_at > now();
  if not found then
    if exists (select 1 from public.meetups m where m.id = p_meetup_id) then
      raise exception 'not_host';
    end if;
    raise exception 'not_found';
  end if;
end;
$$;

revoke execute on function public.set_meetup_details(uuid, smallint, text) from public, anon;
grant execute on function public.set_meetup_details(uuid, smallint, text) to authenticated;

-- The nearest named Bangkok neighbourhood (or subdistrict, if one is much closer) within about 3 km.
create function public.area_near(p_lat double precision, p_lng double precision)
returns table (name text, name_en text, name_th text)
language sql
stable
set search_path = ''
as $$
  select a.name, a.name_en, a.name_th
  from public.areas a
  where p_lat is not null and p_lng is not null
    and a.kind in ('neighbourhood', 'subdistrict')
    and a.lat between p_lat - 0.03 and p_lat + 0.03
    and a.lng between p_lng - 0.03 and p_lng + 0.03
  order by ((a.lat - p_lat) ^ 2 + ((a.lng - p_lng) * 0.97) ^ 2) * (case when a.kind = 'neighbourhood' then 1 else 2.25 end)
  limit 1;
$$;

revoke execute on function public.area_near(double precision, double precision) from public, anon;
grant execute on function public.area_near(double precision, double precision) to authenticated;

-- Same as before, plus place kind, cost, meeting point and area.
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
  area_name_th text
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
    a.name, a.name_en, a.name_th
  from public.meetups m
  left join public.venues v on v.id = m.venue_id
  left join public.places p on p.id = m.place_id
  left join lateral public.area_near(coalesce(p.lat, m.spot_lat, v.lat), coalesce(p.lng, m.spot_lng, v.lng)) a on true
  where m.status = 'open' and m.ends_at > now() and (m.venue_id is null or v.is_active)
  order by m.starts_at;
$$;

revoke execute on function public.list_open_meetups() from public, anon;
grant execute on function public.list_open_meetups() to authenticated;
