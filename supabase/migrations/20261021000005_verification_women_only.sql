-- Verified profiles, host badges and women-only tables / hangouts (founder, 2026-10-21).
--
-- * Verification (founder's choice: selfie + ID, approved by hand): people send a selfie and a photo of an ID with
--   their gender (woman / man / other) from the app (submit_verification). Files: private "verifications" bucket at
--   <user id>/<random>.jpg; the owner may add, list and delete their own folder, admins read and delete everything.
--   The founder approves or rejects in the admin panel (admin_verification_requests, admin_decide_verification); the
--   decision returns the two file paths, which the panel deletes at once, so ID photos aren't kept. One waiting
--   request at a time, max 3 a month.
-- * profile_verification (no API access) holds the approved gender. Nobody can read anyone's gender: the app only
--   learns "verified" through user_badges and, for yourself, my_verification.
-- * Badges (user_badges): verified (approved check) and trusted_host (hosted 3+ tables / hangouts that ended with 3+
--   people, and 90%+ 👍 out of at least 3 ratings received).
-- * Women-only tables / hangouts (meetups.women_only): only a verified woman can create one
--   (create_women_only_table / create_women_only_hangout), and only verified women (and admins) can see, join or
--   request to join them: the meetups and members read policies hide them, a trigger refuses other members and join
--   requests, new-meetup notifications skip everyone else, profile event lists hide them. (The bell list is updated in
--   *_second_round.sql.)
--
-- Errors: auth_required, not_allowed, invalid_verification, verification_pending, too_many_requests, not_found,
-- not_verified_woman, women_only.

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------

create table public.profile_verification (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  gender text not null check (gender in ('woman', 'man', 'other')),
  verified_at timestamptz not null default now()
);

alter table public.profile_verification enable row level security;
revoke all on public.profile_verification from anon, authenticated;

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  gender text not null check (gender in ('woman', 'man', 'other')),
  selfie_path text,
  id_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason text check (length(reason) <= 300),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null
);

create unique index verification_requests_one_pending on public.verification_requests (user_id) where status = 'pending';
create index verification_requests_user_idx on public.verification_requests (user_id);

alter table public.verification_requests enable row level security;
revoke all on public.verification_requests from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verifications', 'verifications', false, 8388608, array['image/jpeg'])
on conflict (id) do nothing;

create policy "People list their own verification photos; admins all"
on storage.objects for select
to authenticated
using (
  bucket_id = 'verifications'
  and (split_part(name, '/', 1) = (select auth.uid())::text or (select public.is_admin()))
);

create policy "People upload verification photos to their own folder"
on storage.objects for insert
to authenticated
with check (bucket_id = 'verifications' and split_part(name, '/', 1) = (select auth.uid())::text);

create policy "People delete their own verification photos; admins all"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'verifications'
  and (split_part(name, '/', 1) = (select auth.uid())::text or (select public.is_admin()))
);

create function public.is_verified_woman(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profile_verification v where v.user_id = p_user_id and v.gender = 'woman');
$$;

