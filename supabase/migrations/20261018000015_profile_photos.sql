-- Profile picture and up to 3 "best photos" on each profile.
--
-- * Files live in the public "profile-photos" bucket under <user id>/…; people can only add, replace or delete
--   files in their own folder. Names are random, and profiles are only listed to signed-in users.
-- * profiles.avatar_path / profiles.photo_paths (max 3, in order) are saved with update_my_photos, which only
--   accepts paths in the caller's own folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Listing is limited to your own folder (the files themselves are served by their public links).
create policy "People list their own profile photos"
on storage.objects for select
to authenticated
using (bucket_id = 'profile-photos' and split_part(name, '/', 1) = (select auth.uid())::text);

create policy "People upload profile photos to their own folder"
on storage.objects for insert
to authenticated
with check (bucket_id = 'profile-photos' and split_part(name, '/', 1) = (select auth.uid())::text);

create policy "People replace their own profile photos"
on storage.objects for update
to authenticated
using (bucket_id = 'profile-photos' and split_part(name, '/', 1) = (select auth.uid())::text)
with check (bucket_id = 'profile-photos' and split_part(name, '/', 1) = (select auth.uid())::text);

create policy "People delete their own profile photos"
on storage.objects for delete
to authenticated
using (bucket_id = 'profile-photos' and split_part(name, '/', 1) = (select auth.uid())::text);

alter table public.profiles
  add column avatar_path text check (avatar_path is null or split_part(avatar_path, '/', 1) = id::text),
  add column photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 3);

-- Errors: auth_required, invalid_photo (a path outside the caller's folder), too_many_photos.
create function public.update_my_photos(p_avatar_path text, p_photo_paths text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_folder text := auth.uid()::text;
  v_photos text[] := coalesce(p_photo_paths, '{}');
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if cardinality(v_photos) > 3 then
    raise exception 'too_many_photos';
  end if;
  if (p_avatar_path is not null and split_part(p_avatar_path, '/', 1) <> v_folder)
     or exists (select 1 from unnest(v_photos) as p (path) where split_part(p.path, '/', 1) <> v_folder) then
    raise exception 'invalid_photo';
  end if;
  update public.profiles set avatar_path = p_avatar_path, photo_paths = v_photos where id = auth.uid();
end;
$$;

revoke execute on function public.update_my_photos(text, text[]) from public, anon;
grant execute on function public.update_my_photos(text, text[]) to authenticated;

-- get_profile now also returns the photos.
drop function public.get_profile(uuid);

create function public.get_profile(p_user_id uuid)
returns table (
  id uuid,
  display_name text,
  instagram text,
  avatar_path text,
  photo_paths text[],
  followers integer,
  following integer,
  tables integer,
  hangouts integer,
  thumbs_up integer,
  thumbs_down integer,
  i_follow boolean,
  follows_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.display_name,
    p.instagram,
    p.avatar_path,
    p.photo_paths,
    (select count(*)::integer from public.follows f where f.followee_id = p.id),
    (select count(*)::integer from public.follows f where f.follower_id = p.id),
    (select count(*)::integer from public.meetup_members mm join public.meetups m on m.id = mm.meetup_id
     where mm.user_id = p.id and m.kind = 'table' and m.status = 'open' and m.ends_at <= now()),
    (select count(*)::integer from public.meetup_members mm join public.meetups m on m.id = mm.meetup_id
     where mm.user_id = p.id and m.kind = 'hangout' and m.status = 'open' and m.ends_at <= now()),
    (select count(*)::integer from public.member_feedback fb where fb.to_id = p.id and fb.vote = 1),
    (select count(*)::integer from public.member_feedback fb where fb.to_id = p.id and fb.vote = -1),
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id),
    exists (select 1 from public.follows f where f.follower_id = p.id and f.followee_id = auth.uid())
  from public.profiles p
  where p.id = p_user_id
    and auth.uid() is not null
    and not public.is_blocked_between(auth.uid(), p.id);
$$;

revoke execute on function public.get_profile(uuid) from public, anon;
grant execute on function public.get_profile(uuid) to authenticated;
