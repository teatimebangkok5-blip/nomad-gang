-- Story likes and Levels (founder, 2026-10-20).
--
-- Story likes
-- * story_likes: one ♥ per person per story. Only people who can see the story can like it (story_visible: live,
--   no block, not reported by me, and for a friends-only story only friends), never your own story.
-- * The poster sees how many people liked each of their stories and who (story_likers); others only see whether
--   they liked it themselves. Likers across a block are left out.
--
-- Levels (free for everyone; the reward for reaching level 15 is TableMeet Plus and the travel deals)
-- * Every level takes 100 points: level = 1 + points / 100.
-- * 20 points for a table / hangout once 4 or more members have checked in at it (GPS check-in), for every
--   checked-in member, or once the founder approves its completion code. At most 2 tables / hangouts count per person
--   per local day, so nobody can farm points by opening many tables at the same spot.
-- * 20 points per challenge. Each level has its own challenges (level_challenges); they count what you do after
--   reaching that level (level 1: since you joined), so every level needs new activity. Challenges of earlier levels
--   that aren't done yet stay open. Challenges are checked on the server (level_sync, run by my_level and my_plus),
--   and every award is a row in level_points with a unique key, so nothing can be counted twice.
-- * Level 15 or higher = TableMeet Plus (has_plus), so also no ads, plus every active travel deal (level_deals).
-- * Stories, likes, friendships and feedback are recorded in level_activity when they happen, because stories and
--   likes are deleted later and someone could unfollow / follow again to count a friend twice.

-- ---------------------------------------------------------------------------
-- Story likes
-- ---------------------------------------------------------------------------

-- A random id as the primary key: Realtime sends delete events (old primary key only) to every subscriber without
-- RLS, so (story, person) must not be the key or anyone could see who unliked what.
create table public.story_likes (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (story_id, user_id)
);

create index story_likes_user_id_idx on public.story_likes (user_id);

alter table public.story_likes enable row level security;
revoke insert, update, delete on public.story_likes from anon, authenticated;

-- Read for Realtime: my own likes, and the likes on my stories (not across a block). Writes only through like_story.
create policy "People see their likes and the likes on their stories"
on public.story_likes for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.stories s
    where s.id = story_likes.story_id and s.user_id = (select auth.uid())
      and not public.is_blocked_between(s.user_id, story_likes.user_id)
  )
  or (select public.is_admin())
);

