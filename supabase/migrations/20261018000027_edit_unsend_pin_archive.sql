-- Edit and unsend messages in any chat; pin and archive chats in Messages.
--
-- * Edit: the sender changes the text of their own text message (shown as "edited").
-- * Unsend: the sender takes back their own message, photo, voice note or live location. It stays in the chat as
--   "Message unsent" (kind 'unsent', nothing else kept); the app then deletes the file from storage.
-- * Pin / archive: per person and chat in chat_state. Pinned chats are listed first; archived chats are only in
--   the Archived list (and don't count for the unread badge). Both are cleared when a private chat is deleted.
--
-- Errors: auth_required, empty_message, not_found.

-- ---------------------------------------------------------------------------
-- Edit / unsend
-- ---------------------------------------------------------------------------

alter table public.meetup_messages
  add column edited_at timestamptz,
  drop constraint meetup_messages_kind_check,
  add constraint meetup_messages_kind_check check (kind in ('text', 'photo', 'voice', 'location', 'unsent')),
  drop constraint meetup_messages_content_check,
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
      when 'unsent' then media_path is null and body = '' and duration_ms is null
        and lat is null and lng is null and live_until is null
    end
  );

alter table public.direct_messages
  add column edited_at timestamptz,
  drop constraint direct_messages_kind_check,
  add constraint direct_messages_kind_check check (kind in ('text', 'photo', 'voice', 'location', 'unsent')),
  drop constraint direct_messages_content_check,
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
      when 'unsent' then media_path is null and body = '' and duration_ms is null
        and lat is null and lng is null and live_until is null
    end
  );

alter table public.chat_group_messages
  add column edited_at timestamptz,
  drop constraint chat_group_messages_kind_check,
  add constraint chat_group_messages_kind_check check (kind in ('text', 'photo', 'voice', 'location', 'unsent')),
  drop constraint chat_group_messages_content_check,
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
      when 'unsent' then media_path is null and body = '' and duration_ms is null
        and lat is null and lng is null and live_until is null
    end
  );

