-- TableMeet is Bangkok-only for now: tables at Google places must be inside the Bangkok area
-- (Bangkok plus the edges of Nonthaburi, Pathum Thani and Samut Prakan). The app also checks that the place is
-- food or drink (restaurant, cafe, bar, noodle shop, …) using Google's place types before offering "Create table".

alter table public.meetups drop constraint meetups_place_valid;
alter table public.meetups add constraint meetups_place_valid check (
  venue_id is not null
  or (
    google_place_id is not null and place_name is not null
    and place_lat between 13.45 and 14.10 and place_lng between 100.25 and 100.95
  )
);

create or replace function public.create_meetup_at_place(
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
     or p_lat not between 13.45 and 14.10 or p_lng not between 100.25 and 100.95 then
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
