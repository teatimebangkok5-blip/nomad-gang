-- Private tables / hangouts, story audience, nearby notifications within 20 km (founder, 2026-10-19).
--
-- * meetups.join_mode: 'open' (anyone joins, as before) or 'private' (people send a join request and only the host
--   approves or declines). Set by the host right after creating (set_meetup_join_mode). meetup_join_requests holds the
--   requests (no direct writes): request_to_join / cancel_join_request, decide_join_request (host; approving adds the
--   member if there's still a seat). join_meetup refuses private ones (approval_required). The host gets a phone + bell
--   notification for each request, the person one when approved.
-- * stories.audience: 'everyone' (all signed-in people, as before) or 'friends' (mutual follows only).
-- * New tables / hangouts are announced (phone + bell) only to people within 20 km, with who made it and its title.
--   Phones' rough areas are now rounded to 0.05° (about 5 km) so 20 km stays meaningful.

-- ---------------------------------------------------------------------------
-- Private tables / hangouts
-- ---------------------------------------------------------------------------

alter table public.meetups
  add column join_mode text not null default 'open' check (join_mode in ('open', 'private'));

create table public.meetup_join_requests (
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (meetup_id, user_id)
);

create index meetup_join_requests_user_idx on public.meetup_join_requests (user_id);

alter table public.meetup_join_requests enable row level security;
revoke insert, update, delete on public.meetup_join_requests from anon, authenticated;

create policy "People see their own requests; hosts see requests to their meetups"
on public.meetup_join_requests for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (select 1 from public.meetups m where m.id = meetup_id and m.host_id = (select auth.uid()))
);

alter publication supabase_realtime add table public.meetup_join_requests;

