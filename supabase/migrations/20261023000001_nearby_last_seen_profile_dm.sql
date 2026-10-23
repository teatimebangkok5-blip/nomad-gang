-- Travellers nearby use the last place someone opened the app, and private messages can start from any profile
-- (founder, 2026-10-23).
--
--   * The app now saves a visible person's position every time it opens (not only on the Travellers screen), and a
--     saved position counts for 7 days instead of 2 hours, so people show up "active 3 days ago" until they open the
--     app somewhere new.
--   * Because a position can now be looked at for days, the dot's offset is fixed per saved position (seeded by the
--     day it was saved) instead of per viewing day, so looking on several days can't average it out.
--   * A first private message no longer needs both people nearby: friends (mutual follows) start an accepted chat;
--     anyone else sends a request as before. Max 20 new conversations started per person per 24 hours (spam).
--     New error key: too_many_requests.

-- A position moved 150–400 m in a direction fixed for this person and the given day.
create function public.fuzzed_location_on(p_user_id uuid, p_location extensions.geography, p_day date)
returns extensions.geography
language sql
stable
security definer
set search_path = ''
as $$
  select extensions.st_project(
    p_location,
    150 + (('x' || lpad(substr(md5(p_user_id::text || p_day::text), 1, 8), 16, '0'))::bit(64)::bigint % 251),
    radians((('x' || lpad(substr(md5(p_user_id::text || p_day::text), 9, 8), 16, '0'))::bit(64)::bigint % 360)::double precision)
  )::extensions.geography;
$$;

revoke execute on function public.fuzzed_location_on(uuid, extensions.geography, date) from public, anon, authenticated;

-- Discoverable people within 5 km of the caller's last saved position, seen in the last 7 days (the caller must be
-- discoverable too).
create or replace function public.nearby_travellers()
returns table (
  user_id uuid,
  display_name text,
  fuzzy_lat double precision,
  fuzzy_lng double precision,
  distance_km numeric,
  minutes_ago integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select l.location
    from public.user_locations l
    join public.profiles p on p.id = l.user_id
    where l.user_id = auth.uid() and p.discoverable and l.updated_at > now() - interval '7 days'
  ),
  near as (
    select
      o.user_id,
      pr.display_name,
      public.fuzzed_location_on(o.user_id, o.location, (o.updated_at at time zone 'Asia/Bangkok')::date) as fuzzy,
      extensions.st_distance(o.location, me.location) as meters,
      o.updated_at
    from me
    join public.user_locations o on extensions.st_dwithin(o.location, me.location, 5000)
    join public.profiles pr on pr.id = o.user_id
    where o.user_id <> auth.uid()
      and pr.discoverable
      and o.updated_at > now() - interval '7 days'
      and not public.is_blocked_between(o.user_id, auth.uid())
  )
  select
    near.user_id,
    near.display_name,
    extensions.st_y(near.fuzzy::extensions.geometry),
    extensions.st_x(near.fuzzy::extensions.geometry),
    greatest(0.5, round((near.meters / 500)::numeric) * 0.5),
    (extract(epoch from now() - near.updated_at) / 60)::integer
  from near
  -- People who opened the app recently first, then the closest.
  order by near.updated_at > now() - interval '2 hours' desc, near.meters
  limit 100;
$$;

-- Send a direct message. Starts a chat with anyone (accepted at once between friends, else a request), or continues
-- an existing one.
create or replace function public.send_direct_message(p_to uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_a uuid := least(auth.uid(), p_to);
  v_b uuid := greatest(auth.uid(), p_to);
  v_thread public.direct_threads%rowtype;
  v_body text := trim(coalesce(p_body, ''));
begin
  if v_me is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if not public.meetup_caller_allowed() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if length(v_body) = 0 or length(v_body) > 1000 then
    raise exception 'empty_message';
  end if;
  if p_to is null or p_to = v_me or not exists (select 1 from public.profiles p where p.id = p_to) then
    raise exception 'not_found';
  end if;
  if public.is_blocked_between(v_me, p_to) then
    raise exception 'blocked';
  end if;

  select * into v_thread from public.direct_threads t where t.user_a = v_a and t.user_b = v_b for update;

  if not found then
    if public.are_friends(v_me, p_to) then
      insert into public.direct_threads (user_a, user_b, requested_by, status)
      values (v_a, v_b, v_me, 'accepted')
      returning * into v_thread;
    else
      if (
        select count(*) from public.direct_threads t
        where t.requested_by = v_me and t.created_at > now() - interval '24 hours'
      ) >= 20 then
        raise exception 'too_many_requests';
      end if;
      insert into public.direct_threads (user_a, user_b, requested_by)
      values (v_a, v_b, v_me)
      returning * into v_thread;
    end if;
  elsif v_thread.status = 'pending' and v_thread.requested_by = v_me then
    -- Became friends while the request was waiting: the chat just opens.
    if public.are_friends(v_me, p_to) then
      update public.direct_threads set status = 'accepted' where id = v_thread.id;
    else
      raise exception 'request_pending';
    end if;
  elsif v_thread.status = 'declined' and v_thread.requested_by = v_me then
    raise exception 'request_declined';
  elsif v_thread.status <> 'accepted' then
    -- The receiver replying accepts the request.
    update public.direct_threads set status = 'accepted' where id = v_thread.id;
  end if;

  insert into public.direct_messages (thread_id, sender_id, body) values (v_thread.id, v_me, v_body);
  update public.direct_threads set last_message_at = now() where id = v_thread.id;
  return v_thread.id;
end;
$$;

-- Save the caller's current position (only kept while they're discoverable). Positions older than 7 days no longer
-- count, so each save also deletes everyone's older ones (the Privacy Policy says they're kept up to 7 days).
create or replace function public.update_my_location(p_lat double precision, p_lng double precision)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid location' using errcode = '22023';
  end if;
  delete from public.user_locations where updated_at < now() - interval '7 days';
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.discoverable) then
    return;
  end if;
  insert into public.user_locations (user_id, location, updated_at)
  values (auth.uid(), extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography, now())
  on conflict (user_id) do update set location = excluded.location, updated_at = excluded.updated_at;
end;
$$;
