-- Map stories (founder, 2026-10-19): a photo with an optional caption, pinned on the home map near where it was
-- posted, for 24 hours. Everyone signed in sees everyone's stories (anywhere in the world), except across a block.
--
-- * Privacy: the exact location is never stored. post_story moves the pin 100–250 m in a random direction before
--   saving, so a story posted at home doesn't show the home. Bangkok stories also get the nearest area name.
-- * stories: readable while live (not expired, not hidden by reports, no block either way); no direct writes.
--   post_story (max 10 per person per 24 h; same phone/guest rule as meetups) and delete_story (mine, or the founder).
-- * Photos: private "story-photos" bucket at <user id>/<random>.jpg, opened with signed links; the owner can list /
--   upload / delete in their own folder, others can open a file only while its story is live for them.
-- * Reports: reports with context 'story' (context_id = story id). The reporter stops seeing it at once; it's hidden
--   for everyone at 3 open reports, until the founder resolves them.

alter type public.report_context add value if not exists 'story';

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  photo_path text not null check (photo_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'),
  caption text not null default '' check (length(caption) <= 150),
  -- Already moved 100–250 m from where it was posted.
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  area_name text,
  area_name_en text,
  area_name_th text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

create index stories_live_idx on public.stories (expires_at desc);
create index stories_user_idx on public.stories (user_id, created_at desc);

alter table public.stories enable row level security;
revoke insert, update, delete on public.stories from anon, authenticated;

-- Hidden for everyone at 3 open reports from different people.
create function public.story_hidden(p_story_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select count(distinct r.reporter_id) from public.reports r
    where r.context::text = 'story' and r.context_id = p_story_id and not r.resolved
  ) >= 3;
$$;

revoke execute on function public.story_hidden(uuid) from public, anon;
grant execute on function public.story_hidden(uuid) to authenticated;

-- Live for me: mine (until it expires), or someone else's that isn't hidden, reported by me, or across a block.
create function public.story_visible(p_story_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.stories s
    where s.id = p_story_id and s.expires_at > now() and (select auth.uid()) is not null
      and (
        s.user_id = (select auth.uid())
        or (
          not public.is_blocked_between((select auth.uid()), s.user_id)
          and not public.story_hidden(s.id)
          and not exists (
            select 1 from public.reports r
            where r.context::text = 'story' and r.context_id = s.id and r.reporter_id = (select auth.uid())
          )
        )
      )
  );
$$;

revoke execute on function public.story_visible(uuid) from public, anon;
grant execute on function public.story_visible(uuid) to authenticated;

create policy "People see live stories"
on public.stories for select
to authenticated
using (public.story_visible(id) or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Photos
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('story-photos', 'story-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create function public.story_file_visible(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.stories s where s.photo_path = p_name and public.story_visible(s.id));
$$;

revoke execute on function public.story_file_visible(text) from public, anon;
grant execute on function public.story_file_visible(text) to authenticated;

create policy "People open live story photos and list their own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'story-photos'
  and (split_part(name, '/', 1) = (select auth.uid())::text or public.story_file_visible(name) or (select public.is_admin()))
);

create policy "People upload story photos to their own folder"
on storage.objects for insert
to authenticated
with check (bucket_id = 'story-photos' and split_part(name, '/', 1) = (select auth.uid())::text);

create policy "People delete their own story photos"
on storage.objects for delete
to authenticated
using (bucket_id = 'story-photos' and (split_part(name, '/', 1) = (select auth.uid())::text or (select public.is_admin())));

-- ---------------------------------------------------------------------------
-- Posting, the map list, deleting
-- ---------------------------------------------------------------------------

-- Posts a story whose photo is already uploaded to my folder. p_lat / p_lng are where I am; only a point 100–250 m
-- away is stored. Returns the story id. Errors: auth_required, not_allowed, invalid_photo, invalid_caption,
-- invalid_location, too_many_stories.
create function public.post_story(p_photo_path text, p_caption text, p_lat double precision, p_lng double precision)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_caption text := trim(coalesce(p_caption, ''));
  v_bearing double precision := random() * 2 * pi();
  v_meters double precision := 100 + random() * 150;
  v_lat double precision;
  v_lng double precision;
  v_area record;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if not public.meetup_caller_allowed() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_photo_path is null or split_part(p_photo_path, '/', 1) <> v_uid::text
     or p_photo_path !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$' then
    raise exception 'invalid_photo';
  end if;
  if length(v_caption) > 150 then
    raise exception 'invalid_caption';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -85 and 85 or p_lng not between -180 and 180 then
    raise exception 'invalid_location';
  end if;
  if (select count(*) from public.stories s where s.user_id = v_uid and s.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'too_many_stories';
  end if;

  v_lat := p_lat + v_meters * cos(v_bearing) / 111320;
  v_lng := p_lng + v_meters * sin(v_bearing) / (111320 * cos(radians(p_lat)));
  if v_lng > 180 then v_lng := v_lng - 360; elsif v_lng < -180 then v_lng := v_lng + 360; end if;
  select * into v_area from public.area_near(v_lat, v_lng);

  insert into public.stories (user_id, photo_path, caption, lat, lng, area_name, area_name_en, area_name_th)
  values (v_uid, p_photo_path, v_caption, v_lat, v_lng, v_area.name, v_area.name_en, v_area.name_th)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.post_story(text, text, double precision, double precision) from public, anon;
grant execute on function public.post_story(text, text, double precision, double precision) to authenticated;

-- Live stories for the map, newest first, with the poster's name and photo.
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
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.user_id, p.display_name, p.avatar_path, s.photo_path, s.caption, s.lat, s.lng,
         coalesce(s.area_name_en, s.area_name), coalesce(s.area_name_th, s.area_name), s.created_at, s.expires_at
  from public.stories s
  join public.profiles p on p.id = s.user_id
  where public.story_visible(s.id)
  order by s.created_at desc
  limit 500;
$$;

revoke execute on function public.map_stories() from public, anon;
grant execute on function public.map_stories() to authenticated;

-- Deletes a story (mine, or any as the founder). Returns its photo path so the app can delete the file.
-- Errors: auth_required, not_found.
create function public.delete_story(p_story_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  delete from public.stories s
  where s.id = p_story_id and (s.user_id = auth.uid() or public.is_admin())
  returning s.photo_path into v_path;
  if v_path is null then
    raise exception 'not_found';
  end if;
  return v_path;
end;
$$;

revoke execute on function public.delete_story(uuid) from public, anon;
grant execute on function public.delete_story(uuid) to authenticated;

alter publication supabase_realtime add table public.stories;

-- Deletes my expired stories and returns their photo paths, so the app can delete the files (the app calls it when
-- it starts). Expired stories are already hidden from everyone.
create function public.clear_my_expired_stories()
returns setof text
language sql
security definer
set search_path = ''
as $$
  delete from public.stories s
  where s.user_id = (select auth.uid()) and s.expires_at <= now()
  returning s.photo_path;
$$;

revoke execute on function public.clear_my_expired_stories() from public, anon;
grant execute on function public.clear_my_expired_stories() to authenticated;