-- Changes the text of one of my text messages in a chat I can still read.
create function public.edit_chat_message(p_chat_kind text, p_message_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := trim(coalesce(p_body, ''));
  v_found integer := 0;
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if length(v_body) = 0 or length(v_body) > 1000 then
    raise exception 'empty_message';
  end if;
  if p_chat_kind = 'meetup' then
    update public.meetup_messages set body = v_body, edited_at = now()
    where id = p_message_id and sender_id = auth.uid() and kind = 'text' and public.chat_access('meetup', meetup_id, false);
  elsif p_chat_kind = 'group' then
    update public.chat_group_messages set body = v_body, edited_at = now()
    where id = p_message_id and sender_id = auth.uid() and kind = 'text' and public.chat_access('group', group_id, false);
  elsif p_chat_kind = 'dm' then
    update public.direct_messages set body = v_body, edited_at = now()
    where id = p_message_id and sender_id = auth.uid() and kind = 'text' and public.chat_access('dm', thread_id, false);
  end if;
  get diagnostics v_found = row_count;
  if v_found = 0 then
    raise exception 'not_found';
  end if;
end;
$$;

-- Takes back one of my messages (any kind). Returns the file it had (photo / voice note), for the app to delete.
create function public.unsend_chat_message(p_chat_kind text, p_message_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
  v_found integer := 0;
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_chat_kind = 'meetup' then
    select m.media_path into v_path from public.meetup_messages m where m.id = p_message_id and m.sender_id = auth.uid();
    update public.meetup_messages
    set kind = 'unsent', body = '', media_path = null, duration_ms = null, lat = null, lng = null, live_until = null,
        location_updated_at = null, edited_at = null
    where id = p_message_id and sender_id = auth.uid() and kind <> 'unsent' and public.chat_access('meetup', meetup_id, false);
  elsif p_chat_kind = 'group' then
    select m.media_path into v_path from public.chat_group_messages m where m.id = p_message_id and m.sender_id = auth.uid();
    update public.chat_group_messages
    set kind = 'unsent', body = '', media_path = null, duration_ms = null, lat = null, lng = null, live_until = null,
        location_updated_at = null, edited_at = null
    where id = p_message_id and sender_id = auth.uid() and kind <> 'unsent' and public.chat_access('group', group_id, false);
  elsif p_chat_kind = 'dm' then
    select m.media_path into v_path from public.direct_messages m where m.id = p_message_id and m.sender_id = auth.uid();
    update public.direct_messages
    set kind = 'unsent', body = '', media_path = null, duration_ms = null, lat = null, lng = null, live_until = null,
        location_updated_at = null, edited_at = null
    where id = p_message_id and sender_id = auth.uid() and kind <> 'unsent' and public.chat_access('dm', thread_id, false);
  end if;
  get diagnostics v_found = row_count;
  if v_found = 0 then
    raise exception 'not_found';
  end if;
  return v_path;
end;
$$;

revoke execute on function public.edit_chat_message(text, uuid, text) from public, anon;
revoke execute on function public.unsend_chat_message(text, uuid) from public, anon;
grant execute on function public.edit_chat_message(text, uuid, text) to authenticated;
grant execute on function public.unsend_chat_message(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Pin / archive
-- ---------------------------------------------------------------------------

alter table public.chat_state
  add column pinned_at timestamptz,
  add column archived_at timestamptz;

-- p_what: 'pin' or 'archive'. Only for chats I'm in.
create function public.set_chat_flag(p_kind text, p_chat_id uuid, p_what text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz := case when p_on then now() end;
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_what not in ('pin', 'archive') or p_kind not in ('dm', 'meetup', 'group')
     or (p_kind = 'dm' and not exists (
           select 1 from public.direct_threads t where t.id = p_chat_id and auth.uid() in (t.user_a, t.user_b)))
     or (p_kind = 'meetup' and not public.is_meetup_member(p_chat_id))
     or (p_kind = 'group' and public.group_joined_at(p_chat_id) is null) then
    raise exception 'not_found';
  end if;
  if p_what = 'pin' then
    insert into public.chat_state (user_id, chat_kind, chat_id, pinned_at) values (auth.uid(), p_kind, p_chat_id, v_at)
    on conflict (user_id, chat_kind, chat_id) do update set pinned_at = excluded.pinned_at;
  else
    insert into public.chat_state (user_id, chat_kind, chat_id, archived_at) values (auth.uid(), p_kind, p_chat_id, v_at)
    on conflict (user_id, chat_kind, chat_id) do update set archived_at = excluded.archived_at;
  end if;
end;
$$;

revoke execute on function public.set_chat_flag(text, uuid, text, boolean) from public, anon;
grant execute on function public.set_chat_flag(text, uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Inbox: pinned first, archived flagged
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
  unread_count integer,
  pinned boolean,
  archived boolean
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
              and dm.created_at > greatest(coalesce(cs.last_read_at, '-infinity'), coalesce(cs.hidden_at, '-infinity'))) as c_unread,
           -- A deleted private chat comes back unpinned and unarchived.
           cs.pinned_at is not null and cs.pinned_at > coalesce(cs.hidden_at, '-infinity') as c_pinned,
           cs.archived_at is not null and cs.archived_at > coalesce(cs.hidden_at, '-infinity') as c_archived
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
              and msg.created_at > greatest(coalesce(cs.last_read_at, '-infinity'), mm.joined_at)),
           cs.pinned_at is not null, cs.archived_at is not null
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
              and not public.is_blocked_between((select me.id from me), msg.sender_id)),
           cs.pinned_at is not null, cs.archived_at is not null
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
  order by chats.c_pinned desc, chats.c_last_at desc
  limit 300;
$$;

revoke execute on function public.my_chats() from public, anon;
grant execute on function public.my_chats() to authenticated;
