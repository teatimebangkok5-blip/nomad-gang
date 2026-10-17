-- The + button (photos, voice notes, live location) in every chat, private chats included.
--
-- * Private chats: the person who received a request can now reply with a photo, voice note or location, which
--   accepts the request (like replying with text). The person who sent the request still waits for a reply.
-- * A new private chat still starts with a text message (send_direct_message checks that both people are nearby).

create or replace function public.chat_access(p_chat_kind text, p_chat_id uuid, p_write boolean)
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
    -- Writing: accepted, or a request someone else sent me (replying accepts it).
    return exists (
      select 1 from public.direct_threads t
      where t.id = p_chat_id
        and auth.uid() in (t.user_a, t.user_b)
        and not public.is_blocked_between(t.user_a, t.user_b)
        and (not p_write or t.status = 'accepted' or t.requested_by <> auth.uid())
    );
  end if;
  return false;
end;
$$;

create or replace function public.send_chat_attachment(
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
  v_thread public.direct_threads%rowtype;
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
  if p_kind = 'location' and (
       p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180
       or p_live_minutes is null or p_live_minutes not in (15, 60, 480)) then
    raise exception 'invalid_attachment';
  end if;

  if p_chat_kind = 'dm' then
    if not public.meetup_caller_allowed() then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    select * into v_thread from public.direct_threads t
    where t.id = p_chat_id and v_me in (t.user_a, t.user_b)
    for update;
    if not found then
      raise exception 'not_found';
    end if;
    if public.is_blocked_between(v_thread.user_a, v_thread.user_b) then
      raise exception 'blocked';
    end if;
    if v_thread.status = 'pending' and v_thread.requested_by = v_me then
      raise exception 'request_pending';
    end if;
    if v_thread.status = 'declined' and v_thread.requested_by = v_me then
      raise exception 'request_declined';
    end if;
  end if;

  if p_kind in ('photo', 'voice') and (
       p_media_path is null
       or not public.chat_file_access(p_media_path, true)
       or split_part(p_media_path, '/', 1) <> p_chat_kind
       or split_part(p_media_path, '/', 2) <> p_chat_id::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'chat-media' and o.name = p_media_path)) then
    raise exception 'invalid_attachment';
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
    -- The receiver replying accepts the request.
    if v_thread.status <> 'accepted' then
      update public.direct_threads set status = 'accepted' where id = p_chat_id;
    end if;
    insert into public.direct_messages (thread_id, sender_id, kind, media_path, duration_ms, lat, lng, live_until, location_updated_at)
    values (p_chat_id, v_me, p_kind, v_media, v_duration, v_lat, v_lng, v_until, v_located)
    returning id into v_id;
    update public.direct_threads set last_message_at = now() where id = p_chat_id;
  end if;
  return v_id;
end;
$$;