-- Host: open or private. Errors: auth_required, invalid_mode, not_host, not_found.
create function public.set_meetup_join_mode(p_meetup_id uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_mode not in ('open', 'private') then
    raise exception 'invalid_mode';
  end if;
  update public.meetups m set join_mode = p_mode
  where m.id = p_meetup_id and m.host_id = auth.uid() and m.status = 'open' and m.ends_at > now();
  if not found then
    if exists (select 1 from public.meetups m where m.id = p_meetup_id) then
      raise exception 'not_host';
    end if;
    raise exception 'not_found';
  end if;
end;
$$;

revoke execute on function public.set_meetup_join_mode(uuid, text) from public, anon;
grant execute on function public.set_meetup_join_mode(uuid, text) to authenticated;

-- Ask to join a private table / hangout. Errors: auth_required, not_allowed, not_found, meetup_cancelled,
-- meetup_ended, not_private (just join it), already_member, blocked, meetup_full, request_declined.
create function public.request_to_join(p_meetup_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_meetup public.meetups%rowtype;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if not public.meetup_caller_allowed() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into v_meetup from public.meetups m where m.id = p_meetup_id;
  if not found then
    raise exception 'not_found';
  end if;
  if v_meetup.status <> 'open' then
    raise exception 'meetup_cancelled';
  end if;
  if v_meetup.ends_at <= now() then
    raise exception 'meetup_ended';
  end if;
  if v_meetup.join_mode <> 'private' then
    raise exception 'not_private';
  end if;
  if exists (select 1 from public.meetup_members mm where mm.meetup_id = p_meetup_id and mm.user_id = v_uid) then
    raise exception 'already_member';
  end if;
  if public.is_blocked_between(v_uid, v_meetup.host_id) then
    raise exception 'blocked';
  end if;
  if (select count(*) from public.meetup_members mm where mm.meetup_id = p_meetup_id) >= v_meetup.max_people then
    raise exception 'meetup_full';
  end if;
  if exists (
    select 1 from public.meetup_join_requests r
    where r.meetup_id = p_meetup_id and r.user_id = v_uid and r.status = 'declined'
  ) then
    raise exception 'request_declined';
  end if;
  insert into public.meetup_join_requests (meetup_id, user_id) values (p_meetup_id, v_uid)
  on conflict (meetup_id, user_id) do nothing;
end;
$$;

revoke execute on function public.request_to_join(uuid) from public, anon;
grant execute on function public.request_to_join(uuid) to authenticated;

-- Take back my waiting request.
create function public.cancel_join_request(p_meetup_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.meetup_join_requests r
  where r.meetup_id = p_meetup_id and r.user_id = (select auth.uid()) and r.status = 'pending';
$$;

revoke execute on function public.cancel_join_request(uuid) from public, anon;
grant execute on function public.cancel_join_request(uuid) to authenticated;

-- Host: approve (adds the member) or decline a waiting request. Errors: auth_required, not_host, not_found,
-- meetup_cancelled, meetup_ended, meetup_full.
create function public.decide_join_request(p_meetup_id uuid, p_user_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_meetup public.meetups%rowtype;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  -- Lock the meetup so two approvals can't both take the last seat.
  select * into v_meetup from public.meetups m where m.id = p_meetup_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_meetup.host_id <> v_uid then
    raise exception 'not_host';
  end if;
  if not exists (
    select 1 from public.meetup_join_requests r
    where r.meetup_id = p_meetup_id and r.user_id = p_user_id and r.status = 'pending'
  ) then
    raise exception 'not_found';
  end if;

  if p_approve then
    if v_meetup.status <> 'open' then
      raise exception 'meetup_cancelled';
    end if;
    if v_meetup.ends_at <= now() then
      raise exception 'meetup_ended';
    end if;
    if (select count(*) from public.meetup_members mm where mm.meetup_id = p_meetup_id) >= v_meetup.max_people then
      raise exception 'meetup_full';
    end if;
    insert into public.meetup_members (meetup_id, user_id) values (p_meetup_id, p_user_id)
    on conflict do nothing;
  end if;
  update public.meetup_join_requests r
  set status = case when p_approve then 'approved' else 'declined' end, decided_at = now()
  where r.meetup_id = p_meetup_id and r.user_id = p_user_id;
end;
$$;

revoke execute on function public.decide_join_request(uuid, uuid, boolean) from public, anon;
grant execute on function public.decide_join_request(uuid, uuid, boolean) to authenticated;

-- Same as before, plus: a private meetup can't be joined directly (send a join request instead).
create or replace function public.join_meetup(p_meetup_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_meetup public.meetups%rowtype;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if not public.meetup_caller_allowed() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  -- Lock the meetup so two people can't both take the last seat.
  select * into v_meetup from public.meetups m where m.id = p_meetup_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_meetup.status <> 'open' then
    raise exception 'meetup_cancelled';
  end if;
  if v_meetup.ends_at <= now() then
    raise exception 'meetup_ended';
  end if;
  if exists (select 1 from public.meetup_members mm where mm.meetup_id = p_meetup_id and mm.user_id = v_uid) then
    return; -- already a member
  end if;
  if v_meetup.join_mode = 'private' then
    raise exception 'approval_required';
  end if;
  if (select count(*) from public.meetup_members mm where mm.meetup_id = p_meetup_id) >= v_meetup.max_people then
    raise exception 'meetup_full';
  end if;

  insert into public.meetup_members (meetup_id, user_id) values (p_meetup_id, v_uid);
end;
$$;

-- The open list, now with join_mode and my join request ('pending' / 'declined' / null).
drop function public.list_open_meetups();

create function public.list_open_meetups()
returns table (
  id uuid,
  kind public.meetup_kind,
  venue_id uuid,
  place_id uuid,
  place_name text,
  place_name_en text,
  place_name_th text,
  place_lat double precision,
  place_lng double precision,
  host_id uuid,
  title text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  max_people integer,
  member_count integer,
  joined boolean,
  time_zone text,
  place_kind text,
  cost_level smallint,
  meeting_point text,
  area_name text,
  area_name_en text,
  area_name_th text,
  challenge_id uuid,
  join_mode text,
  my_request text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.id, m.kind, m.venue_id, m.place_id,
    coalesce(p.name, m.spot_name), p.name_en, p.name_th, coalesce(p.lat, m.spot_lat), coalesce(p.lng, m.spot_lng),
    m.host_id, m.title, m.description, m.starts_at, m.ends_at, m.max_people,
    (select count(*)::integer from public.meetup_members mm where mm.meetup_id = m.id),
    exists (select 1 from public.meetup_members mm where mm.meetup_id = m.id and mm.user_id = (select auth.uid())),
    m.time_zone,
    p.kind, m.cost_level, m.meeting_point,
    a.name, a.name_en, a.name_th,
    m.challenge_id,
    m.join_mode,
    (select r.status from public.meetup_join_requests r
     where r.meetup_id = m.id and r.user_id = (select auth.uid()) and r.status <> 'approved')
  from public.meetups m
  left join public.venues v on v.id = m.venue_id
  left join public.places p on p.id = m.place_id
  left join lateral public.area_near(coalesce(p.lat, m.spot_lat, v.lat), coalesce(p.lng, m.spot_lng, v.lng)) a on true
  where m.status = 'open' and m.ends_at > now() and (m.venue_id is null or v.is_active)
  order by m.starts_at;
$$;
revoke execute on function public.list_open_meetups() from public, anon;
grant execute on function public.list_open_meetups() to authenticated;

-- Phone notifications for join requests: the host on a new request, the person when approved.
create function public.push_on_join_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meetup public.meetups%rowtype;
  v_name text;
  v_kind_en text;
  v_kind_th text;
begin
  begin
    select * into v_meetup from public.meetups m where m.id = new.meetup_id;
    v_kind_en := case when v_meetup.kind = 'hangout' then 'hangout' else 'table' end;
    v_kind_th := case when v_meetup.kind = 'hangout' then 'แฮงเอาท์' else 'โต๊ะ' end;
    if tg_op = 'INSERT' and new.status = 'pending' then
      select p.display_name into v_name from public.profiles p where p.id = new.user_id;
      perform public.push_send(
        v_meetup.host_id, 'join_request',
        'Join request',
        v_name || ' asked to join your ' || v_kind_en || ' "' || public.push_meetup_label(v_meetup.id, 'en') || '"',
        'คำขอเข้าร่วม',
        v_name || ' ขอเข้าร่วม' || v_kind_th || 'ของคุณ "' || public.push_meetup_label(v_meetup.id, 'th') || '"',
        '/table/' || v_meetup.id
      );
    elsif tg_op = 'UPDATE' and new.status = 'approved' and old.status = 'pending' then
      select p.display_name into v_name from public.profiles p where p.id = v_meetup.host_id;
      perform public.push_send(
        new.user_id, 'request_approved',
        'You''re in!',
        v_name || ' approved your request to join "' || public.push_meetup_label(v_meetup.id, 'en') || '"',
        'คุณได้เข้าร่วมแล้ว!',
        v_name || ' อนุมัติคำขอเข้าร่วม "' || public.push_meetup_label(v_meetup.id, 'th') || '" ของคุณ',
        '/table/' || v_meetup.id
      );
    end if;
  exception when others then
    raise warning 'push_on_join_request failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger meetup_join_requests_push after insert or update on public.meetup_join_requests
for each row execute function public.push_on_join_request();

-- An approved member joining isn't news for the host (they approved it): only open joins get "X joined".
create or replace function public.push_on_join()
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
       and v_meetup.join_mode = 'open'
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

-- ---------------------------------------------------------------------------
-- New tables / hangouts: within 20 km, with who made it and the title
-- ---------------------------------------------------------------------------

create or replace function public.push_on_new_meetup()
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
  v_host text;
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
    select p.display_name into v_host from public.profiles p where p.id = new.host_id;

    for r in
      select distinct d.user_id from public.push_devices d
      where d.user_id <> new.host_id and d.area_lat is not null
        and extensions.st_dwithin(
              extensions.st_setsrid(extensions.st_makepoint(d.area_lng, d.area_lat), 4326)::extensions.geography,
              extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography,
              20000)
        and not public.is_blocked_between(d.user_id, new.host_id)
    loop
      perform public.push_send(
        r.user_id, 'nearby',
        case when new.kind = 'hangout' then 'New hangout near you' else 'New table near you' end,
        v_host || ' created "' || public.push_meetup_label(new.id, 'en') || '" · ' || v_when,
        case when new.kind = 'hangout' then 'แฮงเอาท์ใหม่ใกล้คุณ' else 'โต๊ะใหม่ใกล้คุณ' end,
        v_host || ' สร้าง "' || public.push_meetup_label(new.id, 'th') || '" · ' || v_when,
        '/table/' || new.id
      );
    end loop;
  exception when others then
    raise warning 'push_on_new_meetup failed: %', sqlerrm;
  end;
  return null;
end;
$$;

-- Rough areas rounded to 0.05° (about 5 km) instead of 0.1°.
create or replace function public.register_push_device(
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
    v_lat := round(p_lat::numeric * 20) / 20;
    v_lng := round(p_lng::numeric * 20) / 20;
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

-- The bell: new tables / hangouts within 20 km (was 50), plus join requests to my meetups and my approved requests.
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
                   20000)
          end
    union all
    -- People who joined my open tables and hangouts.
    select 'join:' || mm.meetup_id || ':' || mm.user_id, 'joined', mm.joined_at, mm.user_id, m.id, null, null
    from public.meetup_members mm
    join public.meetups m on m.id = mm.meetup_id
    where m.host_id = (select me.id from me) and mm.user_id <> m.host_id
      and m.status = 'open' and m.join_mode = 'open'
      and mm.joined_at > now() - interval '14 days'
    union all
    -- Join requests waiting for me (private tables / hangouts I host).
    select 'jreq:' || r.meetup_id || ':' || r.user_id, 'join_request', r.created_at, r.user_id, m.id, null, null
    from public.meetup_join_requests r
    join public.meetups m on m.id = r.meetup_id
    where m.host_id = (select me.id from me) and r.status = 'pending'
      and m.status = 'open' and m.ends_at > now()
    union all
    -- My join requests that were approved.
    select 'japp:' || r.meetup_id, 'request_approved', r.decided_at, m.host_id, m.id, null, null
    from public.meetup_join_requests r
    join public.meetups m on m.id = r.meetup_id
    where r.user_id = (select me.id from me) and r.status = 'approved'
      and r.decided_at > now() - interval '14 days'
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
    -- My table / hangout ended with 4+ people: travel deals unlocked (host reward), 14 days.
    select 'reward:' || m.id, 'reward', m.ends_at, null, m.id, null, null
    from public.meetups m
    where m.host_id = (select me.id from me) and m.status = 'open'
      and m.ends_at < now() and m.ends_at > now() - interval '14 days'
      and (select count(*) from public.meetup_members x where x.meetup_id = m.id) >= 4
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

-- ---------------------------------------------------------------------------
-- Story audience
-- ---------------------------------------------------------------------------

alter table public.stories
  add column audience text not null default 'everyone' check (audience in ('everyone', 'friends'));

create or replace function public.story_visible(p_story_id uuid)
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

-- post_story gets an audience ('everyone' by default, so older app versions keep working).
drop function public.post_story(text, text, double precision, double precision);

create function public.post_story(
  p_photo_path text,
  p_caption text,
  p_lat double precision,
  p_lng double precision,
  p_audience text default 'everyone'
)
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
  if coalesce(p_audience, 'everyone') not in ('everyone', 'friends') then
    raise exception 'invalid_audience';
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

  insert into public.stories (user_id, photo_path, caption, lat, lng, area_name, area_name_en, area_name_th, audience)
  values (v_uid, p_photo_path, v_caption, v_lat, v_lng, v_area.name, v_area.name_en, v_area.name_th,
          coalesce(p_audience, 'everyone'))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.post_story(text, text, double precision, double precision, text) from public, anon;
grant execute on function public.post_story(text, text, double precision, double precision, text) to authenticated;

drop function public.map_stories();

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
  expires_at timestamptz,
  audience text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.user_id, p.display_name, p.avatar_path, s.photo_path, s.caption, s.lat, s.lng,
         coalesce(s.area_name_en, s.area_name), coalesce(s.area_name_th, s.area_name), s.created_at, s.expires_at,
         s.audience
  from public.stories s
  join public.profiles p on p.id = s.user_id
  where public.story_visible(s.id)
  order by s.created_at desc
  limit 500;
$$;

revoke execute on function public.map_stories() from public, anon;
grant execute on function public.map_stories() to authenticated;
