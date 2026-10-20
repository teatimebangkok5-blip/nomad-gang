-- Story map + level badges (founder, 2026-10-20).
--
-- Story map: stories stay on the home map for 24 hours as before, but are now kept for 10 days on the poster's
-- profile "story map" (their stories in time order, joined by a line: where they've been). Who sees a story there is
-- the same as on the home map: everyone for "Everyone" stories, friends for friends-only ones, never across a block,
-- not when reported by me or hidden by 3 reports. After 10 days a story is gone everywhere:
-- clear_my_expired_stories (the app calls it on start) now deletes the poster's stories older than 10 days.
--
-- Level badges: everyone's level number shows on their profile picture (home, profile, messages, chats, members,
-- travellers, friends, story pins). user_levels(ids) returns the levels of up to 300 people (not across a block).

-- Kept for the story map: like story_visible, but for 10 days after posting instead of until it leaves the home map.
create function public.story_on_profile(p_story_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.stories s
    where s.id = p_story_id and s.created_at > now() - interval '10 days' and (select auth.uid()) is not null
      and (
        s.user_id = (select auth.uid())
        or (
          (s.audience = 'everyone' or public.are_friends((select auth.uid()), s.user_id))
          and not public.is_blocked_between((select auth.uid()), s.user_id)
          and not public.story_hidden(s.id)
          and not exists (
            select 1 from public.reports r
            where r.context::text = 'story' and r.context_id = s.id and r.reporter_id = (select auth.uid())
          )
        )
      )
  );
$$;

revoke execute on function public.story_on_profile(uuid) from public, anon;
grant execute on function public.story_on_profile(uuid) to authenticated;

-- Story rows readable while on someone's story map too (the home map list stays 24 hours: map_stories).
drop policy "People see live stories" on public.stories;

create policy "People see live and kept stories"
on public.stories for select
to authenticated
using (public.story_on_profile(id) or (select public.is_admin()));

-- Story photos open while the story is on the poster's story map (10 days).
create or replace function public.story_file_visible(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.stories s where s.photo_path = p_name and public.story_on_profile(s.id));
$$;

-- Likes work on the story map as well (same people who can see it).
create or replace function public.like_story(p_story_id uuid, p_like boolean default true)
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
  if v_owner is null or not public.story_on_profile(p_story_id) then
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

-- Deletes my stories older than 10 days and returns their photo paths (the app deletes the files).
create or replace function public.clear_my_expired_stories()
returns setof text
language sql
security definer
set search_path = ''
as $$
  delete from public.stories s
  where s.user_id = (select auth.uid()) and s.created_at <= now() - interval '10 days'
  returning s.photo_path;
$$;

-- Someone's story map: their stories from the last 10 days that I may see, oldest first. `on_map` = still on the
-- home map (first 24 hours). like_count only on my own stories.
create function public.user_story_map(p_user_id uuid)
returns table (
  id uuid,
  photo_path text,
  caption text,
  lat double precision,
  lng double precision,
  area_name_en text,
  area_name_th text,
  created_at timestamptz,
  audience text,
  on_map boolean,
  liked boolean,
  like_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.photo_path, s.caption, s.lat, s.lng,
         coalesce(s.area_name_en, s.area_name), coalesce(s.area_name_th, s.area_name), s.created_at, s.audience,
         s.expires_at > now(),
         exists (select 1 from public.story_likes l where l.story_id = s.id and l.user_id = (select auth.uid())),
         case when s.user_id = (select auth.uid()) then (
           select count(*)::integer from public.story_likes l
           where l.story_id = s.id and not public.is_blocked_between(s.user_id, l.user_id)
         ) end
  from public.stories s
  where s.user_id = p_user_id and public.story_on_profile(s.id)
  order by s.created_at
  limit 200;
$$;

revoke execute on function public.user_story_map(uuid) from public, anon;
grant execute on function public.user_story_map(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Level badges
-- ---------------------------------------------------------------------------

-- The level of each of these people (max 300), except across a block. Signed-in users only.
create function public.user_levels(p_user_ids uuid[])
returns table (user_id uuid, level integer)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, public.user_level(p.id)
  from public.profiles p
  where (select auth.uid()) is not null
    and p.id = any ((coalesce(p_user_ids, '{}'::uuid[]))[1:300])
    and not public.is_blocked_between((select auth.uid()), p.id);
$$;

revoke execute on function public.user_levels(uuid[]) from public, anon;
grant execute on function public.user_levels(uuid[]) to authenticated;
