-- Messages (founder, 2026-10-17): one inbox on home for private chats, group chats and table / hangout chats, with an
-- unread badge, plus group chats people create themselves.
--
-- * chat_state: per person and chat, when they last read it and when they hid / left it (no API access; functions
--   only). Unread = messages from others newer than the last read (and, for tables / hangouts / groups, than when
--   they joined).
-- * Private chats: "Delete chat" hides it for me only; it comes back when a new message arrives, showing only the
--   messages after the delete (the other person keeps everything).
-- * Table and hangout chats stay after the table / hangout ends or is cancelled, until the member leaves the chat
--   (allowed once it has ended or been cancelled; before that they leave the table itself). After leaving they can no
--   longer read or write it.
-- * Group chats: a name + an emoji, up to 100 people. Only friends (mutual follows) can be added; any member can add
--   their own friends; only the owner (the creator, or the longest member after the owner leaves) can remove people,
--   rename the group or change its emoji. New members see messages from when they joined. Blocked senders' messages
--   are hidden.
-- * The bell no longer lists chat and private messages (they count on the Messages button); message requests stay.
-- Error keys: auth_required, not_allowed, not_found, name_required, emoji_required, invalid_size, not_friends,
-- group_full, not_owner, meetup_not_ended.

-- ---------------------------------------------------------------------------
-- Read / hidden state
-- ---------------------------------------------------------------------------

create table public.chat_state (
  user_id uuid not null references public.profiles (id) on delete cascade,
  chat_kind text not null check (chat_kind in ('dm', 'meetup', 'group')),
  chat_id uuid not null,
  last_read_at timestamptz,
  -- dm: hidden ("deleted") at; meetup: left the chat at.
  hidden_at timestamptz,
  primary key (user_id, chat_kind, chat_id)
);

alter table public.chat_state enable row level security;
revoke all on public.chat_state from anon, authenticated;

-- Everything sent before this feature counts as read.
insert into public.chat_state (user_id, chat_kind, chat_id, last_read_at)
select mm.user_id, 'meetup', mm.meetup_id, now() from public.meetup_members mm
union all
select t.user_a, 'dm', t.id, now() from public.direct_threads t
union all
select t.user_b, 'dm', t.id, now() from public.direct_threads t
on conflict do nothing;