-- Like (p_like true) or unlike a story. Errors: auth_required, not_allowed, not_found (gone or not visible to me),
-- own_story.
create function public.like_story(p_story_id uuid, p_like boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if not coalesce(p_like, true) then
    delete from public.story_likes l where l.story_id = p_story_id and l.user_id = v_uid;
    return;
  end if;
  select s.user_id into v_owner from public.stories s where s.id = p_story_id;
  if v_owner is null or not public.story_visible(p_story_id) then
    raise exception 'not_found';
  end if;
  if v_owner = v_uid then
    raise exception 'own_story';
  end if;
  if not public.meetup_caller_allowed() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  insert into public.story_likes (story_id, user_id) values (p_story_id, v_uid) on conflict do nothing;
end;
$$;

revoke execute on function public.like_story(uuid, boolean) from public, anon;
grant execute on function public.like_story(uuid, boolean) to authenticated;

-- Who liked my story, newest first (the poster or the founder only). Errors: auth_required, not_owner.
create function public.story_likers(p_story_id uuid)
returns table (user_id uuid, display_name text, avatar_path text, liked_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.stories s where s.id = p_story_id and (s.user_id = auth.uid() or public.is_admin())
  ) then
    raise exception 'not_owner';
  end if;
  return query
  select l.user_id, p.display_name, p.avatar_path, l.created_at
  from public.story_likes l
  join public.stories s on s.id = l.story_id
  join public.profiles p on p.id = l.user_id
  where l.story_id = p_story_id and not public.is_blocked_between(s.user_id, l.user_id)
  order by l.created_at desc
  limit 500;
end;
$$;

revoke execute on function public.story_likers(uuid) from public, anon;
grant execute on function public.story_likers(uuid) to authenticated;

-- As before, plus `liked` (I liked it) and `like_count` (only on my own stories; null on other people's).
drop function public.map_stories();

create function public.map_stories()
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  avatar_path text,
  photo_path text,
  caption text,
  lat double precision,
  lng double precision,
  area_name_en text,
  area_name_th text,
  created_at timestamptz,
  expires_at timestamptz,
  audience text,
  liked boolean,
  like_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.user_id, p.display_name, p.avatar_path, s.photo_path, s.caption, s.lat, s.lng,
         coalesce(s.area_name_en, s.area_name), coalesce(s.area_name_th, s.area_name), s.created_at, s.expires_at,
         s.audience,
         exists (select 1 from public.story_likes l where l.story_id = s.id and l.user_id = (select auth.uid())),
         case when s.user_id = (select auth.uid()) then (
           select count(*)::integer from public.story_likes l
           where l.story_id = s.id and not public.is_blocked_between(s.user_id, l.user_id)
         ) end
  from public.stories s
  join public.profiles p on p.id = s.user_id
  where public.story_visible(s.id)
  order by s.created_at desc
  limit 500;
$$;

revoke execute on function public.map_stories() from public, anon;
grant execute on function public.map_stories() to authenticated;

alter publication supabase_realtime add table public.story_likes;

-- ---------------------------------------------------------------------------
-- Levels: tables
-- ---------------------------------------------------------------------------

-- Every award, once: source 'meetup' (ref = meetup id) or 'challenge' (ref = challenge id).
create table public.level_points (
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null check (source in ('meetup', 'challenge')),
  ref text not null check (length(ref) between 1 and 80),
  points integer not null check (points between 1 and 100),
  created_at timestamptz not null default now(),
  -- The meetup as a real id, for joins that can use the meetups index.
  meetup_id uuid generated always as (case when source = 'meetup' then ref::uuid end) stored,
  primary key (user_id, source, ref),
  check (source <> 'meetup' or ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);

alter table public.level_points enable row level security;
revoke insert, update, delete on public.level_points from anon, authenticated;

create policy "People read their own points; admins read all"
on public.level_points for select
to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

-- When each level (2 and up) was reached. Level 1 starts when the profile was created.
create table public.level_reached (
  user_id uuid not null references public.profiles (id) on delete cascade,
  level integer not null check (level >= 2),
  reached_at timestamptz not null default now(),
  primary key (user_id, level)
);

alter table public.level_reached enable row level security;
revoke insert, update, delete on public.level_reached from anon, authenticated;

create policy "People read their own levels; admins read all"
on public.level_reached for select
to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Things that count for challenges, recorded when they happen (no API access).
create table public.level_activity (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('story', 'like_given', 'like_received', 'friend', 'feedback')),
  ref text not null check (length(ref) between 1 and 120),
  created_at timestamptz not null default now(),
  primary key (user_id, kind, ref)
);

create index level_activity_user_kind_idx on public.level_activity (user_id, kind, created_at);

alter table public.level_activity enable row level security;
revoke all on public.level_activity from anon, authenticated;

-- The challenges of each level. `kind` says what is counted (the app has the wording for each kind), `target` how
-- many. Profile kinds (profile_photo, about, instagram, trip, favorite) look at the profile as it is now; the others
-- count what happened since the level was reached.
create table public.level_challenges (
  id text primary key check (id ~ '^[a-z0-9_-]{1,40}$'),
  level integer not null check (level between 1 and 100),
  kind text not null check (kind in (
    'profile_photo', 'about', 'instagram', 'trip', 'favorite',
    'story', 'like_given', 'like_received', 'friend', 'feedback',
    'checkin', 'join_table', 'join_hangout', 'host_meetup'
  )),
  target integer not null check (target between 1 and 100),
  sort integer not null default 0,
  unique (level, kind)
);

alter table public.level_challenges enable row level security;

create policy "Signed-in users read the challenges"
on public.level_challenges for select
to authenticated
using (true);

create policy "Admins manage the challenges"
on public.level_challenges for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

insert into public.level_challenges (id, level, kind, target, sort) values
  ('l1-photo', 1, 'profile_photo', 1, 1), ('l1-about', 1, 'about', 1, 2), ('l1-story', 1, 'story', 1, 3),
  ('l2-checkin', 2, 'checkin', 1, 1), ('l2-friend', 2, 'friend', 1, 2), ('l2-instagram', 2, 'instagram', 1, 3),
  ('l3-table', 3, 'join_table', 1, 1), ('l3-feedback', 3, 'feedback', 2, 2), ('l3-like', 3, 'like_given', 3, 3),
  ('l4-hangout', 4, 'join_hangout', 1, 1), ('l4-trip', 4, 'trip', 1, 2), ('l4-story', 4, 'story', 2, 3),
  ('l5-host', 5, 'host_meetup', 1, 1), ('l5-friend', 5, 'friend', 2, 2), ('l5-favorite', 5, 'favorite', 3, 3),
  ('l6-checkin', 6, 'checkin', 2, 1), ('l6-feedback', 6, 'feedback', 3, 2), ('l6-liked', 6, 'like_received', 3, 3),
  ('l7-table', 7, 'join_table', 2, 1), ('l7-story', 7, 'story', 3, 2), ('l7-like', 7, 'like_given', 5, 3),
  ('l8-hangout', 8, 'join_hangout', 2, 1), ('l8-friend', 8, 'friend', 3, 2), ('l8-feedback', 8, 'feedback', 4, 3),
  ('l9-host', 9, 'host_meetup', 1, 1), ('l9-checkin', 9, 'checkin', 3, 2), ('l9-liked', 9, 'like_received', 5, 3),
  ('l10-table', 10, 'join_table', 3, 1), ('l10-hangout', 10, 'join_hangout', 2, 2), ('l10-story', 10, 'story', 5, 3),
  ('l11-host', 11, 'host_meetup', 2, 1), ('l11-friend', 11, 'friend', 4, 2), ('l11-liked', 11, 'like_received', 8, 3),
  ('l12-checkin', 12, 'checkin', 4, 1), ('l12-feedback', 12, 'feedback', 6, 2), ('l12-like', 12, 'like_given', 10, 3),
  ('l13-table', 13, 'join_table', 3, 1), ('l13-hangout', 13, 'join_hangout', 3, 2), ('l13-friend', 13, 'friend', 5, 3),
  ('l14-host', 14, 'host_meetup', 2, 1), ('l14-checkin', 14, 'checkin', 5, 2), ('l14-liked', 14, 'like_received', 10, 3),
  ('l15-host', 15, 'host_meetup', 3, 1), ('l15-checkin', 15, 'checkin', 6, 2), ('l15-story', 15, 'story', 7, 3),
  ('l16-table', 16, 'join_table', 4, 1), ('l16-feedback', 16, 'feedback', 8, 2), ('l16-friend', 16, 'friend', 5, 3),
  ('l17-hangout', 17, 'join_hangout', 4, 1), ('l17-host', 17, 'host_meetup', 3, 2), ('l17-liked', 17, 'like_received', 12, 3),
  ('l18-checkin', 18, 'checkin', 7, 1), ('l18-story', 18, 'story', 8, 2), ('l18-like', 18, 'like_given', 15, 3),
  ('l19-host', 19, 'host_meetup', 4, 1), ('l19-table', 19, 'join_table', 5, 2), ('l19-friend', 19, 'friend', 6, 3),
  ('l20-checkin', 20, 'checkin', 8, 1), ('l20-hangout', 20, 'join_hangout', 5, 2), ('l20-liked', 20, 'like_received', 15, 3);

-- ---------------------------------------------------------------------------
-- Levels: working out points and levels (no API access)
-- ---------------------------------------------------------------------------

create function public.level_for_points(p_points integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select 1 + greatest(coalesce(p_points, 0), 0) / 100;
$$;

create function public.user_points(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(lp.points), 0)::integer from public.level_points lp where lp.user_id = p_user;
$$;

create function public.user_level(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select public.level_for_points(public.user_points(p_user));
$$;

-- When a level started for someone (null if they haven't reached it).
create function public.level_since(p_user uuid, p_level integer)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_level <= 1 then (select p.created_at from public.profiles p where p.id = p_user)
    else (select r.reached_at from public.level_reached r where r.user_id = p_user and r.level = p_level)
  end;
$$;

-- Gives points once (false if this award was already given) and records any new level reached.
create function public.level_award(p_user uuid, p_source text, p_ref text, p_points integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.level_points (user_id, source, ref, points)
  values (p_user, p_source, p_ref, p_points)
  on conflict do nothing;
  if not found then
    return false;
  end if;
  insert into public.level_reached (user_id, level)
  select p_user, g from generate_series(2, public.user_level(p_user)) g
  on conflict do nothing;
  return true;
end;
$$;

-- 20 points to one member for a table / hangout, unless 2 others on the same local day already counted for them.
create function public.level_credit_member(p_user uuid, p_meetup_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date;
begin
  select (m.starts_at at time zone m.time_zone)::date into v_day from public.meetups m where m.id = p_meetup_id;
  if v_day is null then
    return;
  end if;
  if (
    select count(*) from public.level_points lp
    join public.meetups m on m.id = lp.meetup_id
    where lp.user_id = p_user and lp.source = 'meetup' and lp.ref <> p_meetup_id::text
      and (m.starts_at at time zone m.time_zone)::date = v_day
  ) >= 2 then
    return;
  end if;
  perform public.level_award(p_user, 'meetup', p_meetup_id::text, 20);
end;
$$;

-- Once 4+ members are checked in (and it isn't cancelled), every checked-in member gets the meetup's points.
create function public.level_credit_meetup(p_meetup_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if not exists (select 1 from public.meetups m where m.id = p_meetup_id and m.status = 'open')
     or public.meetup_checked_in_count(p_meetup_id) < 4 then
    return;
  end if;
  for v_user in
    select c.user_id
    from public.meetup_checkins c
    join public.meetup_members mm on mm.meetup_id = c.meetup_id and mm.user_id = c.user_id
    where c.meetup_id = p_meetup_id
    order by c.checked_in_at
  loop
    perform public.level_credit_member(v_user, p_meetup_id);
  end loop;
end;
$$;

-- How far someone is with a kind of challenge, counting what happened after p_since (profile kinds: as it is now).
create function public.level_challenge_progress(p_user uuid, p_kind text, p_since timestamptz)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (case
    when p_kind = 'profile_photo' then
      (select case when p.avatar_path is not null then 1 else 0 end from public.profiles p where p.id = p_user)
    when p_kind = 'instagram' then
      (select case when coalesce(p.instagram, '') <> '' then 1 else 0 end from public.profiles p where p.id = p_user)
    when p_kind = 'about' then
      (select case when p.profession is not null or cardinality(p.interests) > 0 then 1 else 0 end
       from public.profiles p where p.id = p_user)
    when p_kind = 'trip' then (select count(*) from public.trips t where t.user_id = p_user)
    when p_kind = 'favorite' then (select count(*) from public.favorite_places f where f.user_id = p_user)
    when p_kind in ('story', 'like_given', 'like_received', 'friend', 'feedback') then
      (select count(*) from public.level_activity a
       where a.user_id = p_user and a.kind = p_kind and a.created_at > p_since)
    when p_kind in ('checkin', 'join_table', 'join_hangout') then
      -- My check-ins (after p_since) at tables / hangouts where at least one other member checked in too.
      (select count(*) from public.meetup_checkins c
       join public.meetups m on m.id = c.meetup_id
       where c.user_id = p_user and c.checked_in_at > p_since and m.status = 'open'
         and (p_kind = 'checkin' or m.kind::text = case p_kind when 'join_table' then 'table' else 'hangout' end)
         and public.meetup_checked_in_count(c.meetup_id) >= 2)
    when p_kind = 'host_meetup' then
      -- Tables / hangouts I host whose 4th check-in came after p_since.
      (select count(*) from public.meetups m
       where m.host_id = p_user and m.status = 'open'
         and (
           select c.checked_in_at from public.meetup_checkins c
           join public.meetup_members mm on mm.meetup_id = c.meetup_id and mm.user_id = c.user_id
           where c.meetup_id = m.id
           order by c.checked_in_at
           offset 3 limit 1
         ) > p_since)
    else 0
  end)::integer;
$$;

-- Awards every finished challenge of the levels reached so far (repeats when that reaches a new level).
create function public.level_sync(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level integer;
  v_challenge record;
begin
  if p_user is null or not exists (select 1 from public.profiles p where p.id = p_user) then
    return;
  end if;
  for i in 1..100 loop
    v_level := public.user_level(p_user);
    for v_challenge in
      select ch.id, ch.level, ch.kind, ch.target
      from public.level_challenges ch
      where ch.level <= v_level
        and not exists (
          select 1 from public.level_points lp
          where lp.user_id = p_user and lp.source = 'challenge' and lp.ref = ch.id
        )
      order by ch.level, ch.sort
    loop
      if public.level_challenge_progress(p_user, v_challenge.kind, public.level_since(p_user, v_challenge.level))
         >= v_challenge.target then
        perform public.level_award(p_user, 'challenge', v_challenge.id, 20);
      end if;
    end loop;
    exit when public.user_level(p_user) = v_level;
  end loop;
end;
$$;

revoke execute on function public.level_for_points(integer) from public, anon, authenticated;
revoke execute on function public.user_points(uuid) from public, anon, authenticated;
revoke execute on function public.user_level(uuid) from public, anon, authenticated;
revoke execute on function public.level_since(uuid, integer) from public, anon, authenticated;
revoke execute on function public.level_award(uuid, text, text, integer) from public, anon, authenticated;
revoke execute on function public.level_credit_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.level_credit_meetup(uuid) from public, anon, authenticated;
revoke execute on function public.level_challenge_progress(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.level_sync(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Levels: triggers (a failure here never blocks the check-in, post, like, follow or feedback)
-- ---------------------------------------------------------------------------

create function public.level_on_checkin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.level_credit_meetup(new.meetup_id);
  exception when others then
    raise warning 'level points for check-in failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger meetup_checkins_level
after insert on public.meetup_checkins
for each row execute function public.level_on_checkin();

-- The completion code was approved by the founder: the members who confirmed it get the points.
create function public.level_on_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    begin
      if exists (select 1 from public.meetups m where m.id = new.meetup_id and m.status = 'open') then
        for v_user in
          select cc.user_id
          from public.meetup_code_confirmations cc
          join public.meetup_members mm on mm.meetup_id = cc.meetup_id and mm.user_id = cc.user_id
          where cc.meetup_id = new.meetup_id
          order by cc.confirmed_at
        loop
          perform public.level_credit_member(v_user, new.meetup_id);
        end loop;
      end if;
    exception when others then
      raise warning 'level points for completion failed: %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;

create trigger meetup_completions_level
after update of status on public.meetup_completions
for each row execute function public.level_on_completion();

create function public.level_on_story()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.level_activity (user_id, kind, ref, created_at)
    values (new.user_id, 'story', new.id::text, new.created_at)
    on conflict do nothing;
  exception when others then
    raise warning 'level activity for story failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger stories_level
after insert on public.stories
for each row execute function public.level_on_story();

-- Liking counts once per story for the liker, and once per story and liker for the poster (unlike + like again
-- doesn't count twice).
create function public.level_on_story_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  begin
    select s.user_id into v_owner from public.stories s where s.id = new.story_id;
    insert into public.level_activity (user_id, kind, ref, created_at)
    values (new.user_id, 'like_given', new.story_id::text, new.created_at)
    on conflict do nothing;
    if v_owner is not null and v_owner <> new.user_id then
      insert into public.level_activity (user_id, kind, ref, created_at)
      values (v_owner, 'like_received', new.story_id::text || ':' || new.user_id::text, new.created_at)
      on conflict do nothing;
    end if;
  exception when others then
    raise warning 'level activity for story like failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger story_likes_level
after insert on public.story_likes
for each row execute function public.level_on_story_like();

-- A follow back makes a friend (mutual follows), once per person ever.
create function public.level_on_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if exists (
      select 1 from public.follows f where f.follower_id = new.followee_id and f.followee_id = new.follower_id
    ) then
      insert into public.level_activity (user_id, kind, ref, created_at)
      values (new.follower_id, 'friend', new.followee_id::text, new.created_at),
             (new.followee_id, 'friend', new.follower_id::text, new.created_at)
      on conflict do nothing;
    end if;
  exception when others then
    raise warning 'level activity for follow failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger follows_level
after insert on public.follows
for each row execute function public.level_on_follow();

create function public.level_on_feedback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.level_activity (user_id, kind, ref, created_at)
    values (new.from_id, 'feedback', new.meetup_id::text || ':' || new.to_id::text, new.created_at)
    on conflict do nothing;
  exception when others then
    raise warning 'level activity for feedback failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger member_feedback_level
after insert on public.member_feedback
for each row execute function public.level_on_feedback();

revoke execute on function public.level_on_checkin() from public, anon, authenticated;
revoke execute on function public.level_on_completion() from public, anon, authenticated;
revoke execute on function public.level_on_story() from public, anon, authenticated;
revoke execute on function public.level_on_story_like() from public, anon, authenticated;
revoke execute on function public.level_on_follow() from public, anon, authenticated;
revoke execute on function public.level_on_feedback() from public, anon, authenticated;

-- What happened before this migration: stories still there, feedback, friendships, and meetups with 4+ check-ins.
insert into public.level_activity (user_id, kind, ref, created_at)
select s.user_id, 'story', s.id::text, s.created_at from public.stories s
on conflict do nothing;

insert into public.level_activity (user_id, kind, ref, created_at)
select f.from_id, 'feedback', f.meetup_id::text || ':' || f.to_id::text, f.created_at from public.member_feedback f
on conflict do nothing;

insert into public.level_activity (user_id, kind, ref, created_at)
select a.follower_id, 'friend', a.followee_id::text, greatest(a.created_at, b.created_at)
from public.follows a
join public.follows b on b.follower_id = a.followee_id and b.followee_id = a.follower_id
on conflict do nothing;

do $$
declare
  v_meetup uuid;
begin
  for v_meetup in
    select m.id from public.meetups m
    where exists (select 1 from public.meetup_checkins c where c.meetup_id = m.id)
    order by m.starts_at
  loop
    perform public.level_credit_meetup(v_meetup);
  end loop;
  for v_meetup in
    select mc.meetup_id from public.meetup_completions mc
    join public.meetups m on m.id = mc.meetup_id
    where mc.status = 'approved' and m.status = 'open'
    order by m.starts_at
  loop
    perform public.level_credit_member(cc.user_id, v_meetup)
    from public.meetup_code_confirmations cc
    join public.meetup_members mm on mm.meetup_id = cc.meetup_id and mm.user_id = cc.user_id
    where cc.meetup_id = v_meetup;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Levels: for the app
-- ---------------------------------------------------------------------------

-- My level (finished challenges are awarded first):
-- { level, points, level_points (points into this level), per_level, meetup_points, challenge_points, plus_level,
--   meetups_per_day, level_started_at,
--   challenges: [{ id, level, kind, target, progress, done, done_at, locked }] (levels up to mine + the next one,
--     locked = next level),
--   history: [{ source, ref, points, at, meetup_kind, title, place_name, place_name_en, place_name_th }] (latest 30),
--   weekly: [{ week (Monday, Bangkok date), points }] (last 8 weeks, oldest first) }
create function public.my_level()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_points integer;
  v_level integer;
begin
  if v_uid is null then
    return null;
  end if;
  perform public.level_sync(v_uid);
  v_points := public.user_points(v_uid);
  v_level := public.level_for_points(v_points);

  return jsonb_build_object(
    'level', v_level,
    'points', v_points,
    'level_points', v_points % 100,
    'per_level', 100,
    'meetup_points', 20,
    'challenge_points', 20,
    'plus_level', 15,
    'meetups_per_day', 2,
    'level_started_at', public.level_since(v_uid, v_level),
    'challenges', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ch.id, 'level', ch.level, 'kind', ch.kind, 'target', ch.target,
               'progress', case
                 when lp.created_at is not null then ch.target
                 when ch.level > v_level then 0
                 else least(ch.target, public.level_challenge_progress(v_uid, ch.kind, public.level_since(v_uid, ch.level)))
               end,
               'done', lp.created_at is not null,
               'done_at', lp.created_at,
               'locked', ch.level > v_level
             ) order by ch.level, ch.sort)
      from public.level_challenges ch
      left join public.level_points lp on lp.user_id = v_uid and lp.source = 'challenge' and lp.ref = ch.id
      where ch.level <= v_level + 1
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(h.item order by h.at desc)
      from (
        select lp.created_at as at, jsonb_build_object(
                 'source', lp.source, 'ref', lp.ref, 'points', lp.points, 'at', lp.created_at,
                 'meetup_kind', m.kind, 'title', m.title,
                 'place_name', coalesce(v.name_en, pl.name, m.spot_name),
                 'place_name_en', coalesce(v.name_en, pl.name_en), 'place_name_th', coalesce(v.name_th, pl.name_th)
               ) as item
        from public.level_points lp
        left join public.meetups m on m.id = lp.meetup_id
        left join public.venues v on v.id = m.venue_id
        left join public.places pl on pl.id = m.place_id
        where lp.user_id = v_uid
        order by lp.created_at desc
        limit 30
      ) h
    ), '[]'::jsonb),
    'weekly', (
      select jsonb_agg(jsonb_build_object(
               'week', w.week,
               'points', coalesce((
                 select sum(lp.points) from public.level_points lp
                 where lp.user_id = v_uid
                   and (lp.created_at at time zone 'Asia/Bangkok')::date >= w.week
                   and (lp.created_at at time zone 'Asia/Bangkok')::date < w.week + 7
               ), 0)
             ) order by w.week)
      from (
        select (date_trunc('week', now() at time zone 'Asia/Bangkok') - make_interval(weeks => g))::date as week
        from generate_series(0, 7) g
      ) w
    )
  );
end;
$$;

revoke execute on function public.my_level() from public, anon;
grant execute on function public.my_level() to authenticated;

-- ---------------------------------------------------------------------------
-- Level 15: TableMeet Plus and every travel deal
-- ---------------------------------------------------------------------------

create or replace function public.has_plus(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.plus_members m where m.user_id = p_user and m.ends_at > now())
      or exists (select 1 from public.admins a where a.user_id = p_user)
      or public.user_level(p_user) >= 15;
$$;

-- As before, plus `level` and `by_level` (Plus because of level 15). Finished challenges are awarded first, so
-- reaching level 15 unlocks Plus as soon as the app asks.
create or replace function public.my_plus()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null then
    perform public.level_sync(v_uid);
  end if;
  return jsonb_build_object(
    'member', public.has_plus(v_uid),
    'unlocked', public.plus_unlocked(),
    'plan', (select m.plan from public.plus_members m where m.user_id = v_uid and m.ends_at > now()),
    'ends_at', (select m.ends_at from public.plus_members m where m.user_id = v_uid and m.ends_at > now()),
    'level', case when v_uid is not null then public.user_level(v_uid) end,
    'by_level', v_uid is not null and public.user_level(v_uid) >= 15
  );
end;
$$;

-- Every active travel deal (everywhere first, then country, then city), for people at level 15 or higher; nothing
-- for others.
create function public.level_deals()
returns table (
  id uuid,
  brand text,
  category text,
  title_en text,
  title_th text,
  details_en text,
  details_th text,
  code text,
  url text,
  ends_at timestamptz,
  scope text,
  city_name text,
  country_code text
)
language sql
stable
security definer
set search_path = ''
as $$
  select td.id, td.brand, td.category, td.title_en, td.title_th, td.details_en, td.details_th, td.code, td.url,
         td.ends_at, td.scope, td.city_name, td.country_code
  from public.travel_deals td
  where (select auth.uid()) is not null
    and public.user_level((select auth.uid())) >= 15
    and td.is_active
    and (td.starts_at is null or td.starts_at <= now())
    and (td.ends_at is null or td.ends_at > now())
    and (select count(*) from public.travel_deal_reports rp where rp.deal_id = td.id) < 3
    and not exists (
      select 1 from public.travel_deal_reports rp where rp.deal_id = td.id and rp.user_id = (select auth.uid())
    )
  order by case td.scope when 'world' then 0 when 'country' then 1 else 2 end, td.created_at desc
  limit 100;
$$;

revoke execute on function public.level_deals() from public, anon;
grant execute on function public.level_deals() to authenticated;

-- "Didn't work?": hosts with a reward, and now also people at level 15+.
create or replace function public.report_travel_deal(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if public.user_level(auth.uid()) < 15 and not exists (select 1 from public.my_rewards()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  insert into public.travel_deal_reports (deal_id, user_id)
  select td.id, auth.uid() from public.travel_deals td where td.id = p_deal_id
  on conflict do nothing;
end;
$$;
