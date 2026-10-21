-- TableMeet emoji in chats, and reactions to messages.
--
-- * Emoji inside messages need no new columns: the app's emoji are stored as the emoji characters they stand for
--   (😂, 🍜, …), so notifications and the inbox read normally, and the app draws its own pictures. Greeting stickers
--   have no character and are stored as ":tm_<id>:" (e.g. ":tm_sawasdee:"); push_preview turns them into
--   "👋 Sawasdee".
-- * Reactions: press and hold a message in any chat (table / hangout, private, group) and pick one of the app's
--   emoji (stored by its id, e.g. 'fire'). One per person and message; picking another replaces it. Readable by
--   whoever can read the message (the message tables' own read rules apply through the subquery), never across a
--   block. Written only through react_to_message. Taking a reaction back sets emoji to null instead of deleting the
--   row, so Realtime delivers it (delete events skip RLS and filters).
--
-- Errors: auth_required, invalid_reaction, not_found.

create table public.chat_reactions (
  id uuid primary key default gen_random_uuid(),
  chat_kind text not null check (chat_kind in ('meetup', 'group', 'dm')),
  -- The meetup, group or private thread: lets the app load and listen to one chat's reactions.
  chat_id uuid not null,
  meetup_message_id uuid references public.meetup_messages (id) on delete cascade,
  group_message_id uuid references public.chat_group_messages (id) on delete cascade,
  direct_message_id uuid references public.direct_messages (id) on delete cascade,
  message_id uuid not null generated always as (coalesce(meetup_message_id, group_message_id, direct_message_id)) stored,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text check (emoji ~ '^[a-z]{2,16}$'),
  updated_at timestamptz not null default now(),
  check (
    case chat_kind
      when 'meetup' then meetup_message_id is not null and group_message_id is null and direct_message_id is null
      when 'group' then group_message_id is not null and meetup_message_id is null and direct_message_id is null
      when 'dm' then direct_message_id is not null and meetup_message_id is null and group_message_id is null
    end
  ),
  unique (message_id, user_id)
);

create index chat_reactions_chat_idx on public.chat_reactions (chat_kind, chat_id);
create index chat_reactions_user_idx on public.chat_reactions (user_id);
create index chat_reactions_meetup_message_idx on public.chat_reactions (meetup_message_id) where meetup_message_id is not null;
create index chat_reactions_group_message_idx on public.chat_reactions (group_message_id) where group_message_id is not null;
create index chat_reactions_direct_message_idx on public.chat_reactions (direct_message_id) where direct_message_id is not null;

alter table public.chat_reactions enable row level security;

create policy "People read reactions on messages they can read"
on public.chat_reactions for select to authenticated
using (
  not public.is_blocked_between((select auth.uid()), user_id)
  and case chat_kind
    when 'meetup' then exists (select 1 from public.meetup_messages m where m.id = meetup_message_id)
    when 'group' then exists (select 1 from public.chat_group_messages m where m.id = group_message_id)
    when 'dm' then exists (select 1 from public.direct_messages m where m.id = direct_message_id)
  end
);

-- Reacts to a message in a chat I can write in (p_emoji = an emoji id), or takes my reaction back (null).
-- Not on unsent messages, nor across a block.
create function public.react_to_message(p_chat_kind text, p_message_id uuid, p_emoji text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chat uuid;
  v_sender uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_emoji is not null and not (p_emoji = any (array[
    'happy', 'lol', 'love', 'sad', 'wow', 'angry', 'wink', 'yum', 'cool', 'sleepy', 'party', 'shy', 'thinking',
    'starstruck', 'oops', 'kiss',
    'thumbs', 'clap', 'fire', 'hundred', 'ok', 'heart', 'wavehand', 'sparkles', 'yay', 'check', 'question', 'eyes',
    'noodles', 'beer', 'coffee', 'pizza', 'cocktail', 'dumpling', 'sushi', 'taco', 'icecream', 'boba', 'burger', 'wine',
    'plane', 'backpack', 'mappin', 'passport', 'suitcase', 'globe', 'camera', 'sun', 'tuktuk', 'ticket', 'palm', 'compass',
    'cheers', 'table', 'seeyou', 'omw', 'checkin', 'friends', 'dance', 'highfive', 'selfie', 'splitbill', 'calendar', 'group'
  ])) then
    raise exception 'invalid_reaction';
  end if;

  -- The message, if I can read it (the same rules as the message tables' read policies).
  if p_chat_kind = 'meetup' then
    select m.meetup_id, m.sender_id into v_chat, v_sender
    from public.meetup_messages m
    where m.id = p_message_id and m.kind <> 'unsent';
  elsif p_chat_kind = 'group' then
    select m.group_id, m.sender_id into v_chat, v_sender
    from public.chat_group_messages m
    where m.id = p_message_id and m.kind <> 'unsent' and m.created_at >= public.group_joined_at(m.group_id);
  elsif p_chat_kind = 'dm' then
    select m.thread_id, m.sender_id into v_chat, v_sender
    from public.direct_messages m
    where m.id = p_message_id and m.kind <> 'unsent'
      and m.created_at > coalesce(public.my_chat_hidden_at('dm', m.thread_id), '-infinity'::timestamptz);
  end if;
  if v_chat is null or not public.chat_access(p_chat_kind, v_chat, true)
     or public.is_blocked_between(auth.uid(), v_sender) then
    raise exception 'not_found';
  end if;

  if p_emoji is null then
    update public.chat_reactions set emoji = null, updated_at = now()
    where message_id = p_message_id and user_id = auth.uid() and emoji is not null;
    return;
  end if;
  insert into public.chat_reactions (chat_kind, chat_id, meetup_message_id, group_message_id, direct_message_id, user_id, emoji)
  values (
    p_chat_kind,
    v_chat,
    case when p_chat_kind = 'meetup' then p_message_id end,
    case when p_chat_kind = 'group' then p_message_id end,
    case when p_chat_kind = 'dm' then p_message_id end,
    auth.uid(),
    p_emoji
  )
  on conflict (message_id, user_id) do update set emoji = excluded.emoji, updated_at = now();
end;
$$;

revoke execute on function public.react_to_message(text, uuid, text) from public, anon;
grant execute on function public.react_to_message(text, uuid, text) to authenticated;

alter publication supabase_realtime add table public.chat_reactions;

-- ---------------------------------------------------------------------------
-- Notifications: greeting stickers as words
-- ---------------------------------------------------------------------------

create or replace function public.push_preview(p_kind text, p_body text, p_language text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := coalesce(p_body, '');
  v_greeting record;
begin
  if p_kind = 'photo' then
    return case when p_language = 'th' then '📷 รูปภาพ' else '📷 Photo' end;
  elsif p_kind = 'voice' then
    return case when p_language = 'th' then '🎤 ข้อความเสียง' else '🎤 Voice message' end;
  elsif p_kind = 'location' then
    return case when p_language = 'th' then '📍 ตำแหน่งสด' else '📍 Live location' end;
  end if;
  if v_text like '%:tm\_%' then
    for v_greeting in
      select * from (values
        ('sawasdee', 'Sawasdee', 'สวัสดี'), ('hola', 'Hola', 'Hola'), ('ciao', 'Ciao', 'Ciao'),
        ('bonjour', 'Bonjour', 'Bonjour'), ('konnichiwa', 'Konnichiwa', 'Konnichiwa'),
        ('annyeong', 'Annyeong', 'Annyeong'), ('namaste', 'Namaste', 'Namaste'), ('xinchao', 'Xin chào', 'Xin chào')
      ) as g (id, word_en, word_th)
    loop
      v_text := replace(v_text, ':tm_' || v_greeting.id || ':',
        '👋 ' || case when p_language = 'th' then v_greeting.word_th else v_greeting.word_en end);
    end loop;
  end if;
  return left(v_text, 160);
end;
$$;
