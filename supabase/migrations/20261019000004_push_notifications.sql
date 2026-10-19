-- Phone (push) notifications (founder, 2026-10-19). What's in the app also reaches the phone:
--   * Messages: private messages (and message requests), group chats, table / hangout chats.
--   * My tables & hangouts: someone joins one I host.
--   * Social: new followers.
--   * New tables & hangouts near me (within 50 km of my rough area), max 3 a day.
--   * New promotions at partner venues, to everyone, max 1 a day.
-- Never for my own actions, never across a block, never for a table / hangout chat I've left.
--
-- * push_devices: the phone's Expo push token, its app language (en / th, for the text) and, only if location is
--   allowed, a rough area rounded to 0.1° (about 11 km) for "near me". No API access; the app calls
--   register_push_device / unregister_push_device. Deleted with the account.
-- * Sending: triggers call push_send, which posts to Expo's push service (https://exp.host, free, no key) with pg_net.
--   Expo delivers through Firebase Cloud Messaging on Android (the FCM key is set in the Expo project, README).
--   push_send never raises: a failed notification can't block the message, join or follow that caused it.
-- * push_log: what was sent when, for the daily limits.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end;
$$;

create table public.push_devices (
  token text primary key check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  language text not null default 'en' check (language in ('en', 'th')),
  area_lat double precision check (area_lat between -90 and 90),
  area_lng double precision check (area_lng between -180 and 180),
  updated_at timestamptz not null default now()
);

create index push_devices_user_idx on public.push_devices (user_id);

alter table public.push_devices enable row level security;
revoke all on public.push_devices from anon, authenticated;

create table public.push_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);

create index push_log_user_idx on public.push_log (user_id, kind, created_at desc);

alter table public.push_log enable row level security;
revoke all on public.push_log from anon, authenticated;

