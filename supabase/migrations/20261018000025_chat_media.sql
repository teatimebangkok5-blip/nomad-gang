-- Photos, voice notes and live location in chats (table / hangout chats, private chats and group chats).
--
-- * Every message table gets a `kind`: text (as before), photo, voice or location. Text messages are still sent the
--   old way; the others only through send_chat_attachment.
-- * Files live in the private "chat-media" bucket at <chat kind>/<chat id>/<sender id>/<random name>. Only people
--   who can read that chat can open them (the app uses short-lived signed links); only people who can write in it
--   can upload, into their own folder. Private chats: only once the request has been accepted, so a stranger's
--   first message can't be a photo.
-- * Live location: a location message with live_until (15 min, 1 h or 8 h). The sender's phone keeps it up to date
--   with update_live_location while the app is open, and can stop it early. Others see the last position.
-- * my_chats also returns the kind of the last message, so the inbox can say "Photo" / "Voice message".
--
-- Errors: auth_required, not_allowed, not_found, blocked, request_pending, invalid_attachment.

-- ---------------------------------------------------------------------------
-- Message kinds
-- ---------------------------------------------------------------------------

alter table public.meetup_messages
  drop constraint meetup_messages_body_check,
  alter column body set default '',
  add column kind text not null default 'text' check (kind in ('text', 'photo', 'voice', 'location')),
  add column media_path text,
  add column duration_ms integer check (duration_ms is null or duration_ms between 0 and 300000),
  add column lat double precision check (lat between -90 and 90),
  add column lng double precision check (lng between -180 and 180),
  add column live_until timestamptz,
  add column location_updated_at timestamptz,
  add constraint meetup_messages_content_check check (
    case kind
      when 'text' then length(trim(body)) between 1 and 1000 and media_path is null and duration_ms is null
        and lat is null and lng is null and live_until is null
      when 'photo' then media_path is not null and length(body) <= 1000 and duration_ms is null
        and lat is null and lng is null and live_until is null
      when 'voice' then media_path is not null and body = '' and duration_ms is not null
        and lat is null and lng is null and live_until is null
      when 'location' then media_path is null and body = '' and duration_ms is null
        and lat is not null and lng is not null and live_until is not null
    end
  );

alter table public.direct_messages
  drop constraint direct_messages_body_check,
  alter column body set default '',
  add column kind text not null default 'text' check (kind in ('text', 'photo', 'voice', 'location')),
  add column media_path text,
  add column duration_ms integer check (duration_ms is null or duration_ms between 0 and 300000),
  add column lat double precision check (lat between -90 and 90),
  add column lng double precision check (lng between -180 and 180),
  add column live_until timestamptz,
  add column location_updated_at timestamptz,
  add constraint direct_messages_content_check check (
    case kind
      when 'text' then length(trim(body)) between 1 and 1000 and media_path is null and duration_ms is null
        and lat is null and lng is null and live_until is null
      when 'photo' then media_path is not null and length(body) <= 1000 and duration_ms is null
        and lat is null and lng is null and live_until is null
      when 'voice' then media_path is not null and body = '' and duration_ms is not null
        and lat is null and lng is null and live_until is null
      when 'location' then media_path is null and body = '' and duration_ms is null
        and lat is not null and lng is not null and live_until is not null
    end
  );

alter table public.chat_group_messages
  drop constraint chat_group_messages_body_check,
  alter column body set default '',
  add column kind text not null default 'text' check (kind in ('text', 'photo', 'voice', 'location')),
  add column media_path text,
  add column duration_ms integer check (duration_ms is null or duration_ms between 0 and 300000),
  add column lat double precision check (lat between -90 and 90),
  add column lng double precision check (lng between -180 and 180),
  add column live_until timestamptz,
  add column location_updated_at timestamptz,
  add constraint chat_group_messages_content_check check (
    case kind
      when 'text' then length(trim(body)) between 1 and 1000 and media_path is null and duration_ms is null
        and lat is null and lng is null and live_until is null
      when 'photo' then media_path is not null and length(body) <= 1000 and duration_ms is null
        and lat is null and lng is null and live_until is null
      when 'voice' then media_path is not null and body = '' and duration_ms is not null
        and lat is null and lng is null and live_until is null
      when 'location' then media_path is null and body = '' and duration_ms is null
        and lat is not null and lng is not null and live_until is not null
    end
  );

