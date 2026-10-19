-- TableMeet Plus (founder, 2026-10-19): Plan my day (day planner), Hidden Gems and the Rewards Passport are for Plus
-- members only, and Plus members see no ads. For now the founder gives Plus by hand in the admin panel (monthly or
-- yearly); Google Play payments come later.
--
-- * plus_members: one row per member with the plan and when it ends. Members read their own row; only the founder
--   (admin functions below) writes. The founder (admins) always counts as Plus.
-- * app_settings.plus_locked (default true): turn it off to open the Plus features to everyone without an app update.
-- * The locked features are checked on the server: list_gems, suggest_gem, my_passport, plan_candidates,
--   plan_food_near, create_plan_hangout and saving a day plan. Each old function is renamed *_all (no API access) and
--   a wrapper with the same name and arguments checks Plus first (reads return nothing, actions raise plus_required).
--   Things everyone shares keep working: a day hangout's plan on its table screen, check-ins and completion codes.

alter table public.app_settings add column plus_locked boolean not null default true;

create table public.plus_members (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  plan text not null check (plan in ('monthly', 'yearly')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  note text check (note is null or length(note) <= 300),
  granted_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.plus_members enable row level security;
revoke insert, update, delete on public.plus_members from anon, authenticated;

create policy "Members read their own Plus; admins read all"
on public.plus_members for select
to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

create function public.has_plus(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.plus_members m where m.user_id = p_user and m.ends_at > now())
      or exists (select 1 from public.admins a where a.user_id = p_user);
$$;

revoke execute on function public.has_plus(uuid) from public, anon;
grant execute on function public.has_plus(uuid) to authenticated;

-- Can the caller use the Plus features (a member, or the features aren't locked)?
create function public.plus_unlocked()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and (not coalesce((select s.plus_locked from public.app_settings s), true) or public.has_plus((select auth.uid())));
$$;

revoke execute on function public.plus_unlocked() from public, anon;
grant execute on function public.plus_unlocked() to authenticated;

-- My Plus status for the app: { member, unlocked, plan, ends_at }.
create function public.my_plus()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'member', public.has_plus((select auth.uid())),
    'unlocked', public.plus_unlocked(),
    'plan', (select m.plan from public.plus_members m where m.user_id = (select auth.uid()) and m.ends_at > now()),
    'ends_at', (select m.ends_at from public.plus_members m where m.user_id = (select auth.uid()) and m.ends_at > now())
  );
$$;

revoke execute on function public.my_plus() from public, anon;
grant execute on function public.my_plus() to authenticated;

-- ---------------------------------------------------------------------------
-- The founder: find people, give / extend / end Plus
-- ---------------------------------------------------------------------------

-- People whose name or email contains the text (max 30), with their Plus status.
create function public.admin_find_users(p_query text)
returns table (id uuid, display_name text, email text, plan text, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select p.id, p.display_name, u.email::text, m.plan, m.ends_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.plus_members m on m.user_id = p.id
  where length(trim(coalesce(p_query, ''))) >= 2
    and (p.display_name ilike '%' || trim(p_query) || '%' or u.email ilike '%' || trim(p_query) || '%')
  order by p.display_name
  limit 30;
end;
$$;

revoke execute on function public.admin_find_users(text) from public, anon;
grant execute on function public.admin_find_users(text) to authenticated;

-- Everyone with Plus (active or ended), newest end first.
create function public.admin_list_plus()
returns table (
  user_id uuid, display_name text, email text, plan text, starts_at timestamptz, ends_at timestamptz, note text, active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select m.user_id, p.display_name, u.email::text, m.plan, m.starts_at, m.ends_at, m.note, m.ends_at > now()
  from public.plus_members m
  join public.profiles p on p.id = m.user_id
  join auth.users u on u.id = m.user_id
  order by m.ends_at desc;
end;
$$;

revoke execute on function public.admin_list_plus() from public, anon;
grant execute on function public.admin_list_plus() to authenticated;

-- Gives Plus for one month or one year, added after the current end if they still have it. Returns the new end.
-- Errors: not allowed, invalid_plan, not_found.
create function public.admin_grant_plus(p_user uuid, p_plan text, p_note text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step interval;
  v_end timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_step := case p_plan when 'monthly' then interval '1 month' when 'yearly' then interval '1 year' end;
  if v_step is null then
    raise exception 'invalid_plan';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'not_found';
  end if;
  insert into public.plus_members (user_id, plan, starts_at, ends_at, note, granted_by)
  values (p_user, p_plan, now(), now() + v_step, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (user_id) do update
    set plan = excluded.plan,
        starts_at = case when public.plus_members.ends_at > now() then public.plus_members.starts_at else now() end,
        ends_at = greatest(public.plus_members.ends_at, now()) + v_step,
        note = coalesce(excluded.note, public.plus_members.note),
        granted_by = excluded.granted_by,
        updated_at = now()
  returning ends_at into v_end;
  return v_end;
end;
$$;

revoke execute on function public.admin_grant_plus(uuid, text, text) from public, anon;
grant execute on function public.admin_grant_plus(uuid, text, text) to authenticated;

-- Ends Plus now.
create function public.admin_end_plus(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.plus_members m set ends_at = now(), updated_at = now() where m.user_id = p_user and m.ends_at > now();
end;
$$;

revoke execute on function public.admin_end_plus(uuid) from public, anon;
grant execute on function public.admin_end_plus(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Locking the Plus features
-- ---------------------------------------------------------------------------

-- Hidden Gems
alter function public.list_gems() rename to list_gems_all;
revoke execute on function public.list_gems_all() from public, anon, authenticated;

create function public.list_gems()
returns table (
  id uuid, number integer, area_en text, area_th text, category text, name_en text, name_th text,
  subtitle_en text, subtitle_th text, description_en text, description_th text, budget_en text, budget_th text,
  min_spend integer, hours_en text, hours_th text, tip_en text, tip_th text, activity_en text, activity_th text,
  lat double precision, lng double precision, place_id uuid, photo_path text, image_url text, image_credit text,
  local_pick boolean, contributor_id uuid, contributor_name text, useful integer, i_found_useful boolean,
  saved boolean, visited boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.list_gems_all() where public.plus_unlocked();
$$;

revoke execute on function public.list_gems() from public, anon;
grant execute on function public.list_gems() to authenticated;

alter function public.suggest_gem(text, text, text, text, text, double precision, double precision, text) rename to suggest_gem_all;
revoke execute on function public.suggest_gem_all(text, text, text, text, text, double precision, double precision, text) from public, anon, authenticated;

create function public.suggest_gem(
  p_name text, p_category text, p_description text, p_tip text, p_price text,
  p_lat double precision, p_lng double precision, p_photo_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.plus_unlocked() then
    raise exception 'plus_required' using errcode = '42501';
  end if;
  return public.suggest_gem_all(p_name, p_category, p_description, p_tip, p_price, p_lat, p_lng, p_photo_path);
end;
$$;

revoke execute on function public.suggest_gem(text, text, text, text, text, double precision, double precision, text) from public, anon;
grant execute on function public.suggest_gem(text, text, text, text, text, double precision, double precision, text) to authenticated;

-- Rewards Passport
alter function public.my_passport() rename to my_passport_all;
revoke execute on function public.my_passport_all() from public, anon, authenticated;

create function public.my_passport()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.plus_unlocked() then
    raise exception 'plus_required' using errcode = '42501';
  end if;
  return public.my_passport_all();
end;
$$;

revoke execute on function public.my_passport() from public, anon;
grant execute on function public.my_passport() to authenticated;

-- Day planner
alter function public.plan_candidates(double precision, double precision, integer, text[], text[]) rename to plan_candidates_all;
revoke execute on function public.plan_candidates_all(double precision, double precision, integer, text[], text[]) from public, anon, authenticated;

create function public.plan_candidates(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer,
  p_kinds text[],
  p_entry text[] default null
)
returns table (
  id uuid, name text, name_en text, name_th text, kind text, lat double precision, lng double precision,
  website text, entry text, description_en text, description_th text, image_url text, image_credit text,
  opening_hours text, prominence smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.plan_candidates_all(p_lat, p_lng, p_radius_m, p_kinds, p_entry) where public.plus_unlocked();
$$;

revoke execute on function public.plan_candidates(double precision, double precision, integer, text[], text[]) from public, anon;
grant execute on function public.plan_candidates(double precision, double precision, integer, text[], text[]) to authenticated;

alter function public.plan_food_near(double precision, double precision, text[], integer) rename to plan_food_near_all;
revoke execute on function public.plan_food_near_all(double precision, double precision, text[], integer) from public, anon, authenticated;

create function public.plan_food_near(
  p_lat double precision,
  p_lng double precision,
  p_kinds text[],
  p_limit integer default 8
)
returns table (
  id uuid, name text, name_en text, name_th text, kind text, cuisine text, lat double precision, lng double precision,
  distance_m double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.plan_food_near_all(p_lat, p_lng, p_kinds, p_limit) where public.plus_unlocked();
$$;

revoke execute on function public.plan_food_near(double precision, double precision, text[], integer) from public, anon;
grant execute on function public.plan_food_near(double precision, double precision, text[], integer) to authenticated;

alter function public.create_plan_hangout(uuid, integer) rename to create_plan_hangout_all;
revoke execute on function public.create_plan_hangout_all(uuid, integer) from public, anon, authenticated;

create function public.create_plan_hangout(p_plan_id uuid, p_max_people integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.plus_unlocked() then
    raise exception 'plus_required' using errcode = '42501';
  end if;
  return public.create_plan_hangout_all(p_plan_id, p_max_people);
end;
$$;

revoke execute on function public.create_plan_hangout(uuid, integer) from public, anon;
grant execute on function public.create_plan_hangout(uuid, integer) to authenticated;

drop policy "People save their own plans" on public.day_plans;
create policy "Plus members save their own plans"
on public.day_plans for insert
to authenticated
with check (owner_id = (select auth.uid()) and meetup_id is null and (select public.plus_unlocked()));
