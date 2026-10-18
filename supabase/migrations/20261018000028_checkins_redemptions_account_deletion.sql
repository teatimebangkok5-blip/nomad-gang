-- Check-ins, redemption QR codes, venue staff sessions, redemptions, and deleting your own account.
--
-- Coupon flow (CLAUDE.md "Coupon redemption"):
-- 1. check_in(meetup, lat, lng): a member at the venue (within venues.checkin_radius_m, 50 m by default, checked here
--    with PostGIS; the phone's own check only shows the button) while the table / hangout is happening (from 15 min
--    before it starts until it ends).
-- 2. issue_redemption_qr(meetup, deal): a checked-in member asks for the group's QR once enough members are checked in
--    (discount / offer: 3; ticket: 1, the founder's rule for ticket discounts). Valid 15 minutes; asking again returns
--    the same code until it expires. One redemption per table / hangout and promotion.
-- 3. The QR holds a link to the web page /r/<token>. Staff log in with their venue login there (staff_sign_in,
--    service role only, per-IP and per-login limits) and stay signed in (venue_staff_sessions, 90 days).
--    staff_redeem marks the QR used, records the redemption and returns the coupon code. Another venue's login is
--    rejected without using up the code.
-- 4. Redemptions are readable by admins only (live feed in the admin panel via Realtime).
--
-- Account deletion: delete_my_account() deletes the caller's login and with it every row that belongs to them
-- (all foreign keys cascade). Before that, groups they own pass to the next member and tables / hangouts they host
-- that other people joined pass to the longest other member (upcoming ones are cancelled), so other people keep
-- their chats and history. my_account_files() lists their chat files so the app can delete them first.

-- ---------------------------------------------------------------------------
-- Check-ins
-- ---------------------------------------------------------------------------

create table public.meetup_checkins (
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);

create index meetup_checkins_user_id_idx on public.meetup_checkins (user_id);

alter table public.meetup_checkins enable row level security;

-- Members see who in their table / hangout is checked in. Writes only through check_in.
create policy "Members see check-ins of their meetups"
on public.meetup_checkins for select
to authenticated
using (
  exists (
    select 1 from public.meetup_members mm
    where mm.meetup_id = meetup_checkins.meetup_id and mm.user_id = (select auth.uid())
  )
  or (select public.is_admin())
);

-- Check-ins of people who are still members (someone who left doesn't count).
create function public.meetup_checked_in_count(p_meetup_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.meetup_checkins c
  join public.meetup_members mm on mm.meetup_id = c.meetup_id and mm.user_id = c.user_id
  where c.meetup_id = p_meetup_id;
$$;

revoke execute on function public.meetup_checked_in_count(uuid) from public, anon, authenticated;

-- How many checked-in members a promotion needs.
create function public.coupon_people_needed(p_kind public.promotion_kind)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_kind = 'ticket' then 1 else 3 end;
$$;

-- Promotions with a coupon that a table / hangout can use now: tables use the venue's discount / offer, hangouts its
-- ticket discounts.
create function public.meetup_coupon_deals(p_meetup_id uuid)
returns setof public.deals
language sql
stable
security definer
set search_path = ''
as $$
  select d.*
  from public.meetups m
  join public.venues v on v.id = m.venue_id and v.is_active
  join public.deals d on d.venue_id = v.id
  where m.id = p_meetup_id
    and d.is_active
    and exists (select 1 from public.deal_coupons dc where dc.deal_id = d.id)
    and (
      (m.kind = 'table' and d.kind in ('discount', 'offer'))
      or (m.kind = 'hangout' and d.kind = 'ticket')
    )
    and (d.starts_at is null or d.starts_at <= now())
    and (d.ends_at is null or d.ends_at > now());
$$;

revoke execute on function public.meetup_coupon_deals(uuid) from public, anon, authenticated;

-- Check in at the venue. Returns how many members are checked in.
-- Errors: auth_required, not_member, meetup_cancelled, not_now, no_venue, too_far.
create function public.check_in(p_meetup_id uuid, p_lat double precision, p_lng double precision)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_meetup public.meetups%rowtype;
  v_venue public.venues%rowtype;
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
  select * into v_venue from public.venues v where v.id = v_meetup.venue_id and v.is_active;
  if not found then
    raise exception 'no_venue';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180
     or not extensions.st_dwithin(
       v_venue.location,
       extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
       v_venue.checkin_radius_m
     ) then
    raise exception 'too_far';
  end if;

  insert into public.meetup_checkins (meetup_id, user_id) values (p_meetup_id, v_uid) on conflict do nothing;
  return public.meetup_checked_in_count(p_meetup_id);
end;
$$;

revoke execute on function public.check_in(uuid, double precision, double precision) from public, anon;
grant execute on function public.check_in(uuid, double precision, double precision) to authenticated;

-- ---------------------------------------------------------------------------
-- Redemption QR codes and redemptions
-- ---------------------------------------------------------------------------

create table public.redemption_qrs (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  deal_id uuid not null references public.deals (id) on delete cascade,
  venue_id uuid not null references public.venues (id) on delete cascade,
  issued_by uuid references public.profiles (id) on delete set null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index redemption_qrs_meetup_deal_idx on public.redemption_qrs (meetup_id, deal_id);

alter table public.redemption_qrs enable row level security;
-- No policies and no grants: tokens are only handed out by issue_redemption_qr / meetup_coupon_state.
revoke all on public.redemption_qrs from anon, authenticated;

-- What the founder settles with venue owners on. Names are copied so the record stays readable after a venue,
-- promotion or account is deleted.
create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  qr_id uuid unique references public.redemption_qrs (id) on delete set null,
  meetup_id uuid references public.meetups (id) on delete set null,
  venue_id uuid references public.venues (id) on delete set null,
  deal_id uuid references public.deals (id) on delete set null,
  venue_account_id uuid references public.venue_accounts (id) on delete set null,
  venue_name text not null,
  deal_title text not null,
  deal_kind public.promotion_kind not null,
  staff_login text not null,
  checked_in_count integer not null,
  member_ids uuid[] not null default '{}',
  member_names text[] not null default '{}',
  redeemed_at timestamptz not null default now()
);

create index redemptions_venue_time_idx on public.redemptions (venue_id, redeemed_at desc);
create index redemptions_time_idx on public.redemptions (redeemed_at desc);

alter table public.redemptions enable row level security;

create policy "Admins read redemptions"
on public.redemptions for select
to authenticated
using ((select public.is_admin()));

-- The group's coupon status for the table / hangout screen (members only):
-- { checked_in, me_checked_in, window_open, venue: {lat, lng, radius_m} | null,
--   deals: [{ id, kind, title_en, title_th, needed, redeemed_at, qr_token, qr_expires_at }] }
-- qr_token is only given to checked-in members.
create function public.meetup_coupon_state(p_meetup_id uuid)
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

  select jsonb_build_object('lat', v.lat, 'lng', v.lng, 'radius_m', v.checkin_radius_m) into v_venue
  from public.venues v where v.id = v_meetup.venue_id and v.is_active;

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

  return jsonb_build_object(
    'checked_in', public.meetup_checked_in_count(p_meetup_id),
    'me_checked_in', v_me_in,
    'window_open', v_meetup.status = 'open'
      and now() >= v_meetup.starts_at - interval '15 minutes' and now() < v_meetup.ends_at,
    'venue', v_venue,
    'deals', v_deals
  );
end;
$$;

revoke execute on function public.meetup_coupon_state(uuid) from public, anon;
grant execute on function public.meetup_coupon_state(uuid) to authenticated;

-- A checked-in member asks for the group's QR. Returns the token and when it expires.
-- Errors: auth_required, not_checked_in, meetup_cancelled, not_now, no_coupon, already_redeemed, need_more_people.
create function public.issue_redemption_qr(p_meetup_id uuid, p_deal_id uuid)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_meetup public.meetups%rowtype;
  v_deal public.deals%rowtype;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  -- Locked so two members asking at once get the same code.
  select * into v_meetup from public.meetups m where m.id = p_meetup_id for update;
  if not found or not exists (
    select 1 from public.meetup_checkins c
    join public.meetup_members mm on mm.meetup_id = c.meetup_id and mm.user_id = c.user_id
    where c.meetup_id = p_meetup_id and c.user_id = v_uid
  ) then
    raise exception 'not_checked_in';
  end if;
  if v_meetup.status <> 'open' then
    raise exception 'meetup_cancelled';
  end if;
  if now() < v_meetup.starts_at - interval '15 minutes' or now() >= v_meetup.ends_at then
    raise exception 'not_now';
  end if;
  select * into v_deal from public.meetup_coupon_deals(p_meetup_id) d where d.id = p_deal_id;
  if not found then
    raise exception 'no_coupon';
  end if;
  if exists (
    select 1 from public.redemption_qrs q
    where q.meetup_id = p_meetup_id and q.deal_id = p_deal_id and q.used_at is not null
  ) then
    raise exception 'already_redeemed';
  end if;
  if public.meetup_checked_in_count(p_meetup_id) < public.coupon_people_needed(v_deal.kind) then
    raise exception 'need_more_people';
  end if;

  return query
    select q.token, q.expires_at from public.redemption_qrs q
    where q.meetup_id = p_meetup_id and q.deal_id = p_deal_id and q.used_at is null and q.expires_at > now()
    order by q.issued_at desc limit 1;
  if found then
    return;
  end if;

  return query
    insert into public.redemption_qrs as q (token, meetup_id, deal_id, venue_id, issued_by, expires_at)
    values (
      encode(extensions.gen_random_bytes(24), 'hex'), p_meetup_id, p_deal_id, v_deal.venue_id, v_uid,
      now() + interval '15 minutes'
    )
    returning q.token, q.expires_at;
end;
$$;

revoke execute on function public.issue_redemption_qr(uuid, uuid) from public, anon;
grant execute on function public.issue_redemption_qr(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Venue staff sessions (the web page keeps staff signed in). Service role only.
-- ---------------------------------------------------------------------------

create table public.venue_staff_sessions (
  token_hash text primary key,
  account_id uuid not null references public.venue_accounts (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index venue_staff_sessions_account_idx on public.venue_staff_sessions (account_id);

alter table public.venue_staff_sessions enable row level security;
revoke all on public.venue_staff_sessions from anon, authenticated;

-- Failed staff logins per IP address (on top of the per-login lock in verify_venue_login).
create table public.staff_login_failures (
  ip text not null,
  failed_at timestamptz not null default now()
);

create index staff_login_failures_ip_idx on public.staff_login_failures (ip, failed_at);

alter table public.staff_login_failures enable row level security;
revoke all on public.staff_login_failures from anon, authenticated;

create function public.staff_token_hash(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- Log in. Returns the session token (kept in a cookie by the web page) and the venue, or no rows for a wrong /
-- locked / turned-off login. Error too_many_attempts: 20 failures from one IP in 15 minutes.
create function public.staff_sign_in(p_login_id text, p_password text, p_ip text)
returns table (session_token text, venue_id uuid, venue_name_en text, venue_name_th text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_venue_id uuid;
  v_token text;
begin
  delete from public.staff_login_failures f where f.failed_at < now() - interval '1 day';
  if p_ip is not null and (
    select count(*) from public.staff_login_failures f where f.ip = p_ip and f.failed_at > now() - interval '15 minutes'
  ) >= 20 then
    raise exception 'too_many_attempts';
  end if;

  select l.account_id, l.venue_id into v_account_id, v_venue_id
  from public.verify_venue_login(p_login_id, p_password) l;
  if v_account_id is null then
    if p_ip is not null then
      insert into public.staff_login_failures (ip) values (p_ip);
    end if;
    return;
  end if;

  delete from public.venue_staff_sessions s where s.expires_at < now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.venue_staff_sessions (token_hash, account_id, expires_at)
  values (public.staff_token_hash(v_token), v_account_id, now() + interval '90 days');

  return query
    select v_token, v.id, v.name_en, v.name_th from public.venues v where v.id = v_venue_id;
end;
$$;

-- The signed-in staff login, or no rows.
create function public.staff_session(p_session_token text)
returns table (account_id uuid, login_id text, venue_id uuid, venue_name_en text, venue_name_th text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.login_id, v.id, v.name_en, v.name_th
  from public.venue_staff_sessions s
  join public.venue_accounts a on a.id = s.account_id and a.is_active
  join public.venues v on v.id = a.venue_id
  where s.token_hash = public.staff_token_hash(p_session_token) and s.expires_at > now();
$$;

create function public.staff_sign_out(p_session_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.venue_staff_sessions s where s.token_hash = public.staff_token_hash(p_session_token);
$$;

-- What a QR is for, without using it up: { status, venue_name_en, deal_title_en, deal_title_th, checked_in,
-- expires_at }. status: ok, signed_out, invalid, used, expired, wrong_venue.
create function public.staff_check_qr(p_session_token text, p_qr_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session record;
  v_qr public.redemption_qrs%rowtype;
  v_deal public.deals%rowtype;
begin
  select * into v_session from public.staff_session(p_session_token);
  if not found then
    return jsonb_build_object('status', 'signed_out');
  end if;
  select * into v_qr from public.redemption_qrs q where q.token = p_qr_token;
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_qr.venue_id <> v_session.venue_id then
    return jsonb_build_object('status', 'wrong_venue');
  end if;
  if v_qr.used_at is not null then
    return jsonb_build_object('status', 'used', 'used_at', v_qr.used_at);
  end if;
  if v_qr.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;
  select * into v_deal from public.deals d where d.id = v_qr.deal_id;
  return jsonb_build_object(
    'status', 'ok',
    'venue_name_en', v_session.venue_name_en,
    'deal_title_en', v_deal.title_en,
    'deal_title_th', v_deal.title_th,
    'checked_in', public.meetup_checked_in_count(v_qr.meetup_id),
    'expires_at', v_qr.expires_at
  );
end;
$$;

-- Use the QR: mark it used, record the redemption and return the coupon code.
-- { status, coupon_code, deal_title_en, deal_title_th, venue_name_en, checked_in, member_names, redeemed_at }.
-- status: ok, signed_out, invalid, used, expired, wrong_venue, no_coupon (promotion turned off since).
create function public.staff_redeem(p_session_token text, p_qr_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session record;
  v_qr public.redemption_qrs%rowtype;
  v_meetup public.meetups%rowtype;
  v_deal public.deals%rowtype;
  v_code text;
  v_ids uuid[];
  v_names text[];
  v_count integer;
  v_now timestamptz := now();
begin
  select * into v_session from public.staff_session(p_session_token);
  if not found then
    return jsonb_build_object('status', 'signed_out');
  end if;
  select * into v_qr from public.redemption_qrs q where q.token = p_qr_token for update;
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_qr.venue_id <> v_session.venue_id then
    return jsonb_build_object('status', 'wrong_venue');
  end if;
  if v_qr.used_at is not null then
    return jsonb_build_object('status', 'used', 'used_at', v_qr.used_at);
  end if;
  if v_qr.expires_at <= v_now then
    return jsonb_build_object('status', 'expired');
  end if;
  select * into v_meetup from public.meetups m where m.id = v_qr.meetup_id;
  if not found or v_meetup.status <> 'open' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_deal from public.deals d where d.id = v_qr.deal_id and d.is_active;
  select dc.coupon_code into v_code from public.deal_coupons dc where dc.deal_id = v_qr.deal_id;
  if v_deal.id is null or v_code is null then
    return jsonb_build_object('status', 'no_coupon');
  end if;

  select coalesce(array_agg(p.id order by c.checked_in_at), '{}'), coalesce(array_agg(p.display_name order by c.checked_in_at), '{}')
  into v_ids, v_names
  from public.meetup_checkins c
  join public.meetup_members mm on mm.meetup_id = c.meetup_id and mm.user_id = c.user_id
  join public.profiles p on p.id = c.user_id
  where c.meetup_id = v_qr.meetup_id;
  v_count := cardinality(v_ids);

  update public.redemption_qrs q set used_at = v_now where q.id = v_qr.id;
  insert into public.redemptions (
    qr_id, meetup_id, venue_id, deal_id, venue_account_id, venue_name, deal_title, deal_kind, staff_login,
    checked_in_count, member_ids, member_names, redeemed_at
  ) values (
    v_qr.id, v_qr.meetup_id, v_qr.venue_id, v_qr.deal_id, v_session.account_id, v_session.venue_name_en,
    v_deal.title_en, v_deal.kind, v_session.login_id, v_count, v_ids, v_names, v_now
  );

  return jsonb_build_object(
    'status', 'ok',
    'coupon_code', v_code,
    'deal_title_en', v_deal.title_en,
    'deal_title_th', v_deal.title_th,
    'venue_name_en', v_session.venue_name_en,
    'checked_in', v_count,
    'member_names', to_jsonb(v_names),
    'redeemed_at', v_now
  );
end;
$$;

revoke execute on function public.staff_token_hash(text) from public, anon, authenticated;
revoke execute on function public.staff_sign_in(text, text, text) from public, anon, authenticated;
revoke execute on function public.staff_session(text) from public, anon, authenticated;
revoke execute on function public.staff_sign_out(text) from public, anon, authenticated;
revoke execute on function public.staff_check_qr(text, text) from public, anon, authenticated;
revoke execute on function public.staff_redeem(text, text) from public, anon, authenticated;
grant execute on function public.staff_sign_in(text, text, text) to service_role;
grant execute on function public.staff_session(text) to service_role;
grant execute on function public.staff_sign_out(text) to service_role;
grant execute on function public.staff_check_qr(text, text) to service_role;
grant execute on function public.staff_redeem(text, text) to service_role;

-- Live: members see check-ins arrive; the founder's redemption feed.
alter publication supabase_realtime add table public.meetup_checkins, public.redemptions;

-- ---------------------------------------------------------------------------
-- Deleting your own account
-- ---------------------------------------------------------------------------

-- My chat files (photos, voice notes) still in chats, so the app can delete them before the account goes.
create function public.my_account_files()
returns table (bucket text, path text)
language sql
stable
security definer
set search_path = ''
as $$
  select 'chat-media', m.media_path from public.meetup_messages m
  where m.sender_id = (select auth.uid()) and m.media_path is not null
  union all
  select 'chat-media', m.media_path from public.direct_messages m
  where m.sender_id = (select auth.uid()) and m.media_path is not null
  union all
  select 'chat-media', m.media_path from public.chat_group_messages m
  where m.sender_id = (select auth.uid()) and m.media_path is not null;
$$;

revoke execute on function public.my_account_files() from public, anon;
grant execute on function public.my_account_files() to authenticated;

-- Deletes the caller's account and everything that belongs to it. Errors: auth_required.
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_group uuid;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;

  -- Groups: leaving passes the owner role on (and deletes a group nobody is left in).
  for v_group in select gm.group_id from public.chat_group_members gm where gm.user_id = v_uid loop
    perform public.leave_group(v_group);
  end loop;

  -- Tables / hangouts I host: upcoming or running ones are cancelled; any that other people joined pass to the
  -- longest other member so their chat and history stay. The rest go with the account.
  update public.meetups m set status = 'cancelled'
  where m.host_id = v_uid and m.status = 'open' and m.ends_at > now();
  update public.meetups m
  set host_id = (
    select mm.user_id from public.meetup_members mm
    where mm.meetup_id = m.id and mm.user_id <> v_uid
    order by mm.joined_at, mm.user_id limit 1
  )
  where m.host_id = v_uid
    and exists (select 1 from public.meetup_members mm where mm.meetup_id = m.id and mm.user_id <> v_uid);

  delete from auth.users u where u.id = v_uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
