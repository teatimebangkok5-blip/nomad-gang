-- TableMeet: "tables" (meetups) that people create at a partner venue and others join.
-- The app calls them tables; the database says meetups because TABLE is an SQL keyword.
--
-- Security model
--   * Everyone signed in can see open meetups and who joined (needed for the home map and table screens).
--   * Nobody writes meetups or members directly. Every change goes through the functions below, which check the
--     caller, the venue, the time, and the seat limit (with a row lock so two people can't take the last seat).
--   * Creating/joining needs a verified phone number. While app_settings.allow_guest_meetups is true, anonymous
--     guest accounts (used by the preview build before Google sign-in is set up) are allowed too.

-- ---------------------------------------------------------------------------
-- Profiles: the name other members see
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 60),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Signed-in users can read profiles"
on public.profiles for select
to authenticated
using (true);

create policy "Users can rename themselves"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- Google gives a full name; guests get "Guest" plus 4 characters of their id.
create function public.default_display_name(p_id uuid, p_meta jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(left(trim(p_meta ->> 'full_name'), 60), ''),
    nullif(left(trim(p_meta ->> 'name'), 60), ''),
    'Guest ' || upper(substr(replace(p_id::text, '-', ''), 1, 4))
  );
$$;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, public.default_display_name(new.id, new.raw_user_meta_data))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Users who signed up before this migration.
insert into public.profiles (id, display_name)
select id, public.default_display_name(id, raw_user_meta_data) from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- App settings (single row, founder-controlled)
-- ---------------------------------------------------------------------------

create table public.app_settings (
  id boolean primary key default true check (id),
  -- Turn off at launch so only phone-verified users can create and join tables.
  allow_guest_meetups boolean not null default true
);

insert into public.app_settings default values;

alter table public.app_settings enable row level security;

create policy "Admins read app settings"
on public.app_settings for select
to authenticated
using ((select public.is_admin()));

create policy "Admins update app settings"
on public.app_settings for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Meetups and members
-- ---------------------------------------------------------------------------

create type public.meetup_status as enum ('open', 'cancelled');

create table public.meetups (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  host_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default '' check (length(title) <= 80),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  max_people integer not null check (max_people between 3 and 12),
  status public.meetup_status not null default 'open',
  created_at timestamptz not null default now(),
  constraint meetups_ends_after_start check (ends_at > starts_at)
);

create index meetups_venue_id_idx on public.meetups (venue_id);
create index meetups_host_id_idx on public.meetups (host_id);
create index meetups_open_idx on public.meetups (ends_at) where status = 'open';

create table public.meetup_members (
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);

create index meetup_members_user_id_idx on public.meetup_members (user_id);

alter table public.meetups enable row level security;
alter table public.meetup_members enable row level security;

-- Read-only through the API; all writes go through the functions below.
create policy "Signed-in users can read meetups"
on public.meetups for select
to authenticated
using (true);

create policy "Signed-in users can read meetup members"
on public.meetup_members for select
to authenticated
using (true);

-- ---------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------
-- Errors use short machine-readable messages that the app translates:
--   auth_required, not_allowed, venue_unavailable, invalid_time, invalid_size, too_many_open,
--   not_found, meetup_full, meetup_ended, meetup_cancelled, not_host

-- True when the caller may create or join tables: phone verified, or a guest while guests are allowed.
create function public.meetup_caller_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = (select auth.uid())
      and (
        u.phone_confirmed_at is not null
        or (u.is_anonymous and (select s.allow_guest_meetups from public.app_settings s))
      )
  );
$$;

