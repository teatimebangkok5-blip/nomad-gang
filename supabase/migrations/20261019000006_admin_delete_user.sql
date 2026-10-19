-- The founder can delete someone's account from the admin panel (/admin/users), for deletion requests sent by email
-- (the "Delete account" page of the website / Google Site says people can ask that way).
--
-- The deletion itself moves into delete_account(user) (no API access), shared by delete_my_account() and
-- admin_delete_user(user), so both do exactly the same. Leaving groups moves into group_remove_member(group, user),
-- shared by leave_group() and the deletion. admin_account_files(user) lists that person's chat files, and admins may
-- list and delete files in the people-owned buckets, so the admin panel removes the files first (like the app does).

-- Removes one member from a group: the owner's role passes to the longest member; the last one out deletes the group.
create function public.group_remove_member(p_group_id uuid, p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.chat_groups g where g.id = p_group_id for update;
  delete from public.chat_group_members gm where gm.group_id = p_group_id and gm.user_id = p_user;
  if not found then
    return false;
  end if;
  delete from public.chat_state s where s.user_id = p_user and s.chat_kind = 'group' and s.chat_id = p_group_id;
  if not exists (select 1 from public.chat_group_members gm where gm.group_id = p_group_id) then
    delete from public.chat_groups g where g.id = p_group_id;
  else
    update public.chat_groups g
    set owner_id = (
      select gm.user_id from public.chat_group_members gm
      where gm.group_id = p_group_id order by gm.joined_at, gm.user_id limit 1
    )
    where g.id = p_group_id and (g.owner_id = p_user or g.owner_id is null);
  end if;
  return true;
end;
$$;

revoke execute on function public.group_remove_member(uuid, uuid) from public, anon, authenticated;

create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.group_remove_member(p_group_id, auth.uid()) then
    raise exception 'not_found';
  end if;
end;
$$;

-- Deletes one account and everything that belongs to it.
create function public.delete_account(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
begin
  -- Groups: leaving passes the owner role on (and deletes a group nobody is left in).
  for v_group in select gm.group_id from public.chat_group_members gm where gm.user_id = p_user loop
    perform public.group_remove_member(v_group, p_user);
  end loop;

  -- Tables / hangouts they host: upcoming or running ones are cancelled; any that other people joined pass to the
  -- longest other member so their chat and history stay. The rest go with the account.
  update public.meetups m set status = 'cancelled'
  where m.host_id = p_user and m.status = 'open' and m.ends_at > now();
  update public.meetups m
  set host_id = (
    select mm.user_id from public.meetup_members mm
    where mm.meetup_id = m.id and mm.user_id <> p_user
    order by mm.joined_at, mm.user_id limit 1
  )
  where m.host_id = p_user
    and exists (select 1 from public.meetup_members mm where mm.meetup_id = m.id and mm.user_id <> p_user);

  delete from auth.users u where u.id = p_user;
end;
$$;

revoke execute on function public.delete_account(uuid) from public, anon, authenticated;

-- Deletes the caller's account and everything that belongs to it. Errors: auth_required.
create or replace function public.delete_my_account()
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
  perform public.delete_account(v_uid);
end;
$$;

-- Admins: someone's chat files (photos, voice notes), so the admin panel can delete them before the account goes.
create function public.admin_account_files(p_user uuid)
returns table (bucket text, path text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select 'chat-media'::text, m.media_path from public.meetup_messages m
  where m.sender_id = p_user and m.media_path is not null
  union all
  select 'chat-media'::text, m.media_path from public.direct_messages m
  where m.sender_id = p_user and m.media_path is not null
  union all
  select 'chat-media'::text, m.media_path from public.chat_group_messages m
  where m.sender_id = p_user and m.media_path is not null;
end;
$$;

revoke execute on function public.admin_account_files(uuid) from public, anon;
grant execute on function public.admin_account_files(uuid) to authenticated;

-- Admins: delete someone's account. Errors: not allowed, not_found, cannot_delete_admin (remove them from
-- public.admins first; this also stops the founder deleting their own account by mistake).
create function public.admin_delete_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'not_found';
  end if;
  if exists (select 1 from public.admins a where a.user_id = p_user) then
    raise exception 'cannot_delete_admin';
  end if;
  perform public.delete_account(p_user);
end;
$$;

revoke execute on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- Admins may list and delete files in the buckets that hold people's own files (for account deletion).
create policy "admins list people's files"
on storage.objects for select
to authenticated
using (
  bucket_id in ('profile-photos', 'chat-media', 'gem-photos', 'story-photos')
  and (select public.is_admin())
);

create policy "admins delete people's files"
on storage.objects for delete
to authenticated
using (
  bucket_id in ('profile-photos', 'chat-media', 'gem-photos', 'story-photos')
  and (select public.is_admin())
);
