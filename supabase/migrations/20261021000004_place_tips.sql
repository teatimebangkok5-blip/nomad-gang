-- Local insider tips on map places (founder, 2026-10-21).
--
-- * place_tips: a short tip (3–280 characters) by a person about an OpenStreetMap place or a partner venue
--   ("Order the crab omelette, ask for table 4 on the terrace for sunset"). One per person and place (saving again
--   replaces it), max 20 new tips a day. Same caller rule as meetups (verified phone or an allowed guest).
-- * "Helpful" votes (tip_votes), not on your own tip. Tips are listed most helpful first, then newest.
-- * Reports go into reports with context 'tip' (context_id = tip id): hidden for the reporter at once and for
--   everyone at 3 open reports until the founder clears them. Never shown across a block.
-- * No direct table access: place_tips(), save_tip, delete_tip (own, or admins), vote_tip; the admin panel uses
--   admin_tips and admin_clear_tip_reports.
--
-- Errors: auth_required, not_allowed, not_found, invalid_tip, too_many_tips, own_tip.

alter type public.report_context add value if not exists 'tip';

create table public.place_tips (
  id uuid primary key default gen_random_uuid(),
  place_id uuid references public.places (id) on delete cascade,
  venue_id uuid references public.venues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) between 3 and 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(place_id, venue_id) = 1),
  unique (place_id, user_id),
  unique (venue_id, user_id)
);

create index place_tips_user_idx on public.place_tips (user_id);
create index place_tips_venue_idx on public.place_tips (venue_id) where venue_id is not null;

create table public.tip_votes (
  tip_id uuid not null references public.place_tips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tip_id, user_id)
);

create index tip_votes_user_idx on public.tip_votes (user_id);

alter table public.place_tips enable row level security;
alter table public.tip_votes enable row level security;
revoke all on public.place_tips, public.tip_votes from anon, authenticated;

-- Whether the caller may see a tip: not across a block, not one they reported, not hidden by 3 open reports.
create function public.tip_visible(p_tip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.place_tips t
    where t.id = p_tip_id
      and not public.is_blocked_between(auth.uid(), t.user_id)
      and not exists (
        select 1 from public.reports r
        where r.context::text = 'tip' and r.context_id = t.id and r.reporter_id = auth.uid())
      and (select count(*) from public.reports r
           where r.context::text = 'tip' and r.context_id = t.id and not r.resolved) < 3
  );
$$;

revoke execute on function public.tip_visible(uuid) from public, anon, authenticated;

-- The tips on a place (or a partner venue), most helpful first.
create function public.place_tips(p_place_id uuid, p_venue_id uuid default null)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  avatar_path text,
  body text,
  created_at timestamptz,
  updated_at timestamptz,
  helpful integer,
  voted boolean,
  mine boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.user_id, p.display_name, p.avatar_path, t.body, t.created_at, t.updated_at,
         (select count(*)::integer from public.tip_votes v
          where v.tip_id = t.id and not public.is_blocked_between(auth.uid(), v.user_id)),
         exists (select 1 from public.tip_votes v where v.tip_id = t.id and v.user_id = auth.uid()),
         t.user_id = auth.uid()
  from public.place_tips t
  join public.profiles p on p.id = t.user_id
  where auth.uid() is not null
    and ((p_place_id is not null and t.place_id = p_place_id) or (p_venue_id is not null and t.venue_id = p_venue_id))
    and public.tip_visible(t.id)
  order by 4 desc, t.created_at desc
  limit 50;
$$;

revoke execute on function public.place_tips(uuid, uuid) from public, anon;
grant execute on function public.place_tips(uuid, uuid) to authenticated;

-- Adds or replaces my tip on a place / partner venue. Returns its id.
create function public.save_tip(p_place_id uuid, p_venue_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid;
begin
  if v_me is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if not public.meetup_caller_allowed() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if length(v_body) not between 3 and 280 or num_nonnulls(p_place_id, p_venue_id) <> 1 then
    raise exception 'invalid_tip';
  end if;
  if (p_place_id is not null and not exists (select 1 from public.places p where p.id = p_place_id))
     or (p_venue_id is not null and not exists (select 1 from public.venues v where v.id = p_venue_id and v.is_active)) then
    raise exception 'not_found';
  end if;

  select t.id into v_id from public.place_tips t
  where t.user_id = v_me and (t.place_id = p_place_id or t.venue_id = p_venue_id);
  if v_id is not null then
    update public.place_tips set body = v_body, updated_at = now() where id = v_id;
    return v_id;
  end if;
  if (select count(*) from public.place_tips t where t.user_id = v_me and t.created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many_tips';
  end if;
  insert into public.place_tips (place_id, venue_id, user_id, body)
  values (p_place_id, p_venue_id, v_me, v_body)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.save_tip(uuid, uuid, text) from public, anon;
grant execute on function public.save_tip(uuid, uuid, text) to authenticated;

-- My own tip, or any tip for admins.
create function public.delete_tip(p_tip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  delete from public.place_tips t where t.id = p_tip_id and (t.user_id = auth.uid() or public.is_admin());
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

revoke execute on function public.delete_tip(uuid) from public, anon;
grant execute on function public.delete_tip(uuid) to authenticated;

-- Marks a tip as helpful (or takes it back).
create function public.vote_tip(p_tip_id uuid, p_helpful boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if not public.tip_visible(p_tip_id) then
    raise exception 'not_found';
  end if;
  if exists (select 1 from public.place_tips t where t.id = p_tip_id and t.user_id = auth.uid()) then
    raise exception 'own_tip';
  end if;
  if p_helpful then
    insert into public.tip_votes (tip_id, user_id) values (p_tip_id, auth.uid()) on conflict do nothing;
  else
    delete from public.tip_votes where tip_id = p_tip_id and user_id = auth.uid();
  end if;
end;
$$;

revoke execute on function public.vote_tip(uuid, boolean) from public, anon;
grant execute on function public.vote_tip(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin panel
-- ---------------------------------------------------------------------------

-- Newest tips (or only reported ones) with the place and the open report count.
create function public.admin_tips(p_reported_only boolean, p_limit integer default 100)
returns table (
  id uuid,
  body text,
  created_at timestamptz,
  user_id uuid,
  display_name text,
  place_name text,
  open_reports integer,
  helpful integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
  select t.id, t.body, t.created_at, t.user_id, p.display_name,
         coalesce(v.name_en, pl.name),
         (select count(*)::integer from public.reports r where r.context::text = 'tip' and r.context_id = t.id and not r.resolved),
         (select count(*)::integer from public.tip_votes tv where tv.tip_id = t.id)
  from public.place_tips t
  join public.profiles p on p.id = t.user_id
  left join public.venues v on v.id = t.venue_id
  left join public.places pl on pl.id = t.place_id
  where not p_reported_only or exists (
    select 1 from public.reports r where r.context::text = 'tip' and r.context_id = t.id and not r.resolved)
  order by t.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

revoke execute on function public.admin_tips(boolean, integer) from public, anon;
grant execute on function public.admin_tips(boolean, integer) to authenticated;

-- The tip is fine: its reports are resolved, so it shows again.
create function public.admin_clear_tip_reports(p_tip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.reports r set resolved = true where r.context::text = 'tip' and r.context_id = p_tip_id;
end;
$$;

revoke execute on function public.admin_clear_tip_reports(uuid) from public, anon;
grant execute on function public.admin_clear_tip_reports(uuid) to authenticated;
