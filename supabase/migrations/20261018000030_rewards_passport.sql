-- Rewards Passport: points, Bangkok district stamps, milestone rewards (3 / 5 / 10 meetups) and group challenges,
-- earned only for genuine, completed group meetups.
--
-- A meetup is VERIFIED when it has ended (not cancelled) and either
--   * GPS: 4+ members checked in at the place (check_in now works for every table / hangout: partner venues within
--     their check-in radius, other places and dropped pins within 100 m), or
--   * host code: the host shows a 6-digit code, 4+ members (host included) type it in, and the founder approves it
--     in the admin panel (for places where GPS doesn't work, e.g. indoors).
-- Credited people: the checked-in members (GPS) or the members who confirmed the code (approved).
-- Anti-fraud: at most one meetup per person per local day counts; the code allows 5 wrong tries per person per
-- hour; points are worked out from these records on read (my_passport), so nothing can be claimed twice.
-- Points: 10 per counted meetup, +5 for its host, + the challenge's points if the host picked one.

-- ---------------------------------------------------------------------------
-- Check-in anywhere
-- ---------------------------------------------------------------------------

-- Where to check in: the partner venue (its radius), else the place or the dropped pin (100 m).
create function public.meetup_checkin_target(p_meetup_id uuid)
returns table (lat double precision, lng double precision, radius_m integer)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(v.lat, p.lat, m.spot_lat), coalesce(v.lng, p.lng, m.spot_lng),
         case when v.id is not null then v.checkin_radius_m else 100 end
  from public.meetups m
  left join public.venues v on v.id = m.venue_id and v.is_active
  left join public.places p on p.id = m.place_id
  where m.id = p_meetup_id;
$$;

revoke execute on function public.meetup_checkin_target(uuid) from public, anon, authenticated;

-- Same rules as before (member, from 15 minutes before the start until the end), at any table / hangout.
create or replace function public.check_in(p_meetup_id uuid, p_lat double precision, p_lng double precision)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_meetup public.meetups%rowtype;
  v_target record;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  select * into v_meetup from public.meetups m where m.id = p_meetup_id;
  if not found
     or not exists (select 1 from public.meetup_members mm where mm.meetup_id = p_meetup_id and mm.user_id = v_uid) then
    raise exception 'not_member';
  end if;
  if v_meetup.status <> 'open' then
    raise exception 'meetup_cancelled';
  end if;
  if now() < v_meetup.starts_at - interval '15 minutes' or now() >= v_meetup.ends_at then
    raise exception 'not_now';
  end if;
  select * into v_target from public.meetup_checkin_target(p_meetup_id);
  if v_target.lat is null or v_target.lng is null then
    raise exception 'no_venue';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180
     or not extensions.st_dwithin(
       extensions.st_setsrid(extensions.st_makepoint(v_target.lng, v_target.lat), 4326)::extensions.geography,
       extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
       v_target.radius_m
     ) then
    raise exception 'too_far';
  end if;

  insert into public.meetup_checkins (meetup_id, user_id) values (p_meetup_id, v_uid) on conflict do nothing;
  return public.meetup_checked_in_count(p_meetup_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Challenges (founder-managed) and the host's pick
-- ---------------------------------------------------------------------------

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  emoji text not null default '🏆' check (length(emoji) between 1 and 16),
  title_en text not null check (length(trim(title_en)) between 1 and 80),
  title_th text not null check (length(trim(title_th)) between 1 and 80),
  description_en text not null default '' check (length(description_en) <= 300),
  description_th text not null default '' check (length(description_th) <= 300),
  points integer not null default 10 check (points between 0 and 50),
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.challenges enable row level security;

create policy "Signed-in users read active challenges; admins read all"
on public.challenges for select
to authenticated
using (is_active or (select public.is_admin()));

create policy "Admins manage challenges"
on public.challenges for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

insert into public.challenges (emoji, title_en, title_th, description_en, description_th, points, sort) values
('🍜', 'Noodle challenge', 'ชาเลนจ์ก๋วยเตี๋ยว',
 'Try three different noodle dishes together and pick the group''s favourite.',
 'ลองก๋วยเตี๋ยวสามแบบด้วยกัน แล้วเลือกจานที่ชอบที่สุดของกลุ่ม', 10, 1),
('🥟', 'Three Thai snacks', 'ขนมไทยสามอย่าง',
 'Everyone tries three Thai snacks they have never had before.',
 'ทุกคนลองขนมไทยสามอย่างที่ไม่เคยกินมาก่อน', 10, 2),
('🛍️', '฿200 market challenge', 'ชาเลนจ์ตลาด 200 บาท',
 'Each person has ฿200 to spend at a market. Show the group your best find.',
 'แต่ละคนมีงบ 200 บาทในตลาด แล้วอวดของที่ดีที่สุดให้กลุ่มดู', 10, 3),
('📸', 'Street-art photo hunt', 'ล่าภาพสตรีทอาร์ต',
 'Find and photograph five murals or street-art pieces together.',
 'ช่วยกันหาและถ่ายรูปภาพวาดฝาผนังหรือสตรีทอาร์ตห้าชิ้น', 10, 4),
('☕', 'Three-café hop', 'ตะลุยสามคาเฟ่',
 'Visit three cafés in one meetup and rate them together.',
 'ไปคาเฟ่สามร้านในการนัดเดียว แล้วช่วยกันให้คะแนน', 10, 5),
('🌅', 'Sunset photo walk', 'เดินถ่ายรูปพระอาทิตย์ตก',
 'Take a group photo at sunset.',
 'ถ่ายรูปหมู่ตอนพระอาทิตย์ตก', 10, 6),
('🗣️', 'Language exchange', 'แลกเปลี่ยนภาษา',
 'Everyone teaches the group three useful words in their own language.',
 'ทุกคนสอนคำที่มีประโยชน์สามคำในภาษาของตัวเองให้กลุ่ม', 10, 7),
('🌶️', 'Spice level up', 'เพิ่มระดับความเผ็ด',
 'Order one dish a little spicier than you usually would.',
 'สั่งอาหารหนึ่งจานให้เผ็ดกว่าปกติอีกนิด', 10, 8);

alter table public.meetups
  add column challenge_id uuid references public.challenges (id) on delete set null;

-- Host only, while open and not over. Null clears it. Errors: auth_required, invalid_challenge, not_host, not_found.
create function public.set_meetup_challenge(p_meetup_id uuid, p_challenge_id uuid)
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
  if p_challenge_id is not null
     and not exists (select 1 from public.challenges c where c.id = p_challenge_id and c.is_active) then
    raise exception 'invalid_challenge';
  end if;
  update public.meetups m set challenge_id = p_challenge_id
  where m.id = p_meetup_id and m.host_id = v_uid and m.status = 'open' and m.ends_at > now();
  if not found then
    if exists (select 1 from public.meetups m where m.id = p_meetup_id) then
      raise exception 'not_host';
    end if;
    raise exception 'not_found';
  end if;
end;
$$;

revoke execute on function public.set_meetup_challenge(uuid, uuid) from public, anon;
grant execute on function public.set_meetup_challenge(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Host completion code (backup when GPS check-in doesn't work)
-- ---------------------------------------------------------------------------

create table public.meetup_completions (
  meetup_id uuid primary key references public.meetups (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{6}$'),
  -- collecting → pending (4+ confirmed, waiting for the founder) → approved / rejected
  status text not null default 'collecting' check (status in ('collecting', 'pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_note text check (review_note is null or length(review_note) <= 300)
);

alter table public.meetup_completions enable row level security;

create policy "Admins read completions"
on public.meetup_completions for select
to authenticated
using ((select public.is_admin()));

create table public.meetup_code_confirmations (
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);

alter table public.meetup_code_confirmations enable row level security;

create policy "Members see code confirmations of their meetups"
on public.meetup_code_confirmations for select
to authenticated
using (
  exists (
    select 1 from public.meetup_members mm
    where mm.meetup_id = meetup_code_confirmations.meetup_id and mm.user_id = (select auth.uid())
  )
  or (select public.is_admin())
);

create table public.meetup_code_failures (
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  failed_at timestamptz not null default now()
);

create index meetup_code_failures_idx on public.meetup_code_failures (meetup_id, user_id, failed_at);

alter table public.meetup_code_failures enable row level security;
revoke all on public.meetup_code_failures from anon, authenticated;

-- The code works from the start until 6 hours after the end.
create function public.meetup_code_window_open(p_meetup public.meetups)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_meetup.status = 'open' and now() >= p_meetup.starts_at and now() < p_meetup.ends_at + interval '6 hours';
$$;

-- Host: show (and create the first time) the completion code. The host counts as confirmed.
-- Errors: auth_required, not_host, meetup_cancelled, not_started, too_late.
create function public.start_completion_code(p_meetup_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_meetup public.meetups%rowtype;
  v_code text;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  select * into v_meetup from public.meetups m where m.id = p_meetup_id for update;
  if not found or v_meetup.host_id <> v_uid then
    raise exception 'not_host';
  end if;
  if v_meetup.status <> 'open' then
    raise exception 'meetup_cancelled';
  end if;
  if now() < v_meetup.starts_at then
    raise exception 'not_started';
  end if;
  if now() >= v_meetup.ends_at + interval '6 hours' then
    raise exception 'too_late';
  end if;

  select c.code into v_code from public.meetup_completions c where c.meetup_id = p_meetup_id;
  if v_code is null then
    v_code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
    insert into public.meetup_completions (meetup_id, code) values (p_meetup_id, v_code);
  end if;
  insert into public.meetup_code_confirmations (meetup_id, user_id) values (p_meetup_id, v_uid) on conflict do nothing;
  return v_code;
end;
$$;

revoke execute on function public.start_completion_code(uuid) from public, anon;
grant execute on function public.start_completion_code(uuid) to authenticated;

-- Member: type the host's code. Returns 'ok' or 'wrong_code' (a wrong try is recorded, so it isn't an error).
-- At 4+ confirmations it goes to the founder for review. Errors: auth_required, not_member, meetup_cancelled,
-- not_started, too_late, no_code, too_many_attempts.
create function public.confirm_completion_code(p_meetup_id uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_meetup public.meetups%rowtype;
  v_completion public.meetup_completions%rowtype;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  select * into v_meetup from public.meetups m where m.id = p_meetup_id;
  if not found
     or not exists (select 1 from public.meetup_members mm where mm.meetup_id = p_meetup_id and mm.user_id = v_uid) then
    raise exception 'not_member';
  end if;
  if v_meetup.status <> 'open' then
    raise exception 'meetup_cancelled';
  end if;
  if now() < v_meetup.starts_at then
    raise exception 'not_started';
  end if;
  if now() >= v_meetup.ends_at + interval '6 hours' then
    raise exception 'too_late';
  end if;
  select * into v_completion from public.meetup_completions c where c.meetup_id = p_meetup_id for update;
  if not found then
    raise exception 'no_code';
  end if;
  if (
    select count(*) from public.meetup_code_failures f
    where f.meetup_id = p_meetup_id and f.user_id = v_uid and f.failed_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'too_many_attempts';
  end if;
  if v_completion.code <> trim(coalesce(p_code, '')) then
    insert into public.meetup_code_failures (meetup_id, user_id) values (p_meetup_id, v_uid);
    return 'wrong_code';
  end if;

  insert into public.meetup_code_confirmations (meetup_id, user_id) values (p_meetup_id, v_uid) on conflict do nothing;
  if v_completion.status = 'collecting' and (
    select count(*) from public.meetup_code_confirmations cc
    join public.meetup_members mm on mm.meetup_id = cc.meetup_id and mm.user_id = cc.user_id
    where cc.meetup_id = p_meetup_id
  ) >= 4 then
    update public.meetup_completions c set status = 'pending', submitted_at = now() where c.meetup_id = p_meetup_id;
  end if;
  return 'ok';
end;
$$;

revoke execute on function public.confirm_completion_code(uuid, text) from public, anon;
grant execute on function public.confirm_completion_code(uuid, text) to authenticated;

-- Founder: approve or reject a code-confirmed meetup. Errors: not allowed, not_pending.
create function public.admin_review_completion(p_meetup_id uuid, p_approve boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.meetup_completions c
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_at = now(),
      review_note = nullif(left(trim(coalesce(p_note, '')), 300), '')
  where c.meetup_id = p_meetup_id and c.status = 'pending';
  if not found then
    raise exception 'not_pending';
  end if;
end;
$$;

revoke execute on function public.admin_review_completion(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_completion(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Milestone rewards (founder-managed)
-- ---------------------------------------------------------------------------

create table public.passport_rewards (
  id uuid primary key default gen_random_uuid(),
  milestone integer not null check (milestone in (3, 5, 10)),
  title_en text not null check (length(trim(title_en)) between 1 and 100),
  title_th text not null check (length(trim(title_th)) between 1 and 100),
  details_en text not null default '' check (length(details_en) <= 500),
  details_th text not null default '' check (length(details_th) <= 500),
  venue_id uuid references public.venues (id) on delete set null,
  coupon_code text check (coupon_code is null or length(trim(coupon_code)) between 1 and 60),
  link text check (link is null or (link ~ '^https://[^\s]+$' and length(link) <= 500)),
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.passport_rewards enable row level security;

-- People only see rewards (and their codes) through my_passport.
create policy "Admins manage passport rewards"
on public.passport_rewards for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Working out the passport
-- ---------------------------------------------------------------------------

-- The Bangkok district a point is in (nearest district centre within ~15 km).
create function public.district_near(p_lat double precision, p_lng double precision)
returns table (name text, name_en text, name_th text)
language sql
stable
set search_path = ''
as $$
  select a.name, a.name_en, a.name_th
  from public.areas a
  where p_lat is not null and p_lng is not null and a.kind = 'district'
    and a.lat between p_lat - 0.15 and p_lat + 0.15
    and a.lng between p_lng - 0.15 and p_lng + 0.15
  order by (a.lat - p_lat) ^ 2 + ((a.lng - p_lng) * 0.97) ^ 2
  limit 1;
$$;

-- Who is credited for a meetup and how ('gps' or 'code'). Empty until it has ended.
create function public.meetup_credited(p_meetup_id uuid)
returns table (user_id uuid, method text)
language sql
stable
security definer
set search_path = ''
as $$
  with meetup as (
    select 1 from public.meetups m where m.id = p_meetup_id and m.status = 'open' and m.ends_at <= now()
  ),
  gps as (
    select c.user_id
    from public.meetup_checkins c
    join public.meetup_members mm on mm.meetup_id = c.meetup_id and mm.user_id = c.user_id
    where c.meetup_id = p_meetup_id and exists (select 1 from meetup)
  ),
  gps_ok as (
    select g.user_id from gps g where (select count(*) from gps) >= 4
  ),
  code as (
    select cc.user_id
    from public.meetup_code_confirmations cc
    join public.meetup_members mm on mm.meetup_id = cc.meetup_id and mm.user_id = cc.user_id
    join public.meetup_completions mc on mc.meetup_id = cc.meetup_id and mc.status = 'approved'
    where cc.meetup_id = p_meetup_id and exists (select 1 from meetup)
  )
  select g.user_id, 'gps' from gps_ok g
  union all
  select c.user_id, 'code' from code c where c.user_id not in (select g.user_id from gps_ok g);
$$;

revoke execute on function public.meetup_credited(uuid) from public, anon, authenticated;

-- A person's verified meetups, oldest first, with whether each counts (first of its local day) and its points.
create function public.passport_entries(p_user_id uuid)
returns table (
  meetup_id uuid,
  kind public.meetup_kind,
  title text,
  place_name text,
  starts_at timestamptz,
  method text,
  is_host boolean,
  challenge_id uuid,
  counted boolean,
  points integer,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select m.*, cr.method,
           row_number() over (
             partition by (m.starts_at at time zone m.time_zone)::date order by m.starts_at, m.id
           ) as day_rank
    from public.meetup_members mm
    join public.meetups m on m.id = mm.meetup_id
    cross join lateral (
      select c.method from public.meetup_credited(m.id) c where c.user_id = p_user_id limit 1
    ) cr
    where mm.user_id = p_user_id and m.status = 'open' and m.ends_at <= now()
  )
  select
    mine.id, mine.kind, mine.title,
    coalesce(v.name_en, p.name_en, p.name, mine.spot_name),
    mine.starts_at, mine.method, mine.host_id = p_user_id, mine.challenge_id,
    mine.day_rank = 1,
    case when mine.day_rank = 1
      then 10 + (case when mine.host_id = p_user_id then 5 else 0 end) + coalesce(ch.points, 0)
      else 0 end,
    t.lat, t.lng
  from mine
  left join public.venues v on v.id = mine.venue_id
  left join public.places p on p.id = mine.place_id
  left join public.challenges ch on ch.id = mine.challenge_id
  cross join lateral public.meetup_checkin_target(mine.id) t
  order by mine.starts_at;
$$;

revoke execute on function public.passport_entries(uuid) from public, anon, authenticated;

-- My passport:
-- { points, verified, next_milestone, stamps: [{ name, name_en, name_th, count, first_at }],
--   meetups: [{ id, kind, title, place_name, starts_at, method, counted, points, challenge_id }] (newest first),
--   rewards: [{ id, milestone, title_en, title_th, details_en, details_th, unlocked, coupon_code, link,
--               venue_id }], pending_reviews }
create function public.my_passport()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with rows as (
    select * from public.passport_entries((select auth.uid()))
  ),
  totals as (
    select count(*) filter (where counted) as verified, coalesce(sum(points), 0) as points from rows
  )
  select case when (select auth.uid()) is null then null else jsonb_build_object(
    'points', (select points from totals),
    'verified', (select verified from totals),
    'next_milestone', (select min(x) from unnest(array[3, 5, 10]) x where x > (select verified from totals)),
    'stamps', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.name, 'name_en', s.name_en, 'name_th', s.name_th,
                                          'count', s.n, 'first_at', s.first_at) order by s.first_at)
      from (
        select d.name, max(d.name_en) as name_en, max(d.name_th) as name_th, count(*) as n, min(r.starts_at) as first_at
        from rows r
        cross join lateral public.district_near(r.lat, r.lng) d
        where r.counted
        group by d.name
      ) s
    ), '[]'::jsonb),
    'meetups', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.meetup_id, 'kind', r.kind, 'title', r.title,
                                          'place_name', r.place_name, 'starts_at', r.starts_at, 'method', r.method,
                                          'is_host', r.is_host, 'counted', r.counted, 'points', r.points,
                                          'challenge_id', r.challenge_id) order by r.starts_at desc)
      from rows r
    ), '[]'::jsonb),
    'rewards', coalesce((
      select jsonb_agg(jsonb_build_object('id', pr.id, 'milestone', pr.milestone, 'title_en', pr.title_en,
                                          'title_th', pr.title_th, 'details_en', pr.details_en,
                                          'details_th', pr.details_th, 'venue_id', pr.venue_id,
                                          'unlocked', (select verified from totals) >= pr.milestone,
                                          'coupon_code', case when (select verified from totals) >= pr.milestone
                                                              then pr.coupon_code end,
                                          'link', case when (select verified from totals) >= pr.milestone
                                                       then pr.link end)
                       order by pr.milestone, pr.created_at)
      from public.passport_rewards pr
      where pr.is_active and (pr.ends_at is null or pr.ends_at > now())
    ), '[]'::jsonb),
    'pending_reviews', (
      select count(*) from public.meetup_code_confirmations cc
      join public.meetup_completions mc on mc.meetup_id = cc.meetup_id and mc.status in ('collecting', 'pending')
      where cc.user_id = (select auth.uid())
    )
  ) end;
$$;

revoke execute on function public.my_passport() from public, anon;
grant execute on function public.my_passport() to authenticated;

-- Points / verified meetups / stamps for anyone's profile (signed-in, not across a block).
create function public.passport_summary(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when (select auth.uid()) is null or exists (
    select 1 from public.blocks b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = p_user_id)
       or (b.blocker_id = p_user_id and b.blocked_id = (select auth.uid()))
  ) then null else (
    select jsonb_build_object(
      'points', coalesce(sum(r.points), 0),
      'verified', count(*) filter (where r.counted),
      'stamps', (
        select count(distinct d.name) from public.passport_entries(p_user_id) r2
        cross join lateral public.district_near(r2.lat, r2.lng) d where r2.counted
      )
    )
    from public.passport_entries(p_user_id) r
  ) end;
$$;

revoke execute on function public.passport_summary(uuid) from public, anon;
grant execute on function public.passport_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The table / hangout screen: check-in state for every meetup, plus the completion code
-- ---------------------------------------------------------------------------

-- As before, with `venue` now the check-in target of any meetup, plus `passport`:
-- { needed: 4, verified, method, ends_at, code_status ('none' | 'collecting' | 'pending' | 'approved' | 'rejected'),
--   confirmations, me_confirmed, code (host only), code_open }.
create or replace function public.meetup_coupon_state(p_meetup_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_meetup public.meetups%rowtype;
  v_me_in boolean;
  v_venue jsonb;
  v_deals jsonb;
  v_completion public.meetup_completions%rowtype;
  v_method text;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  select * into v_meetup from public.meetups m where m.id = p_meetup_id;
  if not found
     or not exists (select 1 from public.meetup_members mm where mm.meetup_id = p_meetup_id and mm.user_id = v_uid) then
    raise exception 'not_member';
  end if;

  v_me_in := exists (select 1 from public.meetup_checkins c where c.meetup_id = p_meetup_id and c.user_id = v_uid);

  select jsonb_build_object('lat', t.lat, 'lng', t.lng, 'radius_m', t.radius_m) into v_venue
  from public.meetup_checkin_target(p_meetup_id) t where t.lat is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'kind', d.kind,
    'title_en', d.title_en,
    'title_th', d.title_th,
    'needed', public.coupon_people_needed(d.kind),
    'redeemed_at', (
      select max(q.used_at) from public.redemption_qrs q
      where q.meetup_id = p_meetup_id and q.deal_id = d.id and q.used_at is not null
    ),
    'qr_token', case when v_me_in then q.token end,
    'qr_expires_at', q.expires_at
  ) order by d.kind, d.created_at), '[]'::jsonb) into v_deals
  from public.meetup_coupon_deals(p_meetup_id) d
  left join lateral (
    select q.token, q.expires_at from public.redemption_qrs q
    where q.meetup_id = p_meetup_id and q.deal_id = d.id and q.used_at is null and q.expires_at > now()
    order by q.issued_at desc limit 1
  ) q on true;

  select * into v_completion from public.meetup_completions c where c.meetup_id = p_meetup_id;
  select c.method into v_method from public.meetup_credited(p_meetup_id) c where c.user_id = v_uid limit 1;

  return jsonb_build_object(
    'checked_in', public.meetup_checked_in_count(p_meetup_id),
    'me_checked_in', v_me_in,
    'window_open', v_meetup.status = 'open'
      and now() >= v_meetup.starts_at - interval '15 minutes' and now() < v_meetup.ends_at,
    'venue', v_venue,
    'deals', v_deals,
    'passport', jsonb_build_object(
      'needed', 4,
      'ended', v_meetup.ends_at <= now(),
      'verified', v_method is not null,
      'method', v_method,
      'code_status', coalesce(v_completion.status, 'none'),
      'confirmations', (
        select count(*) from public.meetup_code_confirmations cc
        join public.meetup_members mm on mm.meetup_id = cc.meetup_id and mm.user_id = cc.user_id
        where cc.meetup_id = p_meetup_id
      ),
      'me_confirmed', exists (
        select 1 from public.meetup_code_confirmations cc where cc.meetup_id = p_meetup_id and cc.user_id = v_uid
      ),
      'code', case when v_meetup.host_id = v_uid then v_completion.code end,
      'code_open', public.meetup_code_window_open(v_meetup)
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Feed: the challenge of each open meetup
-- ---------------------------------------------------------------------------

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
  challenge_id uuid
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
    m.challenge_id
  from public.meetups m
  left join public.venues v on v.id = m.venue_id
  left join public.places p on p.id = m.place_id
  left join lateral public.area_near(coalesce(p.lat, m.spot_lat, v.lat), coalesce(p.lng, m.spot_lng, v.lng)) a on true
  where m.status = 'open' and m.ends_at > now() and (m.venue_id is null or v.is_active)
  order by m.starts_at;
$$;

revoke execute on function public.list_open_meetups() from public, anon;
grant execute on function public.list_open_meetups() to authenticated;