-- Never callable through the API (it would tell anyone's gender).
revoke execute on function public.is_verified_woman(uuid) from public, anon, authenticated;

-- Whether the caller may see women-only tables / hangouts.
create function public.can_see_women_only()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_verified_woman(auth.uid()) or public.is_admin();
$$;

revoke execute on function public.can_see_women_only() from public, anon;
grant execute on function public.can_see_women_only() to authenticated;

-- Sends a selfie and an ID photo (already uploaded to my folder) for the founder to check.
create function public.submit_verification(p_gender text, p_selfie_path text, p_id_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_gender not in ('woman', 'man', 'other') or p_selfie_path is null or p_id_path is null or p_selfie_path = p_id_path
     or split_part(p_selfie_path, '/', 1) <> v_me::text or split_part(p_id_path, '/', 1) <> v_me::text
     or (select count(*) from storage.objects o
         where o.bucket_id = 'verifications' and o.name in (p_selfie_path, p_id_path)) <> 2 then
    raise exception 'invalid_verification';
  end if;
  if exists (select 1 from public.verification_requests r where r.user_id = v_me and r.status = 'pending') then
    raise exception 'verification_pending';
  end if;
  if (select count(*) from public.verification_requests r
      where r.user_id = v_me and r.created_at > now() - interval '30 days') >= 3 then
    raise exception 'too_many_requests';
  end if;
  insert into public.verification_requests (user_id, gender, selfie_path, id_path)
  values (v_me, p_gender, p_selfie_path, p_id_path);
end;
$$;

revoke execute on function public.submit_verification(text, text, text) from public, anon;
grant execute on function public.submit_verification(text, text, text) to authenticated;

-- My verification: whether I'm verified (and as a woman), and my latest request.
create function public.my_verification()
returns table (
  verified boolean,
  woman boolean,
  verified_at timestamptz,
  status text,
  gender text,
  reason text,
  submitted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.user_id is not null, coalesce(v.gender = 'woman', false), v.verified_at,
         r.status, coalesce(r.gender, v.gender), r.reason, r.created_at
  from (select auth.uid() as id) me
  left join public.profile_verification v on v.user_id = me.id
  left join lateral (
    select * from public.verification_requests x where x.user_id = me.id order by x.created_at desc limit 1
  ) r on true
  where me.id is not null;
$$;

revoke execute on function public.my_verification() from public, anon;
grant execute on function public.my_verification() to authenticated;

-- Admin panel: requests by status ('pending' first in, or the latest decided ones).
create function public.admin_verification_requests(p_status text default 'pending')
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  email text,
  avatar_path text,
  gender text,
  selfie_path text,
  id_path text,
  status text,
  reason text,
  created_at timestamptz,
  decided_at timestamptz,
  verified_gender text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
  select r.id, r.user_id, p.display_name, u.email::text, p.avatar_path, r.gender, r.selfie_path, r.id_path, r.status,
         r.reason, r.created_at, r.decided_at, v.gender
  from public.verification_requests r
  join public.profiles p on p.id = r.user_id
  left join auth.users u on u.id = r.user_id
  left join public.profile_verification v on v.user_id = r.user_id
  where r.status = coalesce(p_status, 'pending')
  order by case when r.status = 'pending' then r.created_at end asc, r.decided_at desc nulls last
  limit 200;
end;
$$;

revoke execute on function public.admin_verification_requests(text) from public, anon;
grant execute on function public.admin_verification_requests(text) to authenticated;

-- Approves (with the gender seen on the ID) or rejects (with a reason the person sees). Returns the two photos for the
-- panel to delete; the request forgets them.
create function public.admin_decide_verification(p_request_id uuid, p_approve boolean, p_gender text, p_reason text)
returns table (selfie_path text, id_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.verification_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into v_request from public.verification_requests r where r.id = p_request_id and r.status = 'pending' for update;
  if not found then
    raise exception 'not_found';
  end if;
  if p_approve and coalesce(p_gender, v_request.gender) not in ('woman', 'man', 'other') then
    raise exception 'invalid_verification';
  end if;
  update public.verification_requests r
  set status = case when p_approve then 'approved' else 'rejected' end,
      gender = case when p_approve then coalesce(p_gender, r.gender) else r.gender end,
      reason = case when p_approve then null else left(trim(coalesce(p_reason, '')), 300) end,
      decided_at = now(), decided_by = auth.uid(), selfie_path = null, id_path = null
  where r.id = p_request_id;
  if p_approve then
    insert into public.profile_verification (user_id, gender, verified_at)
    values (v_request.user_id, coalesce(p_gender, v_request.gender), now())
    on conflict (user_id) do update set gender = excluded.gender, verified_at = excluded.verified_at;
  end if;
  return query select v_request.selfie_path, v_request.id_path;
end;
$$;

revoke execute on function public.admin_decide_verification(uuid, boolean, text, text) from public, anon;
grant execute on function public.admin_decide_verification(uuid, boolean, text, text) to authenticated;

-- Takes a verification away (e.g. after a report).
create function public.admin_revoke_verification(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from public.profile_verification where user_id = p_user_id;
end;
$$;

revoke execute on function public.admin_revoke_verification(uuid) from public, anon;
grant execute on function public.admin_revoke_verification(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Badges
-- ---------------------------------------------------------------------------

create function public.user_badges(p_user_ids uuid[])
returns table (user_id uuid, verified boolean, trusted_host boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         exists (select 1 from public.profile_verification v where v.user_id = p.id),
         (select count(*) from public.meetups m
          where m.host_id = p.id and m.status = 'open' and m.ends_at < now()
            and (select count(*) from public.meetup_members mm where mm.meetup_id = m.id) >= 3) >= 3
         and coalesce((select (count(*) filter (where f.vote = 1))::numeric / nullif(count(*), 0)
                       from public.member_feedback f where f.to_id = p.id having count(*) >= 3), 0) >= 0.9
  from public.profiles p
  where (select auth.uid()) is not null
    and p.id = any ((coalesce(p_user_ids, '{}'::uuid[]))[1:300])
    and not public.is_blocked_between((select auth.uid()), p.id);
$$;

revoke execute on function public.user_badges(uuid[]) from public, anon;
grant execute on function public.user_badges(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Women-only tables / hangouts
-- ---------------------------------------------------------------------------

alter table public.meetups add column women_only boolean not null default false;

-- Set only by the create_women_only_* functions below (a setting inside their own transaction), and only for a host
-- who is a verified woman.
create function public.meetups_women_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.women_only := coalesce(current_setting('tablemeet.women_only', true), '') = 'on';
  if new.women_only and not public.is_verified_woman(new.host_id) then
    raise exception 'not_verified_woman';
  end if;
  return new;
end;
$$;

create trigger meetups_women_only
before insert on public.meetups
for each row execute function public.meetups_women_only();

-- Keeps the flag from changing later.
create function public.meetups_keep_women_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.women_only := old.women_only;
  return new;
end;
$$;

create trigger meetups_keep_women_only
before update on public.meetups
for each row execute function public.meetups_keep_women_only();

create function public.create_women_only_table(
  p_venue_id uuid,
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
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if not public.is_verified_woman(auth.uid()) then
    raise exception 'not_verified_woman';
  end if;
  perform set_config('tablemeet.women_only', 'on', true);
  if p_venue_id is not null then
    v_id := public.create_meetup(p_venue_id, p_starts_at, p_max_people, coalesce(p_title, ''));
  else
    v_id := public.create_meetup_at_place(p_place_id, p_starts_at, p_max_people, coalesce(p_title, ''));
  end if;
  perform set_config('tablemeet.women_only', 'off', true);
  return v_id;
end;
$$;

revoke execute on function public.create_women_only_table(uuid, uuid, timestamptz, integer, text) from public, anon;
grant execute on function public.create_women_only_table(uuid, uuid, timestamptz, integer, text) to authenticated;

create function public.create_women_only_hangout(
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
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if not public.is_verified_woman(auth.uid()) then
    raise exception 'not_verified_woman';
  end if;
  perform set_config('tablemeet.women_only', 'on', true);
  v_id := public.create_hangout(
    p_title, p_description, p_starts_at, p_duration_minutes, p_max_people,
    p_venue_id, p_place_id, p_spot_lat, p_spot_lng, p_spot_name, p_time_zone
  );
  perform set_config('tablemeet.women_only', 'off', true);
  return v_id;
end;
$$;

revoke execute on function public.create_women_only_hangout(text, text, timestamptz, integer, integer, uuid, uuid, double precision, double precision, text, text) from public, anon;
grant execute on function public.create_women_only_hangout(text, text, timestamptz, integer, integer, uuid, uuid, double precision, double precision, text, text) to authenticated;

-- Only verified women (and admins) see women-only ones, their members and (through them) everything else.
drop policy "Signed-in users can read meetups" on public.meetups;
create policy "Signed-in users can read meetups"
on public.meetups for select
to authenticated
using (not women_only or (select public.can_see_women_only()));

drop policy "Signed-in users can read meetup members" on public.meetup_members;
create policy "Signed-in users can read meetup members"
on public.meetup_members for select
to authenticated
using (exists (select 1 from public.meetups m where m.id = meetup_id));

-- Nobody else joins or asks to join (whichever function adds them).
create function public.meetup_members_women_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.meetups m where m.id = new.meetup_id and m.women_only)
     and not public.is_verified_woman(new.user_id) then
    raise exception 'women_only';
  end if;
  return new;
end;
$$;

create trigger meetup_members_women_only
before insert on public.meetup_members
for each row execute function public.meetup_members_women_only();

create trigger meetup_join_requests_women_only
before insert on public.meetup_join_requests
for each row execute function public.meetup_members_women_only();

-- New-meetup notifications: women-only ones only to verified women.
create or replace function public.push_on_new_meetup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lat double precision;
  v_lng double precision;
  v_active boolean := true;
  v_when text;
  v_host text;
  r record;
begin
  begin
    if new.status <> 'open' then
      return null;
    end if;
    if new.venue_id is not null then
      select v.lat, v.lng, v.is_active into v_lat, v_lng, v_active from public.venues v where v.id = new.venue_id;
    elsif new.place_id is not null then
      select pl.lat, pl.lng into v_lat, v_lng from public.places pl where pl.id = new.place_id;
    else
      v_lat := new.spot_lat;
      v_lng := new.spot_lng;
    end if;
    if v_lat is null or v_lng is null or not coalesce(v_active, false) then
      return null;
    end if;
    v_when := to_char(new.starts_at at time zone coalesce(new.time_zone, 'Asia/Bangkok'), 'DD/MM HH24:MI');
    select p.display_name into v_host from public.profiles p where p.id = new.host_id;

    for r in
      select distinct d.user_id from public.push_devices d
      where d.user_id <> new.host_id and d.area_lat is not null
        and extensions.st_dwithin(
              extensions.st_setsrid(extensions.st_makepoint(d.area_lng, d.area_lat), 4326)::extensions.geography,
              extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography,
              20000)
        and not public.is_blocked_between(d.user_id, new.host_id)
        and (not new.women_only or public.is_verified_woman(d.user_id))
    loop
      perform public.push_send(
        r.user_id, 'nearby',
        case when new.kind = 'hangout' then 'New hangout near you' else 'New table near you' end,
        v_host || ' created "' || public.push_meetup_label(new.id, 'en') || '" · ' || v_when,
        case when new.kind = 'hangout' then 'แฮงเอาท์ใหม่ใกล้คุณ' else 'โต๊ะใหม่ใกล้คุณ' end,
        v_host || ' สร้าง "' || public.push_meetup_label(new.id, 'th') || '" · ' || v_when,
        '/table/' || new.id
      );
    end loop;
  exception when others then
    raise warning 'push_on_new_meetup failed: %', sqlerrm;
  end;
  return null;
end;
$$;

-- Someone's events on their profile: women-only ones only for those who may see them.
create or replace function public.profile_meetups(p_user_id uuid)
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
    and (not m.women_only or public.can_see_women_only())
  order by m.starts_at desc
  limit 60;
$$;

-- ---------------------------------------------------------------------------
-- The open list, now with women_only
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
  pitstop boolean,
  women_only boolean
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
    m.pitstop,
    m.women_only
  from public.meetups m
  left join public.venues v on v.id = m.venue_id
  left join public.places p on p.id = m.place_id
  left join lateral public.area_near(coalesce(p.lat, m.spot_lat, v.lat), coalesce(p.lng, m.spot_lng, v.lng)) a on true
  where m.status = 'open' and m.ends_at > now() and (m.venue_id is null or v.is_active)
  order by m.starts_at;
$$;
revoke execute on function public.list_open_meetups() from public, anon;
grant execute on function public.list_open_meetups() to authenticated;