create function public.create_meetup(
  p_venue_id uuid,
  p_starts_at timestamptz,
  p_max_people integer,
  p_title text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if not public.meetup_caller_allowed() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.venues v where v.id = p_venue_id and v.is_active) then
    raise exception 'venue_unavailable';
  end if;
  if p_starts_at is null
     or p_starts_at < now() - interval '15 minutes'
     or p_starts_at > now() + interval '7 days' then
    raise exception 'invalid_time';
  end if;
  if p_max_people is null or p_max_people not between 3 and 12 then
    raise exception 'invalid_size';
  end if;
  -- Anti-spam: at most 3 open, not-yet-ended tables hosted per person.
  if (
    select count(*) from public.meetups m
    where m.host_id = v_uid and m.status = 'open' and m.ends_at > now()
  ) >= 3 then
    raise exception 'too_many_open';
  end if;

  insert into public.meetups (venue_id, host_id, title, starts_at, ends_at, max_people)
  values (p_venue_id, v_uid, left(coalesce(trim(p_title), ''), 80), p_starts_at, p_starts_at + interval '3 hours', p_max_people)
  returning id into v_id;

  insert into public.meetup_members (meetup_id, user_id) values (v_id, v_uid);
  return v_id;
end;
$$;

create function public.join_meetup(p_meetup_id uuid)
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
  if (select count(*) from public.meetup_members mm where mm.meetup_id = p_meetup_id) >= v_meetup.max_people then
    raise exception 'meetup_full';
  end if;

  insert into public.meetup_members (meetup_id, user_id) values (p_meetup_id, v_uid);
end;
$$;

-- Host cancels the whole table; anyone can cancel only their own table.
create function public.cancel_meetup(p_meetup_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  update public.meetups m set status = 'cancelled' where m.id = p_meetup_id and m.host_id = v_uid;
  if not found then
    if exists (select 1 from public.meetups m where m.id = p_meetup_id) then
      raise exception 'not_host';
    end if;
    raise exception 'not_found';
  end if;
end;
$$;

-- Leaving as the host cancels the table, since a table without its host can't go ahead.
create function public.leave_meetup(p_meetup_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if exists (select 1 from public.meetups m where m.id = p_meetup_id and m.host_id = v_uid) then
    perform public.cancel_meetup(p_meetup_id);
    return;
  end if;
  delete from public.meetup_members mm where mm.meetup_id = p_meetup_id and mm.user_id = v_uid;
end;
$$;

-- Open tables at live venues that haven't ended, soonest first. Runs as the caller (RLS applies).
create function public.list_open_meetups()
returns table (
  id uuid,
  venue_id uuid,
  host_id uuid,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  max_people integer,
  member_count integer,
  joined boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.id, m.venue_id, m.host_id, m.title, m.starts_at, m.ends_at, m.max_people,
    (select count(*)::integer from public.meetup_members mm where mm.meetup_id = m.id),
    exists (select 1 from public.meetup_members mm where mm.meetup_id = m.id and mm.user_id = (select auth.uid()))
  from public.meetups m
  join public.venues v on v.id = m.venue_id
  where m.status = 'open' and m.ends_at > now() and v.is_active
  order by m.starts_at;
$$;

revoke execute on function public.default_display_name(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.meetup_caller_allowed() from public, anon, authenticated;
revoke execute on function public.create_meetup(uuid, timestamptz, integer, text) from public, anon;
revoke execute on function public.join_meetup(uuid) from public, anon;
revoke execute on function public.cancel_meetup(uuid) from public, anon;
revoke execute on function public.leave_meetup(uuid) from public, anon;
revoke execute on function public.list_open_meetups() from public, anon;
grant execute on function public.create_meetup(uuid, timestamptz, integer, text) to authenticated;
grant execute on function public.join_meetup(uuid) to authenticated;
grant execute on function public.cancel_meetup(uuid) to authenticated;
grant execute on function public.leave_meetup(uuid) to authenticated;
grant execute on function public.list_open_meetups() to authenticated;

-- Live updates for the home map and table screens. Full replica identity lets "member left" (DELETE) events
-- carry meetup_id, so a table screen subscribed to its own members hears about it.
alter table public.meetup_members replica identity full;
alter publication supabase_realtime add table public.meetups, public.meetup_members;
