-- In-app notifications (the bell on home). Built from what already happens in the app, so nothing has to be
-- written when something happens and blocks / cancellations always apply:
-- * new_table / new_hangout: someone created a table or hangout (still open), last 7 days
-- * joined: someone joined my table or hangout, last 14 days
-- * chat_message: the latest message from others in each table / hangout chat I'm in, last 14 days
-- * direct_message / dm_request: the latest message from the other person in each conversation, last 14 days
-- * follow: someone followed me, last 30 days
-- * promotion: a new discount, offer, event, party, ticket discount or free entry at a partner venue, last 30 days
-- Unread = newer than the last time I opened the notifications (notification_state, functions only).
-- Phone push notifications come later.

create table public.notification_state (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  seen_at timestamptz not null default now()
);

-- No API access: read and written only by the functions below.
alter table public.notification_state enable row level security;
revoke all on public.notification_state from anon, authenticated;

create index meetups_created_at_idx on public.meetups (created_at);
create index deals_created_at_idx on public.deals (created_at);
create index meetup_members_joined_at_idx on public.meetup_members (joined_at);

create function public.my_notifications(p_limit integer default 60)
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
    -- New tables and hangouts by others that are still open.
    select 'meetup:' || m.id as id,
           case when m.kind = 'hangout' then 'new_hangout' else 'new_table' end as kind,
           m.created_at as at, m.host_id as actor_id, m.id as meetup_id, null::text as body,
           null::uuid as deal_id
    from public.meetups m
    left join public.venues v on v.id = m.venue_id
    where m.host_id <> (select me.id from me)
      and m.status = 'open' and m.ends_at > now()
      and m.created_at > now() - interval '7 days'
      and (m.venue_id is null or v.is_active)
    union all
    -- People who joined my tables and hangouts.
    select 'join:' || mm.meetup_id || ':' || mm.user_id, 'joined', mm.joined_at, mm.user_id, m.id, null, null
    from public.meetup_members mm
    join public.meetups m on m.id = mm.meetup_id
    where m.host_id = (select me.id from me) and mm.user_id <> m.host_id
      and m.status = 'open'
      and mm.joined_at > now() - interval '14 days'
    union all
    -- The latest message from others in each chat I'm in.
    select * from (
      select distinct on (msg.meetup_id)
             'chat:' || msg.meetup_id, 'chat_message', msg.created_at, msg.sender_id, msg.meetup_id,
             left(msg.body, 140), null::uuid
      from public.meetup_messages msg
      where msg.meetup_id in (select my_meetups.meetup_id from my_meetups)
        and msg.sender_id <> (select me.id from me)
        and msg.created_at > now() - interval '14 days'
      order by msg.meetup_id, msg.created_at desc
    ) chats
    union all
    -- The latest message from the other person in each conversation (a request until it's accepted).
    select * from (
      select distinct on (t.id)
             'dm:' || t.id,
             case when t.status = 'pending' then 'dm_request' else 'direct_message' end,
             dm.created_at, dm.sender_id, null::uuid, left(dm.body, 140), null::uuid
      from public.direct_threads t
      join public.direct_messages dm on dm.thread_id = t.id
      where (select me.id from me) in (t.user_a, t.user_b)
        and t.status <> 'declined'
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

revoke execute on function public.my_notifications(integer) from public, anon;
grant execute on function public.my_notifications(integer) to authenticated;

-- Opening the notifications marks everything up to now as seen.
create function public.mark_notifications_seen()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notification_state (user_id, seen_at)
  select (select auth.uid()), now()
  where (select auth.uid()) is not null
  on conflict (user_id) do update set seen_at = excluded.seen_at;
$$;

revoke execute on function public.mark_notifications_seen() from public, anon;
grant execute on function public.mark_notifications_seen() to authenticated;