-- When I hid / left this chat (for policies, which can't read chat_state themselves).
create function public.my_chat_hidden_at(p_kind text, p_chat_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select s.hidden_at from public.chat_state s
  where s.user_id = (select auth.uid()) and s.chat_kind = p_kind and s.chat_id = p_chat_id;
$$;

revoke execute on function public.my_chat_hidden_at(text, uuid) from public, anon;
grant execute on function public.my_chat_hidden_at(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Table / hangout chats: readable until the member leaves the chat
-- ---------------------------------------------------------------------------

create function public.in_meetup_chat(p_meetup_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_meetup_member(p_meetup_id) and public.my_chat_hidden_at('meetup', p_meetup_id) is null;
$$;

revoke execute on function public.in_meetup_chat(uuid) from public, anon;
grant execute on function public.in_meetup_chat(uuid) to authenticated;

drop policy "Members read their table chat" on public.meetup_messages;
drop policy "Members write in their table chat" on public.meetup_messages;

create policy "Members read their table chat"
on public.meetup_messages for select to authenticated
using ((select public.in_meetup_chat(meetup_id)));

create policy "Members write in their table chat"
on public.meetup_messages for insert to authenticated
with check (sender_id = (select auth.uid()) and (select public.in_meetup_chat(meetup_id)));

-- ---------------------------------------------------------------------------
-- Private chats: after "Delete chat" only newer messages show
-- ---------------------------------------------------------------------------

drop policy "Participants read their messages" on public.direct_messages;

create policy "Participants read their messages"
on public.direct_messages for select to authenticated
using (
  exists (
    select 1 from public.direct_threads t
    where t.id = thread_id
      and (select auth.uid()) in (t.user_a, t.user_b)
      and not public.is_blocked_between(t.user_a, t.user_b)
  )
  and created_at > coalesce(public.my_chat_hidden_at('dm', thread_id), '-infinity'::timestamptz)
);

-- ---------------------------------------------------------------------------
-- Group chats
-- ---------------------------------------------------------------------------

create table public.chat_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 50),
  emoji text not null check (length(emoji) between 1 and 16),
  owner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table public.chat_group_members (
  group_id uuid not null references public.chat_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index chat_group_members_user_idx on public.chat_group_members (user_id);

create table public.chat_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chat_groups (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index chat_group_messages_group_idx on public.chat_group_messages (group_id, created_at);

alter table public.chat_groups enable row level security;
alter table public.chat_group_members enable row level security;
alter table public.chat_group_messages enable row level security;

-- Groups and members change only through the functions below; messages are only ever added.
revoke insert, update, delete on public.chat_groups, public.chat_group_members from anon, authenticated;
revoke update, delete on public.chat_group_messages from anon, authenticated;
revoke all on public.chat_groups, public.chat_group_members, public.chat_group_messages from anon;

-- When I joined the group, or null if I'm not in it.
create function public.group_joined_at(p_group_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select gm.joined_at from public.chat_group_members gm
  where gm.group_id = p_group_id and gm.user_id = (select auth.uid());
$$;

revoke execute on function public.group_joined_at(uuid) from public, anon;
grant execute on function public.group_joined_at(uuid) to authenticated;

create policy "Members read their groups"
on public.chat_groups for select to authenticated
using ((select public.group_joined_at(id)) is not null);

create policy "Members see who is in their groups"
on public.chat_group_members for select to authenticated
using ((select public.group_joined_at(group_id)) is not null);

create policy "Members read group messages since they joined"
on public.chat_group_messages for select to authenticated
using (
  created_at >= (select public.group_joined_at(group_id))
  and not public.is_blocked_between((select auth.uid()), sender_id)
);

create policy "Members write in their groups"
on public.chat_group_messages for insert to authenticated
with check (sender_id = (select auth.uid()) and (select public.group_joined_at(group_id)) is not null);

-- The inbox sorts by the latest message.
create function public.chat_groups_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_groups set last_message_at = new.created_at where id = new.group_id;
  return new;
end;
$$;

create trigger chat_group_messages_touch
after insert on public.chat_group_messages
for each row execute function public.chat_groups_touch();

-- Friends = people who follow each other (and haven't blocked each other).
create function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_a <> p_b
    and exists (select 1 from public.follows f where f.follower_id = p_a and f.followee_id = p_b)
    and exists (select 1 from public.follows f where f.follower_id = p_b and f.followee_id = p_a)
    and not public.is_blocked_between(p_a, p_b);
$$;

revoke execute on function public.are_friends(uuid, uuid) from public, anon;

-- My friends, for picking group members.
create function public.my_friends()
returns table (id uuid, display_name text, avatar_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.avatar_path
  from public.follows f
  join public.profiles p on p.id = f.followee_id
  where f.follower_id = (select auth.uid())
    and public.are_friends((select auth.uid()), f.followee_id)
  order by lower(p.display_name);
$$;

-- Checks the people the caller wants to add: real, distinct, not the caller, and the caller's friends.
create function public.group_check_friends(p_user_ids uuid[])
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(distinct x), '{}') into v_ids
  from unnest(coalesce(p_user_ids, '{}')) as x
  where x is not null and x <> auth.uid();
  if exists (select 1 from unnest(v_ids) as x where not public.are_friends(auth.uid(), x)) then
    raise exception 'not_friends';
  end if;
  return v_ids;
end;
$$;

revoke execute on function public.group_check_friends(uuid[]) from public, anon, authenticated;

create function public.create_group_chat(p_name text, p_emoji text, p_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := left(trim(coalesce(p_name, '')), 50);
  v_emoji text := trim(coalesce(p_emoji, ''));
  v_ids uuid[];
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if not public.meetup_caller_allowed() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'name_required';
  end if;
  if length(v_emoji) not between 1 and 16 then
    raise exception 'emoji_required';
  end if;
  v_ids := public.group_check_friends(p_member_ids);
  if cardinality(v_ids) not between 1 and 99 then
    raise exception 'invalid_size';
  end if;

  insert into public.chat_groups (name, emoji, owner_id) values (v_name, v_emoji, v_uid) returning id into v_id;
  insert into public.chat_group_members (group_id, user_id, added_by)
  select v_id, x, v_uid from unnest(array_prepend(v_uid, v_ids)) as x;
  return v_id;
end;
$$;

-- Any member adds their own friends (up to 100 people in the group).
create function public.add_group_members(p_group_id uuid, p_member_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  -- Lock the group so two people adding at once can't pass 100.
  perform 1 from public.chat_groups g where g.id = p_group_id for update;
  if public.group_joined_at(p_group_id) is null then
    raise exception 'not_found';
  end if;
  v_ids := public.group_check_friends(p_member_ids);
  if (select count(*) from public.chat_group_members gm where gm.group_id = p_group_id)
     + (select count(*) from unnest(v_ids) as x
        where not exists (select 1 from public.chat_group_members gm where gm.group_id = p_group_id and gm.user_id = x))
     > 100 then
    raise exception 'group_full';
  end if;
  insert into public.chat_group_members (group_id, user_id, added_by)
  select p_group_id, x, auth.uid() from unnest(v_ids) as x
  on conflict do nothing;
end;
$$;

-- Only the owner removes people (not themselves: they leave).
create function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.chat_groups g where g.id = p_group_id and g.owner_id = auth.uid()) then
    raise exception 'not_owner';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'not_found';
  end if;
  delete from public.chat_group_members gm where gm.group_id = p_group_id and gm.user_id = p_user_id;
  delete from public.chat_state s where s.user_id = p_user_id and s.chat_kind = 'group' and s.chat_id = p_group_id;
end;
$$;

create function public.rename_group(p_group_id uuid, p_name text, p_emoji text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(trim(coalesce(p_name, '')), 50);
  v_emoji text := trim(coalesce(p_emoji, ''));
begin
  if v_name = '' then
    raise exception 'name_required';
  end if;
  if length(v_emoji) not between 1 and 16 then
    raise exception 'emoji_required';
  end if;
  update public.chat_groups g set name = v_name, emoji = v_emoji where g.id = p_group_id and g.owner_id = auth.uid();
  if not found then
    raise exception 'not_owner';
  end if;
end;
$$;

-- Leave a group. The owner's role passes to the longest member; the last one out deletes the group.
create function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  perform 1 from public.chat_groups g where g.id = p_group_id for update;
  delete from public.chat_group_members gm where gm.group_id = p_group_id and gm.user_id = v_uid;
  if not found then
    raise exception 'not_found';
  end if;
  delete from public.chat_state s where s.user_id = v_uid and s.chat_kind = 'group' and s.chat_id = p_group_id;
  if not exists (select 1 from public.chat_group_members gm where gm.group_id = p_group_id) then
    delete from public.chat_groups g where g.id = p_group_id;
  else
    update public.chat_groups g
    set owner_id = (
      select gm.user_id from public.chat_group_members gm
      where gm.group_id = p_group_id order by gm.joined_at, gm.user_id limit 1
    )
    where g.id = p_group_id and (g.owner_id = v_uid or g.owner_id is null);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Inbox, read and leave / delete
-- ---------------------------------------------------------------------------

-- All my chats, newest first: private chats (not hidden, or with a newer message), table / hangout chats I haven't
-- left (also after they end), and my groups, with the latest message and how many messages I haven't read.
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
           lm.body as c_body, lm.sender_id as c_sender, sp.display_name as c_sender_name,
           coalesce(lm.created_at, t.last_message_at) as c_last_at,
           (select count(*)::integer from public.direct_messages dm
            where dm.thread_id = t.id and dm.sender_id <> (select me.id from me)
              and dm.created_at > greatest(coalesce(cs.last_read_at, '-infinity'), coalesce(cs.hidden_at, '-infinity'))) as c_unread
    from public.direct_threads t
    join public.profiles o on o.id = case when t.user_a = (select me.id from me) then t.user_b else t.user_a end
    left join public.chat_state cs
      on cs.user_id = (select me.id from me) and cs.chat_kind = 'dm' and cs.chat_id = t.id
    left join lateral (
      select dm.body, dm.sender_id, dm.created_at from public.direct_messages dm
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
           lm.body, lm.sender_id, sp.display_name, coalesce(lm.created_at, mm.joined_at),
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
      select msg.body, msg.sender_id, msg.created_at from public.meetup_messages msg
      where msg.meetup_id = m.id order by msg.created_at desc limit 1
    ) lm on true
    left join public.profiles sp on sp.id = lm.sender_id
    where mm.user_id = (select me.id from me) and cs.hidden_at is null

    union all

    -- Group chats
    select 'group', g.id, g.name, g.emoji, null, null, null, null,
           null, null, null, null, null, null, null, false, false,
           (select count(*)::integer from public.chat_group_members x where x.group_id = g.id), g.owner_id,
           lm.body, lm.sender_id, sp.display_name, coalesce(lm.created_at, gm.joined_at),
           (select count(*)::integer from public.chat_group_messages msg
            where msg.group_id = g.id and msg.sender_id <> (select me.id from me)
              and msg.created_at > greatest(coalesce(cs.last_read_at, '-infinity'), gm.joined_at)
              and not public.is_blocked_between((select me.id from me), msg.sender_id))
    from public.chat_group_members gm
    join public.chat_groups g on g.id = gm.group_id
    left join public.chat_state cs
      on cs.user_id = (select me.id from me) and cs.chat_kind = 'group' and cs.chat_id = g.id
    left join lateral (
      select msg.body, msg.sender_id, msg.created_at from public.chat_group_messages msg
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

-- I've read this chat up to now.
create function public.mark_chat_read(p_kind text, p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_kind not in ('dm', 'meetup', 'group') then
    return;
  end if;
  if (p_kind = 'dm' and not exists (
        select 1 from public.direct_threads t where t.id = p_chat_id and auth.uid() in (t.user_a, t.user_b)))
     or (p_kind = 'meetup' and not public.is_meetup_member(p_chat_id))
     or (p_kind = 'group' and public.group_joined_at(p_chat_id) is null) then
    return;
  end if;
  insert into public.chat_state (user_id, chat_kind, chat_id, last_read_at)
  values (auth.uid(), p_kind, p_chat_id, now())
  on conflict (user_id, chat_kind, chat_id) do update set last_read_at = excluded.last_read_at;
end;
$$;

-- Delete a private chat (for me; it returns with the next message), leave a table / hangout chat once it has ended
-- or been cancelled, or leave a group.
create function public.leave_chat(p_kind text, p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_kind = 'group' then
    perform public.leave_group(p_chat_id);
    return;
  elsif p_kind = 'dm' then
    if not exists (select 1 from public.direct_threads t where t.id = p_chat_id and auth.uid() in (t.user_a, t.user_b)) then
      raise exception 'not_found';
    end if;
  elsif p_kind = 'meetup' then
    if not public.is_meetup_member(p_chat_id) then
      raise exception 'not_found';
    end if;
    if exists (select 1 from public.meetups m where m.id = p_chat_id and m.status = 'open' and m.ends_at > now()) then
      raise exception 'meetup_not_ended';
    end if;
  else
    raise exception 'not_found';
  end if;
  insert into public.chat_state (user_id, chat_kind, chat_id, last_read_at, hidden_at)
  values (auth.uid(), p_kind, p_chat_id, now(), now())
  on conflict (user_id, chat_kind, chat_id) do update set hidden_at = excluded.hidden_at, last_read_at = excluded.last_read_at;
end;
$$;

revoke execute on function public.my_friends() from public, anon;
revoke execute on function public.create_group_chat(text, text, uuid[]) from public, anon;
revoke execute on function public.add_group_members(uuid, uuid[]) from public, anon;
revoke execute on function public.remove_group_member(uuid, uuid) from public, anon;
revoke execute on function public.rename_group(uuid, text, text) from public, anon;
revoke execute on function public.leave_group(uuid) from public, anon;
revoke execute on function public.my_chats() from public, anon;
revoke execute on function public.mark_chat_read(text, uuid) from public, anon;
revoke execute on function public.leave_chat(text, uuid) from public, anon;
grant execute on function public.my_friends() to authenticated;
grant execute on function public.create_group_chat(text, text, uuid[]) to authenticated;
grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.rename_group(uuid, text, text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.my_chats() to authenticated;
grant execute on function public.mark_chat_read(text, uuid) to authenticated;
grant execute on function public.leave_chat(text, uuid) to authenticated;
revoke execute on function public.chat_groups_touch() from public, anon, authenticated;

alter publication supabase_realtime add table public.chat_groups, public.chat_group_members, public.chat_group_messages;

-- The bell: as before without chat and private messages (they are on the Messages button); requests stay.
create or replace function public.my_notifications(
  p_limit integer default 60,
  p_lat double precision default null,
  p_lng double precision default null
)
returns table (
  id text,
  kind text,
  at timestamptz,
  actor_id uuid,
  actor_name text,
  actor_avatar text,
  meetup_id uuid,
  meetup_kind text,
  title text,
  place_name text,
  place_name_en text,
  place_name_th text,
  venue_id uuid,
  venue_name_en text,
  venue_name_th text,
  venue_category text,
  promo_kind text,
  promo_title_en text,
  promo_title_th text,
  body text,
  unread boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as id,
           coalesce((select s.seen_at from public.notification_state s where s.user_id = (select auth.uid())),
                    '-infinity'::timestamptz) as seen
  ),
  my_meetups as (
    select mm.meetup_id from public.meetup_members mm where mm.user_id = (select me.id from me)
  ),
  items as (
    -- New tables and hangouts near me by others that are still open.
    select 'meetup:' || m.id as id,
           case when m.kind = 'hangout' then 'new_hangout' else 'new_table' end as kind,
           m.created_at as at, m.host_id as actor_id, m.id as meetup_id, null::text as body,
           null::uuid as deal_id
    from public.meetups m
    left join public.venues v on v.id = m.venue_id
    left join public.places pl on pl.id = m.place_id
    cross join lateral (
      select coalesce(v.lat, pl.lat, m.spot_lat) as lat, coalesce(v.lng, pl.lng, m.spot_lng) as lng
    ) at_
    where m.host_id <> (select me.id from me)
      and m.status = 'open' and m.ends_at > now()
      and m.created_at > now() - interval '7 days'
      and (m.venue_id is null or v.is_active)
      and case
            when p_lat is null or p_lng is null then public.in_bangkok(at_.lat, at_.lng)
            else extensions.st_dwithin(
                   extensions.st_setsrid(extensions.st_makepoint(at_.lng, at_.lat), 4326)::extensions.geography,
                   extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
                   50000)
          end
    union all
    -- People who joined my tables and hangouts.
    select 'join:' || mm.meetup_id || ':' || mm.user_id, 'joined', mm.joined_at, mm.user_id, m.id, null, null
    from public.meetup_members mm
    join public.meetups m on m.id = mm.meetup_id
    where m.host_id = (select me.id from me) and mm.user_id <> m.host_id
      and m.status = 'open'
      and mm.joined_at > now() - interval '14 days'
    union all
    -- Message requests waiting for me (other messages count on the Messages button instead).
    select * from (
      select distinct on (t.id)
             'dm:' || t.id,
             'dm_request',
             dm.created_at, dm.sender_id, null::uuid, left(dm.body, 140), null::uuid
      from public.direct_threads t
      join public.direct_messages dm on dm.thread_id = t.id
      where (select me.id from me) in (t.user_a, t.user_b)
        and t.status = 'pending' and t.requested_by <> (select me.id from me)
        and dm.sender_id <> (select me.id from me)
        and dm.created_at > now() - interval '14 days'
      order by t.id, dm.created_at desc
    ) dms
    union all
    -- New followers.
    select 'follow:' || f.follower_id, 'follow', f.created_at, f.follower_id, null, null, null
    from public.follows f
    where f.followee_id = (select me.id from me)
      and f.created_at > now() - interval '30 days'
    union all
    -- New promotions at partner venues that haven't ended.
    select 'promo:' || d.id, 'promotion', d.created_at, null, null, null, d.id
    from public.deals d
    join public.venues v on v.id = d.venue_id
    where d.is_active and v.is_active
      and (d.ends_at is null or d.ends_at > now())
      and d.created_at > now() - interval '30 days'
  )
  select i.id, i.kind, i.at, i.actor_id, a.display_name, a.avatar_path,
         i.meetup_id, m.kind::text, m.title,
         coalesce(pl.name, m.spot_name), pl.name_en, pl.name_th,
         coalesce(dv.id, mv.id), coalesce(dv.name_en, mv.name_en), coalesce(dv.name_th, mv.name_th),
         coalesce(dv.category, mv.category)::text,
         d.kind::text, d.title_en, d.title_th,
         i.body,
         i.at > (select me.seen from me)
  from items i
  left join public.profiles a on a.id = i.actor_id
  left join public.meetups m on m.id = i.meetup_id
  left join public.places pl on pl.id = m.place_id
  left join public.venues mv on mv.id = m.venue_id
  left join public.deals d on d.id = i.deal_id
  left join public.venues dv on dv.id = d.venue_id
  where (select me.id from me) is not null
    and (i.actor_id is null or not public.is_blocked_between((select me.id from me), i.actor_id))
  order by i.at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 100);
$$;