-- Direct inserts stay text-only.
drop policy "Members write in their table chat" on public.meetup_messages;
create policy "Members write in their table chat"
on public.meetup_messages for insert to authenticated
with check (kind = 'text' and sender_id = (select auth.uid()) and (select public.in_meetup_chat(meetup_id)));

drop policy "Members write in their groups" on public.chat_group_messages;
create policy "Members write in their groups"
on public.chat_group_messages for insert to authenticated
with check (kind = 'text' and sender_id = (select auth.uid()) and (select public.group_joined_at(group_id)) is not null);

-- ---------------------------------------------------------------------------
-- Who can read / write a chat
-- ---------------------------------------------------------------------------

-- p_write: posting (private chats must be accepted). Unknown kinds and ids are simply false.
create function public.chat_access(p_chat_kind text, p_chat_id uuid, p_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_chat_id is null then
    return false;
  end if;
  if p_chat_kind = 'meetup' then
    return public.in_meetup_chat(p_chat_id);
  elsif p_chat_kind = 'group' then
    return public.group_joined_at(p_chat_id) is not null;
  elsif p_chat_kind = 'dm' then
    return exists (
      select 1 from public.direct_threads t
      where t.id = p_chat_id
        and auth.uid() in (t.user_a, t.user_b)
        and not public.is_blocked_between(t.user_a, t.user_b)
        and (not p_write or t.status = 'accepted')
    );
  end if;
  return false;
end;
$$;

revoke execute on function public.chat_access(text, uuid, boolean) from public, anon;
grant execute on function public.chat_access(text, uuid, boolean) to authenticated;

-- A chat-media file name: <chat kind>/<chat id>/<sender id>/<file>. Checks the caller may read (or upload) it.
create function public.chat_file_access(p_name text, p_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(coalesce(p_name, ''), '/');
  v_uuid text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if cardinality(v_parts) <> 4 or v_parts[1] not in ('meetup', 'group', 'dm')
     or v_parts[2] !~ v_uuid or v_parts[3] !~ v_uuid or v_parts[4] !~ '^[A-Za-z0-9._-]{1,100}$' then
    return false;
  end if;
  if p_write and v_parts[3] <> auth.uid()::text then
    return false;
  end if;
  return public.chat_access(v_parts[1], v_parts[2]::uuid, p_write);
end;
$$;

revoke execute on function public.chat_file_access(text, boolean) from public, anon;
grant execute on function public.chat_file_access(text, boolean) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media', 'chat-media', false, 10485760,
  array['image/jpeg', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg']
)
on conflict (id) do nothing;

create policy "Chat members open chat files"
on storage.objects for select
to authenticated
using (bucket_id = 'chat-media' and public.chat_file_access(name, false));

create policy "Chat members upload to their own folder"
on storage.objects for insert
to authenticated
with check (bucket_id = 'chat-media' and public.chat_file_access(name, true));

create policy "People delete their own chat files"
on storage.objects for delete
to authenticated
using (bucket_id = 'chat-media' and split_part(name, '/', 3) = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Sending and live location
-- ---------------------------------------------------------------------------

-- Sends a photo / voice note (already uploaded to chat-media in my folder for this chat) or starts sharing my live
-- location (p_live_minutes 15, 60 or 480). Returns the message id.
create function public.send_chat_attachment(
  p_chat_kind text,
  p_chat_id uuid,
  p_kind text,
  p_media_path text,
  p_duration_ms integer,
  p_lat double precision,
  p_lng double precision,
  p_live_minutes integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_media text := case when p_kind in ('photo', 'voice') then p_media_path end;
  v_duration integer := case when p_kind = 'voice' then greatest(0, least(coalesce(p_duration_ms, 0), 300000)) end;
  v_lat double precision := case when p_kind = 'location' then p_lat end;
  v_lng double precision := case when p_kind = 'location' then p_lng end;
  v_until timestamptz := case when p_kind = 'location' then now() + make_interval(mins => p_live_minutes) end;
  v_located timestamptz := case when p_kind = 'location' then now() end;
begin
  if v_me is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_chat_kind not in ('meetup', 'group', 'dm') or p_kind not in ('photo', 'voice', 'location') then
    raise exception 'invalid_attachment';
  end if;
  if p_kind in ('photo', 'voice') and (
       p_media_path is null
       or not public.chat_file_access(p_media_path, true)
       or split_part(p_media_path, '/', 1) <> p_chat_kind
       or split_part(p_media_path, '/', 2) <> p_chat_id::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'chat-media' and o.name = p_media_path)) then
    raise exception 'invalid_attachment';
  end if;
  if p_kind = 'location' and (
       p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180
       or p_live_minutes is null or p_live_minutes not in (15, 60, 480)) then
    raise exception 'invalid_attachment';
  end if;

  if p_chat_kind = 'dm' then
    if not public.meetup_caller_allowed() then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    if exists (select 1 from public.direct_threads t where t.id = p_chat_id and v_me in (t.user_a, t.user_b)
               and public.is_blocked_between(t.user_a, t.user_b)) then
      raise exception 'blocked';
    end if;
    if exists (select 1 from public.direct_threads t where t.id = p_chat_id and v_me in (t.user_a, t.user_b)
               and t.status <> 'accepted') then
      raise exception 'request_pending';
    end if;
  end if;
  if not public.chat_access(p_chat_kind, p_chat_id, true) then
    raise exception 'not_found';
  end if;

  if p_chat_kind = 'meetup' then
    insert into public.meetup_messages (meetup_id, sender_id, kind, media_path, duration_ms, lat, lng, live_until, location_updated_at)
    values (p_chat_id, v_me, p_kind, v_media, v_duration, v_lat, v_lng, v_until, v_located)
    returning id into v_id;
  elsif p_chat_kind = 'group' then
    insert into public.chat_group_messages (group_id, sender_id, kind, media_path, duration_ms, lat, lng, live_until, location_updated_at)
    values (p_chat_id, v_me, p_kind, v_media, v_duration, v_lat, v_lng, v_until, v_located)
    returning id into v_id;
  else
    insert into public.direct_messages (thread_id, sender_id, kind, media_path, duration_ms, lat, lng, live_until, location_updated_at)
    values (p_chat_id, v_me, p_kind, v_media, v_duration, v_lat, v_lng, v_until, v_located)
    returning id into v_id;
    update public.direct_threads set last_message_at = now() where id = p_chat_id;
  end if;
  return v_id;
end;
$$;

-- Moves one of my live locations. Returns false once it has ended (or isn't mine), so the phone stops updating it.
create function public.update_live_location(p_chat_kind text, p_message_id uuid, p_lat double precision, p_lng double precision)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_found boolean := false;
begin
  if auth.uid() is null or p_lat is null or p_lng is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return false;
  end if;
  if p_chat_kind = 'meetup' then
    update public.meetup_messages set lat = p_lat, lng = p_lng, location_updated_at = now()
    where id = p_message_id and sender_id = auth.uid() and kind = 'location' and live_until > now()
      and public.in_meetup_chat(meetup_id);
  elsif p_chat_kind = 'group' then
    update public.chat_group_messages set lat = p_lat, lng = p_lng, location_updated_at = now()
    where id = p_message_id and sender_id = auth.uid() and kind = 'location' and live_until > now()
      and public.group_joined_at(group_id) is not null;
  elsif p_chat_kind = 'dm' then
    update public.direct_messages set lat = p_lat, lng = p_lng, location_updated_at = now()
    where id = p_message_id and sender_id = auth.uid() and kind = 'location' and live_until > now()
      and public.chat_access('dm', thread_id, true);
  else
    return false;
  end if;
  get diagnostics v_found = row_count;
  return v_found;
end;
$$;

-- Stops one of my live locations now (the last position stays visible).
create function public.stop_live_location(p_chat_kind text, p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_chat_kind = 'meetup' then
    update public.meetup_messages set live_until = now()
    where id = p_message_id and sender_id = auth.uid() and kind = 'location' and live_until > now();
  elsif p_chat_kind = 'group' then
    update public.chat_group_messages set live_until = now()
    where id = p_message_id and sender_id = auth.uid() and kind = 'location' and live_until > now();
  elsif p_chat_kind = 'dm' then
    update public.direct_messages set live_until = now()
    where id = p_message_id and sender_id = auth.uid() and kind = 'location' and live_until > now();
  end if;
end;
$$;

-- My live locations that are still running (so the phone picks them up again after a restart).
create function public.my_live_locations()
returns table (chat_kind text, chat_id uuid, message_id uuid, live_until timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select 'meetup'::text, m.meetup_id, m.id, m.live_until from public.meetup_messages m
  where m.sender_id = (select auth.uid()) and m.kind = 'location' and m.live_until > now()
  union all
  select 'group', m.group_id, m.id, m.live_until from public.chat_group_messages m
  where m.sender_id = (select auth.uid()) and m.kind = 'location' and m.live_until > now()
  union all
  select 'dm', m.thread_id, m.id, m.live_until from public.direct_messages m
  where m.sender_id = (select auth.uid()) and m.kind = 'location' and m.live_until > now();
$$;

revoke execute on function public.send_chat_attachment(text, uuid, text, text, integer, double precision, double precision, integer) from public, anon;
revoke execute on function public.update_live_location(text, uuid, double precision, double precision) from public, anon;
revoke execute on function public.stop_live_location(text, uuid) from public, anon;
revoke execute on function public.my_live_locations() from public, anon;
grant execute on function public.send_chat_attachment(text, uuid, text, text, integer, double precision, double precision, integer) to authenticated;
grant execute on function public.update_live_location(text, uuid, double precision, double precision) to authenticated;
grant execute on function public.stop_live_location(text, uuid) to authenticated;
grant execute on function public.my_live_locations() to authenticated;

-- ---------------------------------------------------------------------------
-- Inbox: the kind of the last message
-- ---------------------------------------------------------------------------

drop function public.my_chats();

create function public.my_chats()
returns table (
  chat_kind text,
  chat_id uuid,
  title text,
  emoji text,
  other_id uuid,
  other_avatar text,
  dm_status text,
  requested_by uuid,
  meetup_kind text,
  place_name text,
  place_name_en text,
  place_name_th text,
  venue_name_en text,
  venue_name_th text,
  starts_at timestamptz,
  ended boolean,
  cancelled boolean,
  member_count integer,
  owner_id uuid,
  last_body text,
  last_kind text,
  last_sender_id uuid,
  last_sender_name text,
  last_at timestamptz,
  unread_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as id)
  select * from (
    -- Private chats
    select 'dm'::text as c_kind, t.id as c_id, o.display_name as c_title, null::text as c_emoji, o.id as c_other,
           o.avatar_path as c_avatar, t.status::text as c_status, t.requested_by as c_requested_by,
           null::text as c_meetup_kind, null::text as c_place, null::text as c_place_en, null::text as c_place_th,
           null::text as c_venue_en, null::text as c_venue_th, null::timestamptz as c_starts,
           false as c_ended, false as c_cancelled, 2 as c_members, null::uuid as c_owner,
           lm.body as c_body, lm.kind as c_last_kind, lm.sender_id as c_sender, sp.display_name as c_sender_name,
           coalesce(lm.created_at, t.last_message_at) as c_last_at,
           (select count(*)::integer from public.direct_messages dm
            where dm.thread_id = t.id and dm.sender_id <> (select me.id from me)
              and dm.created_at > greatest(coalesce(cs.last_read_at, '-infinity'), coalesce(cs.hidden_at, '-infinity'))) as c_unread
    from public.direct_threads t
    join public.profiles o on o.id = case when t.user_a = (select me.id from me) then t.user_b else t.user_a end
    left join public.chat_state cs
      on cs.user_id = (select me.id from me) and cs.chat_kind = 'dm' and cs.chat_id = t.id
    left join lateral (
      select dm.body, dm.kind, dm.sender_id, dm.created_at from public.direct_messages dm
      where dm.thread_id = t.id and dm.created_at > coalesce(cs.hidden_at, '-infinity')
      order by dm.created_at desc limit 1
    ) lm on true
    left join public.profiles sp on sp.id = lm.sender_id
    where (select me.id from me) in (t.user_a, t.user_b)
      and not public.is_blocked_between(t.user_a, t.user_b)
      and not (t.status = 'declined' and t.requested_by <> (select me.id from me))
      and (cs.hidden_at is null or t.last_message_at > cs.hidden_at)

    union all

    -- Table and hangout chats
    select 'meetup', m.id, m.title, null, null, null, null, null,
           m.kind::text, coalesce(pl.name, m.spot_name), pl.name_en, pl.name_th, v.name_en, v.name_th, m.starts_at,
           m.status = 'cancelled' or m.ends_at < now(), m.status = 'cancelled',
           (select count(*)::integer from public.meetup_members x where x.meetup_id = m.id), m.host_id,
           lm.body, lm.kind, lm.sender_id, sp.display_name, coalesce(lm.created_at, mm.joined_at),
           (select count(*)::integer from public.meetup_messages msg
            where msg.meetup_id = m.id and msg.sender_id <> (select me.id from me)
              and msg.created_at > greatest(coalesce(cs.last_read_at, '-infinity'), mm.joined_at))
    from public.meetup_members mm
    join public.meetups m on m.id = mm.meetup_id
    left join public.venues v on v.id = m.venue_id
    left join public.places pl on pl.id = m.place_id
    left join public.chat_state cs
      on cs.user_id = (select me.id from me) and cs.chat_kind = 'meetup' and cs.chat_id = m.id
    left join lateral (
      select msg.body, msg.kind, msg.sender_id, msg.created_at from public.meetup_messages msg
      where msg.meetup_id = m.id order by msg.created_at desc limit 1
    ) lm on true
    left join public.profiles sp on sp.id = lm.sender_id
    where mm.user_id = (select me.id from me) and cs.hidden_at is null

    union all

    -- Group chats
    select 'group', g.id, g.name, g.emoji, null, null, null, null,
           null, null, null, null, null, null, null, false, false,
           (select count(*)::integer from public.chat_group_members x where x.group_id = g.id), g.owner_id,
           lm.body, lm.kind, lm.sender_id, sp.display_name, coalesce(lm.created_at, gm.joined_at),
           (select count(*)::integer from public.chat_group_messages msg
            where msg.group_id = g.id and msg.sender_id <> (select me.id from me)
              and msg.created_at > greatest(coalesce(cs.last_read_at, '-infinity'), gm.joined_at)
              and not public.is_blocked_between((select me.id from me), msg.sender_id))
    from public.chat_group_members gm
    join public.chat_groups g on g.id = gm.group_id
    left join public.chat_state cs
      on cs.user_id = (select me.id from me) and cs.chat_kind = 'group' and cs.chat_id = g.id
    left join lateral (
      select msg.body, msg.kind, msg.sender_id, msg.created_at from public.chat_group_messages msg
      where msg.group_id = g.id and msg.created_at >= gm.joined_at
        and not public.is_blocked_between((select me.id from me), msg.sender_id)
      order by msg.created_at desc limit 1
    ) lm on true
    left join public.profiles sp on sp.id = lm.sender_id
    where gm.user_id = (select me.id from me)
  ) chats
  where (select me.id from me) is not null
  order by chats.c_last_at desc
  limit 300;
$$;

revoke execute on function public.my_chats() from public, anon;
grant execute on function public.my_chats() to authenticated;
