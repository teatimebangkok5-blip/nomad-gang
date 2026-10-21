-- "Second round": continuing the night after a table / hangout (founder, 2026-10-21).
--
-- * From 30 minutes before a table / hangout ends until 3 hours after, its members see "Continuing the night?":
--   bars, pubs, clubs and partner bars / rooftops within 1.5 km (second_round_places), and other groups nearby.
-- * create_second_round: a member starts a pit-stop at one of them (meetups.second_round_of = the first meetup) and
--   an invite card ('meetup:<id>') goes into the first chat, so the group can follow.
-- * invite_table (founder's choice: nearby hosts can ping other tables): the host of a second round invites another
--   table / hangout within 2 km that is happening now or ended in the last 2 hours (second_round_targets lists them).
--   Its members get a phone notification and a bell item ('table_invite'). Max 3 invites per host per 12 hours, once
--   per target; never across a block, never to groups the host can't see (women-only).
-- * The bell (my_notifications) also hides women-only tables / hangouts from everyone who may not see them.
--
-- Errors: auth_required, not_found, not_member, not_now, not_host, too_far, too_many_invites, already_invited.

alter table public.meetups add column second_round_of uuid references public.meetups (id) on delete set null;

create table public.meetup_invites (
  round_id uuid not null references public.meetups (id) on delete cascade,
  target_id uuid not null references public.meetups (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (round_id, target_id),
  check (round_id <> target_id)
);

create index meetup_invites_target_idx on public.meetup_invites (target_id);
create index meetup_invites_inviter_idx on public.meetup_invites (inviter_id, created_at desc);

alter table public.meetup_invites enable row level security;
revoke all on public.meetup_invites from anon, authenticated;

-- Where a meetup is (venue, place or spot).
create function public.meetup_point(p_meetup_id uuid)
returns extensions.geography
language sql
stable
security definer
set search_path = ''
as $$
  select extensions.st_setsrid(
           extensions.st_makepoint(coalesce(v.lng, pl.lng, m.spot_lng), coalesce(v.lat, pl.lat, m.spot_lat)), 4326
         )::extensions.geography
  from public.meetups m
  left join public.venues v on v.id = m.venue_id
  left join public.places pl on pl.id = m.place_id
  where m.id = p_meetup_id;
$$;

revoke execute on function public.meetup_point(uuid) from public, anon, authenticated;

-- Whether the caller is in this meetup and it's around its end (30 min before to 3 h after).
create function public.second_round_open(p_meetup_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.meetups m
    join public.meetup_members mm on mm.meetup_id = m.id and mm.user_id = auth.uid()
    where m.id = p_meetup_id and m.status = 'open'
      and now() between m.ends_at - interval '30 minutes' and m.ends_at + interval '3 hours'
  );
$$;

revoke execute on function public.second_round_open(uuid) from public, anon, authenticated;

-- Bars, pubs, clubs and partner bars / rooftops within 1.5 km of the meetup, nearest first.
create function public.second_round_places(p_meetup_id uuid)
returns table (
  place_id uuid,
  venue_id uuid,
  name text,
  name_en text,
  name_th text,
  kind text,
  lat double precision,
  lng double precision,
  distance_m integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_point extensions.geography;
begin
  if not public.second_round_open(p_meetup_id) then
    raise exception 'not_now';
  end if;
  v_point := public.meetup_point(p_meetup_id);
  return query
  select * from (
    select null::uuid, v.id, v.name_en, v.name_en, v.name_th, v.category::text, v.lat, v.lng,
           extensions.st_distance(v.location, v_point)::integer
    from public.venues v
    where v.is_active and v.category::text in ('bar', 'rooftop')
      and extensions.st_dwithin(v.location, v_point, 1500)
    union all
    select p.id, null::uuid, p.name, p.name_en, p.name_th, p.kind, p.lat, p.lng,
           extensions.st_distance(p.location, v_point)::integer
    from public.places p
    where p.kind in ('bar', 'pub', 'nightclub', 'biergarten')
      and extensions.st_dwithin(p.location, v_point, 1500)
      and not exists (select 1 from public.venues v where v.place_id = p.id and v.is_active)
  ) s
  order by 9
  limit 25;
end;
$$;

revoke execute on function public.second_round_places(uuid) from public, anon;
grant execute on function public.second_round_places(uuid) to authenticated;

-- A member starts the second round: a pit-stop at a place / partner venue, announced in the first chat.
create function public.create_second_round(
  p_meetup_id uuid,
  p_title text,
  p_venue_id uuid,
  p_place_id uuid,
  p_starts_in_minutes integer,
  p_duration_minutes integer,
  p_max_people integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if not public.second_round_open(p_meetup_id) then
    raise exception 'not_now';
  end if;
  v_id := public.create_pitstop(p_title, p_starts_in_minutes, p_duration_minutes, p_max_people, p_venue_id, p_place_id);
  update public.meetups set second_round_of = p_meetup_id, vibe = coalesce(vibe, 'party') where id = v_id;
  -- (Not if they've left that chat.)
  if public.chat_access('meetup', p_meetup_id, true) then
    perform public.post_chat_message('meetup', p_meetup_id, 'card', 'meetup:' || v_id);
  end if;
  return v_id;
end;
$$;

revoke execute on function public.create_second_round(uuid, text, uuid, uuid, integer, integer, integer) from public, anon;
grant execute on function public.create_second_round(uuid, text, uuid, uuid, integer, integer, integer) to authenticated;

-- Other groups the host of a second round may invite: within 2 km, happening now or ended in the last 2 hours.
create function public.second_round_targets(p_round_id uuid)
returns table (
  id uuid,
  kind text,
  title text,
  place_name text,
  place_name_en text,
  place_name_th text,
  venue_id uuid,
  member_count integer,
  distance_m integer,
  ends_at timestamptz,
  invited boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_round public.meetups%rowtype;
  v_point extensions.geography;
begin
  select * into v_round from public.meetups m where m.id = p_round_id;
  if not found or v_round.host_id <> auth.uid() or v_round.second_round_of is null then
    raise exception 'not_host';
  end if;
  v_point := public.meetup_point(p_round_id);
  return query
  select m.id, m.kind::text, m.title, coalesce(pl.name, m.spot_name), pl.name_en, pl.name_th, m.venue_id,
         (select count(*)::integer from public.meetup_members mm where mm.meetup_id = m.id),
         extensions.st_distance(public.meetup_point(m.id), v_point)::integer,
         m.ends_at,
         exists (select 1 from public.meetup_invites i where i.round_id = p_round_id and i.target_id = m.id)
  from public.meetups m
  left join public.places pl on pl.id = m.place_id
  where m.status = 'open' and m.id not in (p_round_id, v_round.second_round_of)
    and m.starts_at <= now() and m.ends_at > now() - interval '2 hours'
    and m.second_round_of is null
    and (not m.women_only or public.can_see_women_only())
    and not public.is_blocked_between(auth.uid(), m.host_id)
    and not exists (select 1 from public.meetup_members mm where mm.meetup_id = m.id and mm.user_id = auth.uid())
    and extensions.st_dwithin(public.meetup_point(m.id), v_point, 2000)
  order by 9
  limit 20;
end;
$$;

revoke execute on function public.second_round_targets(uuid) from public, anon;
grant execute on function public.second_round_targets(uuid) to authenticated;

create function public.invite_table(p_round_id uuid, p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_round public.meetups%rowtype;
  v_name text;
  v_place_en text;
  v_place_th text;
  r record;
begin
  if v_me is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  select * into v_round from public.meetups m where m.id = p_round_id;
  if not found or v_round.host_id <> v_me or v_round.second_round_of is null
     or v_round.status <> 'open' or v_round.ends_at <= now() then
    raise exception 'not_host';
  end if;
  if not exists (select 1 from public.second_round_targets(p_round_id) t where t.id = p_target_id) then
    raise exception 'too_far';
  end if;
  if exists (select 1 from public.meetup_invites i where i.round_id = p_round_id and i.target_id = p_target_id) then
    raise exception 'already_invited';
  end if;
  if (select count(*) from public.meetup_invites i
      where i.inviter_id = v_me and i.created_at > now() - interval '12 hours') >= 3 then
    raise exception 'too_many_invites';
  end if;
  insert into public.meetup_invites (round_id, target_id, inviter_id) values (p_round_id, p_target_id, v_me);

  select p.display_name into v_name from public.profiles p where p.id = v_me;
  v_place_en := public.push_meetup_label(p_round_id, 'en');
  v_place_th := public.push_meetup_label(p_round_id, 'th');
  for r in
    select mm.user_id from public.meetup_members mm
    where mm.meetup_id = p_target_id and not public.is_blocked_between(mm.user_id, v_me)
  loop
    perform public.push_send(
      r.user_id, 'invite',
      'Second round? 🍻', v_name || ' invites your group to "' || v_place_en || '"',
      'ไปต่อไหม? 🍻', v_name || ' ชวนกลุ่มของคุณไป "' || v_place_th || '"',
      '/table/' || p_round_id
    );
  end loop;
end;
$$;

revoke execute on function public.invite_table(uuid, uuid) from public, anon;
grant execute on function public.invite_table(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The bell: table invites, and women-only ones only for those who may see them
-- ---------------------------------------------------------------------------

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
    -- Second-round invites to a group I'm in (24 hours).
    select 'invite:' || i.round_id || ':' || i.target_id, 'table_invite', i.created_at, i.inviter_id, i.round_id, null, null
    from public.meetup_invites i
    join public.meetup_members mm on mm.meetup_id = i.target_id and mm.user_id = (select me.id from me)
    where i.created_at > now() - interval '24 hours'
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
    and (m.id is null or not m.women_only or public.can_see_women_only())
  order by i.at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 100);
$$;
