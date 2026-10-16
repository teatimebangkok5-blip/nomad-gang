-- Google accounts, profiles, follows and thumbs up / down feedback.
--
-- * app_settings.require_phone_verification (default off, the founder's decision until SMS is set up): while off,
--   any signed-in Google account may create/join tables, hangouts and send messages without a verified phone.
--   Anonymous guests still need allow_guest_meetups. Turn it on (and EXPO_PUBLIC_REQUIRE_PHONE in the app) before
--   launch.
-- * profiles.instagram: the @handle people show on their profile (no Instagram login, just a link).
-- * follows: one-way, like Instagram (no approval). Following each other = friends. Blocking removes follows.
-- * member_feedback: after a table or hangout has ended (not cancelled), members can give each other 👍 (1) or
--   👎 (-1), once per meetup per person (changeable, for 14 days). Who gave what is private; profiles show totals.
-- * get_profile(user): name, Instagram, followers / following, tables and hangouts attended, 👍 / 👎 totals.
--   Any signed-in person can see a profile, except across a block.

-- ---------------------------------------------------------------------------
-- Sign-in without a phone check (for now)
-- ---------------------------------------------------------------------------

alter table public.app_settings add column require_phone_verification boolean not null default false;

create or replace function public.meetup_caller_allowed()
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
        or (not u.is_anonymous and not (select s.require_phone_verification from public.app_settings s))
        or (u.is_anonymous and (select s.allow_guest_meetups from public.app_settings s))
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Profiles: Instagram
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column instagram text check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$');

-- Name and Instagram, trimmed and checked. Instagram: "@name", "name" or an instagram.com link → "name".
create function public.update_my_profile(p_display_name text, p_instagram text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(trim(coalesce(p_display_name, '')), 60);
  v_instagram text := nullif(
    regexp_replace(
      regexp_replace(trim(coalesce(p_instagram, '')), '^(https?://)?(www\.)?instagram\.com/', '', 'i'),
      '^@|[/?].*$', '', 'g'
    ),
    ''
  );
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'name_required';
  end if;
  if v_instagram is not null and v_instagram !~ '^[A-Za-z0-9._]{1,30}$' then
    raise exception 'invalid_instagram';
  end if;
  update public.profiles set display_name = v_name, instagram = v_instagram where id = auth.uid();
end;
$$;

revoke execute on function public.update_my_profile(text, text) from public, anon;
grant execute on function public.update_my_profile(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Follows
-- ---------------------------------------------------------------------------

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index follows_followee_id_idx on public.follows (followee_id);

alter table public.follows enable row level security;

-- Who follows whom is public to signed-in users (like Instagram). Writes go through follow_user / unfollow_user.
create policy "Signed-in users can read follows"
on public.follows for select
to authenticated
using (true);

create function public.follow_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if not public.meetup_caller_allowed() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = auth.uid() or not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'not_found';
  end if;
  if public.is_blocked_between(auth.uid(), p_user_id) then
    raise exception 'blocked';
  end if;
  insert into public.follows (follower_id, followee_id) values (auth.uid(), p_user_id) on conflict do nothing;
end;
$$;

create function public.unfollow_user(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.follows where follower_id = auth.uid() and followee_id = p_user_id;
$$;

revoke execute on function public.follow_user(uuid) from public, anon;
revoke execute on function public.unfollow_user(uuid) from public, anon;
grant execute on function public.follow_user(uuid) to authenticated;
grant execute on function public.unfollow_user(uuid) to authenticated;

-- Blocking someone removes follows both ways.
create function public.blocks_remove_follows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows f
  where (f.follower_id = new.blocker_id and f.followee_id = new.blocked_id)
     or (f.follower_id = new.blocked_id and f.followee_id = new.blocker_id);
  return new;
end;
$$;

revoke execute on function public.blocks_remove_follows() from public, anon, authenticated;

create trigger blocks_remove_follows
after insert on public.blocks
for each row execute function public.blocks_remove_follows();

-- ---------------------------------------------------------------------------
-- Feedback after a table or hangout
-- ---------------------------------------------------------------------------

create table public.member_feedback (
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (meetup_id, from_id, to_id),
  check (from_id <> to_id)
);

create index member_feedback_to_id_idx on public.member_feedback (to_id);

create trigger member_feedback_set_updated_at
before update on public.member_feedback
for each row execute function public.set_updated_at();

alter table public.member_feedback enable row level security;

-- People see only the votes they gave (to show their choice). Totals come from get_profile.
create policy "Users read the feedback they gave"
on public.member_feedback for select
to authenticated
using (from_id = (select auth.uid()));

-- p_vote: 1 = 👍, -1 = 👎, 0 = take it back. Errors: auth_required, not_member, meetup_cancelled,
-- meetup_not_ended, feedback_closed, invalid_vote.
create function public.give_feedback(p_meetup_id uuid, p_to_user uuid, p_vote integer)
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
  if p_vote is null or p_vote not in (-1, 0, 1) then
    raise exception 'invalid_vote';
  end if;
  select * into v_meetup from public.meetups m where m.id = p_meetup_id;
  if not found then
    raise exception 'not_found';
  end if;
  if p_to_user = v_uid
     or not exists (select 1 from public.meetup_members mm where mm.meetup_id = p_meetup_id and mm.user_id = v_uid)
     or not exists (select 1 from public.meetup_members mm where mm.meetup_id = p_meetup_id and mm.user_id = p_to_user) then
    raise exception 'not_member';
  end if;
  if v_meetup.status <> 'open' then
    raise exception 'meetup_cancelled';
  end if;
  if v_meetup.ends_at > now() then
    raise exception 'meetup_not_ended';
  end if;
  if v_meetup.ends_at < now() - interval '14 days' then
    raise exception 'feedback_closed';
  end if;

  if p_vote = 0 then
    delete from public.member_feedback f where f.meetup_id = p_meetup_id and f.from_id = v_uid and f.to_id = p_to_user;
  else
    insert into public.member_feedback (meetup_id, from_id, to_id, vote)
    values (p_meetup_id, v_uid, p_to_user, p_vote)
    on conflict (meetup_id, from_id, to_id) do update set vote = excluded.vote;
  end if;
end;
$$;

revoke execute on function public.give_feedback(uuid, uuid, integer) from public, anon;
grant execute on function public.give_feedback(uuid, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Profile page
-- ---------------------------------------------------------------------------

-- Tables / hangouts count those the person was a member of that took place (ended, not cancelled).
create function public.get_profile(p_user_id uuid)
returns table (
  id uuid,
  display_name text,
  instagram text,
  followers integer,
  following integer,
  tables integer,
  hangouts integer,
  thumbs_up integer,
  thumbs_down integer,
  i_follow boolean,
  follows_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.display_name,
    p.instagram,
    (select count(*)::integer from public.follows f where f.followee_id = p.id),
    (select count(*)::integer from public.follows f where f.follower_id = p.id),
    (select count(*)::integer from public.meetup_members mm join public.meetups m on m.id = mm.meetup_id
     where mm.user_id = p.id and m.kind = 'table' and m.status = 'open' and m.ends_at <= now()),
    (select count(*)::integer from public.meetup_members mm join public.meetups m on m.id = mm.meetup_id
     where mm.user_id = p.id and m.kind = 'hangout' and m.status = 'open' and m.ends_at <= now()),
    (select count(*)::integer from public.member_feedback fb where fb.to_id = p.id and fb.vote = 1),
    (select count(*)::integer from public.member_feedback fb where fb.to_id = p.id and fb.vote = -1),
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id),
    exists (select 1 from public.follows f where f.follower_id = p.id and f.followee_id = auth.uid())
  from public.profiles p
  where p.id = p_user_id
    and auth.uid() is not null
    and not public.is_blocked_between(auth.uid(), p.id);
$$;

revoke execute on function public.get_profile(uuid) from public, anon;
grant execute on function public.get_profile(uuid) to authenticated;