-- Saves this phone for my notifications (a token used by someone else before moves to me). Keeps my 10 newest
-- phones. Errors: auth_required, invalid_device.
create function public.register_push_device(
  p_token text,
  p_platform text,
  p_language text,
  p_lat double precision,
  p_lng double precision
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_lat double precision;
  v_lng double precision;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$'
     or p_platform not in ('android', 'ios') then
    raise exception 'invalid_device';
  end if;
  if p_lat between -90 and 90 and p_lng between -180 and 180 then
    v_lat := round(p_lat::numeric, 1)::double precision;
    v_lng := round(p_lng::numeric, 1)::double precision;
  end if;

  insert into public.push_devices (token, user_id, platform, language, area_lat, area_lng, updated_at)
  values (p_token, v_uid, p_platform, case when p_language = 'th' then 'th' else 'en' end, v_lat, v_lng, now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        language = excluded.language,
        -- Without a new location, keep the last rough area only if the phone stays with the same person.
        area_lat = case when excluded.area_lat is not null then excluded.area_lat
                        when public.push_devices.user_id = excluded.user_id then public.push_devices.area_lat end,
        area_lng = case when excluded.area_lng is not null then excluded.area_lng
                        when public.push_devices.user_id = excluded.user_id then public.push_devices.area_lng end,
        updated_at = now();

  delete from public.push_devices d
  where d.user_id = v_uid
    and d.token not in (
      select x.token from public.push_devices x where x.user_id = v_uid order by x.updated_at desc limit 10
    );
end;
$$;

revoke execute on function public.register_push_device(text, text, text, double precision, double precision) from public, anon;
grant execute on function public.register_push_device(text, text, text, double precision, double precision) to authenticated;

-- This phone stops getting my notifications (turned off in Settings, or signing out).
create function public.unregister_push_device(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_devices d where d.token = p_token and d.user_id = (select auth.uid());
$$;

revoke execute on function public.unregister_push_device(text) from public, anon;
grant execute on function public.unregister_push_device(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Sending
-- ---------------------------------------------------------------------------

-- Sends one notification to every phone of p_user, in each phone's language. p_kind 'nearby' is limited to 3 and
-- 'promotion' to 1 per person per 24 hours. Does nothing without pg_net (tests) or phones. Never raises.
create function public.push_send(
  p_user uuid,
  p_kind text,
  p_title_en text,
  p_body_en text,
  p_title_th text,
  p_body_th text,
  p_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_messages jsonb;
  v_daily_limit integer;
begin
  if p_user is null then
    return;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'net' and p.proname = 'http_post'
  ) then
    return;
  end if;
  v_daily_limit := case p_kind when 'nearby' then 3 when 'promotion' then 1 end;
  if v_daily_limit is not null and (
    select count(*) from public.push_log l
    where l.user_id = p_user and l.kind = p_kind and l.created_at > now() - interval '24 hours'
  ) >= v_daily_limit then
    return;
  end if;

  select jsonb_agg(jsonb_build_object(
           'to', d.token,
           'title', left(case when d.language = 'th' then p_title_th else p_title_en end, 120),
           'body', left(case when d.language = 'th' then p_body_th else p_body_en end, 240),
           'sound', 'default',
           'priority', 'high',
           'channelId', 'default',
           'data', jsonb_build_object('url', p_url)
         ))
  into v_messages
  from public.push_devices d
  where d.user_id = p_user;
  if v_messages is null then
    return;
  end if;

  insert into public.push_log (user_id, kind) values (p_user, p_kind);
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := v_messages,
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
  );
exception when others then
  raise warning 'push_send failed: %', sqlerrm;
end;
$$;

revoke execute on function public.push_send(uuid, text, text, text, text, text, text) from public, anon, authenticated;

-- A chat message as notification text: the text itself, or "📷 Photo" etc. for attachments.
create function public.push_preview(p_kind text, p_body text, p_language text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'photo' then case when p_language = 'th' then '📷 รูปภาพ' else '📷 Photo' end
    when 'voice' then case when p_language = 'th' then '🎤 ข้อความเสียง' else '🎤 Voice message' end
    when 'location' then case when p_language = 'th' then '📍 ตำแหน่งสด' else '📍 Live location' end
    else left(coalesce(p_body, ''), 160)
  end;
$$;

-- A table / hangout's name for notifications: its title, else the venue / place / spot.
create function public.push_meetup_label(p_meetup_id uuid, p_language text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(trim(m.title), ''),
    case when p_language = 'th' then coalesce(v.name_th, pl.name_th) else coalesce(v.name_en, pl.name_en) end,
    pl.name,
    m.spot_name,
    case when m.kind = 'hangout' then case when p_language = 'th' then 'แฮงเอาท์' else 'Hangout' end
         else case when p_language = 'th' then 'โต๊ะ' else 'Table' end end
  )
  from public.meetups m
  left join public.venues v on v.id = m.venue_id
  left join public.places pl on pl.id = m.place_id
  where m.id = p_meetup_id;
$$;

revoke execute on function public.push_meetup_label(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Table / hangout chat: the other members who haven't left the chat.
create function public.push_on_meetup_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  r record;
begin
  begin
    select p.display_name into v_name from public.profiles p where p.id = new.sender_id;
    for r in
      select mm.user_id from public.meetup_members mm
      where mm.meetup_id = new.meetup_id and mm.user_id <> new.sender_id
        and not exists (
          select 1 from public.chat_state cs
          where cs.user_id = mm.user_id and cs.chat_kind = 'meetup' and cs.chat_id = new.meetup_id
            and cs.hidden_at is not null
        )
        and not public.is_blocked_between(mm.user_id, new.sender_id)
    loop
      perform public.push_send(
        r.user_id, 'chat',
        public.push_meetup_label(new.meetup_id, 'en'), v_name || ': ' || public.push_preview(new.kind, new.body, 'en'),
        public.push_meetup_label(new.meetup_id, 'th'), v_name || ': ' || public.push_preview(new.kind, new.body, 'th'),
        '/table-chat/' || new.meetup_id
      );
    end loop;
  exception when others then
    raise warning 'push_on_meetup_message failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger meetup_messages_push after insert on public.meetup_messages
for each row execute function public.push_on_meetup_message();

-- Private message: the other person (a first message is a message request).
create function public.push_on_direct_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread public.direct_threads%rowtype;
  v_to uuid;
  v_name text;
  v_request boolean;
begin
  begin
    select * into v_thread from public.direct_threads t where t.id = new.thread_id;
    v_to := case when v_thread.user_a = new.sender_id then v_thread.user_b else v_thread.user_a end;
    if v_to is not null and not public.is_blocked_between(v_to, new.sender_id) then
      select p.display_name into v_name from public.profiles p where p.id = new.sender_id;
      v_request := v_thread.status::text = 'pending' and v_thread.requested_by = new.sender_id;
      perform public.push_send(
        v_to, 'chat',
        case when v_request then 'Message request from ' || v_name else v_name end,
        public.push_preview(new.kind, new.body, 'en'),
        case when v_request then 'คำขอส่งข้อความจาก ' || v_name else v_name end,
        public.push_preview(new.kind, new.body, 'th'),
        '/dm/' || new.sender_id
      );
    end if;
  exception when others then
    raise warning 'push_on_direct_message failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger direct_messages_push after insert on public.direct_messages
for each row execute function public.push_on_direct_message();

-- Group chat: the other members.
create function public.push_on_group_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group text;
  v_name text;
  r record;
begin
  begin
    select g.emoji || ' ' || g.name into v_group from public.chat_groups g where g.id = new.group_id;
    select p.display_name into v_name from public.profiles p where p.id = new.sender_id;
    for r in
      select gm.user_id from public.chat_group_members gm
      where gm.group_id = new.group_id and gm.user_id <> new.sender_id
        and not public.is_blocked_between(gm.user_id, new.sender_id)
    loop
      perform public.push_send(
        r.user_id, 'chat',
        v_group, v_name || ': ' || public.push_preview(new.kind, new.body, 'en'),
        v_group, v_name || ': ' || public.push_preview(new.kind, new.body, 'th'),
        '/group/' || new.group_id
      );
    end loop;
  exception when others then
    raise warning 'push_on_group_message failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger chat_group_messages_push after insert on public.chat_group_messages
for each row execute function public.push_on_group_message();

-- Someone joins a table / hangout I host.
create function public.push_on_join()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meetup public.meetups%rowtype;
  v_name text;
begin
  begin
    select * into v_meetup from public.meetups m where m.id = new.meetup_id;
    if v_meetup.host_id is not null and v_meetup.host_id <> new.user_id and v_meetup.status = 'open'
       and not public.is_blocked_between(v_meetup.host_id, new.user_id) then
      select p.display_name into v_name from public.profiles p where p.id = new.user_id;
      perform public.push_send(
        v_meetup.host_id, 'joined',
        'New member',
        v_name || ' joined your ' || case when v_meetup.kind = 'hangout' then 'hangout' else 'table' end
          || ' "' || public.push_meetup_label(v_meetup.id, 'en') || '"',
        'มีคนเข้าร่วม',
        v_name || ' เข้าร่วม' || case when v_meetup.kind = 'hangout' then 'แฮงเอาท์' else 'โต๊ะ' end
          || 'ของคุณ "' || public.push_meetup_label(v_meetup.id, 'th') || '"',
        '/table/' || v_meetup.id
      );
    end if;
  exception when others then
    raise warning 'push_on_join failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger meetup_members_push after insert on public.meetup_members
for each row execute function public.push_on_join();

-- New follower.
create function public.push_on_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  begin
    if not public.is_blocked_between(new.followee_id, new.follower_id) then
      select p.display_name into v_name from public.profiles p where p.id = new.follower_id;
      perform public.push_send(
        new.followee_id, 'follow',
        'New follower', v_name || ' started following you',
        'ผู้ติดตามใหม่', v_name || ' เริ่มติดตามคุณ',
        '/profile/' || new.follower_id
      );
    end if;
  exception when others then
    raise warning 'push_on_follow failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger follows_push after insert on public.follows
for each row execute function public.push_on_follow();

-- A new table / hangout: people whose rough area is within 50 km (max 3 such notifications a day each).
create function public.push_on_new_meetup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lat double precision;
  v_lng double precision;
  v_active boolean := true;
  v_when text;
  r record;
begin
  begin
    if new.status <> 'open' then
      return null;
    end if;
    if new.venue_id is not null then
      select v.lat, v.lng, v.is_active into v_lat, v_lng, v_active from public.venues v where v.id = new.venue_id;
    elsif new.place_id is not null then
      select pl.lat, pl.lng into v_lat, v_lng from public.places pl where pl.id = new.place_id;
    else
      v_lat := new.spot_lat;
      v_lng := new.spot_lng;
    end if;
    if v_lat is null or v_lng is null or not coalesce(v_active, false) then
      return null;
    end if;
    v_when := to_char(new.starts_at at time zone coalesce(new.time_zone, 'Asia/Bangkok'), 'DD/MM HH24:MI');

    for r in
      select distinct d.user_id from public.push_devices d
      where d.user_id <> new.host_id and d.area_lat is not null
        and extensions.st_dwithin(
              extensions.st_setsrid(extensions.st_makepoint(d.area_lng, d.area_lat), 4326)::extensions.geography,
              extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography,
              50000)
        and not public.is_blocked_between(d.user_id, new.host_id)
    loop
      perform public.push_send(
        r.user_id, 'nearby',
        case when new.kind = 'hangout' then 'New hangout near you' else 'New table near you' end,
        public.push_meetup_label(new.id, 'en') || ' · ' || v_when,
        case when new.kind = 'hangout' then 'แฮงเอาท์ใหม่ใกล้คุณ' else 'โต๊ะใหม่ใกล้คุณ' end,
        public.push_meetup_label(new.id, 'th') || ' · ' || v_when,
        '/table/' || new.id
      );
    end loop;
  exception when others then
    raise warning 'push_on_new_meetup failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger meetups_push after insert on public.meetups
for each row execute function public.push_on_new_meetup();

-- A new promotion at an active partner venue: everyone with a phone (max 1 such notification a day each).
create function public.push_on_new_deal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venue public.venues%rowtype;
  v_url text;
  r record;
begin
  begin
    if not new.is_active then
      return null;
    end if;
    select * into v_venue from public.venues v where v.id = new.venue_id;
    if not coalesce(v_venue.is_active, false) then
      return null;
    end if;
    v_url := case when v_venue.category::text in ('attraction', 'park', 'mall', 'museum', 'temple', 'market', 'entertainment')
                  then '/create-hangout?venueId=' else '/create-table?venueId=' end || v_venue.id;
    for r in select distinct d.user_id from public.push_devices d loop
      perform public.push_send(
        r.user_id, 'promotion',
        v_venue.name_en, new.title_en,
        v_venue.name_th, new.title_th,
        v_url
      );
    end loop;
  exception when others then
    raise warning 'push_on_new_deal failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger deals_push after insert on public.deals
for each row execute function public.push_on_new_deal();
