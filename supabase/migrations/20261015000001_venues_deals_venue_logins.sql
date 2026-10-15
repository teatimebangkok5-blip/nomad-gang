-- TableMeet: partner venues, their deals, venue staff logins and the founder (admin) role.
--
-- Security model
--   * App users (anon / authenticated) can only read active venues and active deals.
--   * Coupon codes live in deal_coupons and are never readable by app users.
--   * Venue staff logins are NOT Supabase Auth users. Their password hashes live in
--     venue_account_secrets, which no API role can read; only the functions below touch it.
--   * Everything else is admin-only (founder), checked with public.is_admin().

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Admins (the founder)
-- ---------------------------------------------------------------------------

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
-- No policies: nobody reads or writes this table through the API.
-- Add the founder by hand (see README "Make yourself admin").

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Shared trigger: keep updated_at current.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Venues
-- ---------------------------------------------------------------------------

create type public.venue_category as enum ('cafe', 'restaurant', 'rooftop', 'bar');

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name_en text not null check (length(trim(name_en)) > 0),
  name_th text not null check (length(trim(name_th)) > 0),
  category public.venue_category not null,
  description_en text not null default '',
  description_th text not null default '',
  address_en text not null default '',
  address_th text not null default '',
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  -- Kept in sync with lat/lng by trigger; used for the server-side 50 m check-in test.
  location extensions.geography (point, 4326) not null,
  checkin_radius_m integer not null default 50 check (checkin_radius_m between 10 and 500),
  -- Path inside the public "venue-photos" storage bucket.
  photo_path text,
  -- New venues start hidden so the founder can finish setting them up.
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.venues_sync_location()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.location := extensions.st_setsrid(extensions.st_makepoint(new.lng, new.lat), 4326)::extensions.geography;
  return new;
end;
$$;

create trigger venues_sync_location
before insert or update of lat, lng on public.venues
for each row execute function public.venues_sync_location();

create trigger venues_set_updated_at
before update on public.venues
for each row execute function public.set_updated_at();

create index venues_location_idx on public.venues using gist (location);

alter table public.venues enable row level security;

create policy "Anyone can read active venues; admins read all"
on public.venues for select
to anon, authenticated
using (is_active or (select public.is_admin()));

create policy "Admins insert venues"
on public.venues for insert
to authenticated
with check ((select public.is_admin()));

create policy "Admins update venues"
on public.venues for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "Admins delete venues"
on public.venues for delete
to authenticated
using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Deals (one active deal per venue). The coupon code is stored separately.
-- ---------------------------------------------------------------------------

create type public.discount_type as enum ('percent', 'fixed_thb', 'other');

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  title_en text not null check (length(trim(title_en)) > 0),
  title_th text not null check (length(trim(title_th)) > 0),
  details_en text not null default '',
  details_th text not null default '',
  discount_type public.discount_type not null,
  -- Percent (1-100) or baht amount. Empty for 'other' (e.g. "free dessert").
  discount_value numeric(10, 2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deals_discount_value_valid check (
    (discount_type = 'other' and discount_value is null)
    or (discount_type = 'percent' and discount_value > 0 and discount_value <= 100)
    or (discount_type = 'fixed_thb' and discount_value > 0)
  )
);

create unique index deals_one_active_per_venue on public.deals (venue_id) where is_active;
create index deals_venue_id_idx on public.deals (venue_id);

create trigger deals_set_updated_at
before update on public.deals
for each row execute function public.set_updated_at();

alter table public.deals enable row level security;

create policy "Anyone can read active deals of active venues; admins read all"
on public.deals for select
to anon, authenticated
using (
  (is_active and exists (select 1 from public.venues v where v.id = venue_id and v.is_active))
  or (select public.is_admin())
);

create policy "Admins insert deals"
on public.deals for insert
to authenticated
with check ((select public.is_admin()));

create policy "Admins update deals"
on public.deals for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "Admins delete deals"
on public.deals for delete
to authenticated
using ((select public.is_admin()));

-- Coupon codes: shown only to venue staff after they log in on the QR page (server side),
-- so app users must never be able to read them.
create table public.deal_coupons (
  deal_id uuid primary key references public.deals (id) on delete cascade,
  coupon_code text not null check (length(trim(coupon_code)) > 0),
  updated_at timestamptz not null default now()
);

create trigger deal_coupons_set_updated_at
before update on public.deal_coupons
for each row execute function public.set_updated_at();

alter table public.deal_coupons enable row level security;

create policy "Admins manage coupon codes"
on public.deal_coupons for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- Admin: create or update a venue's deal and its coupon code in one transaction.
-- Runs as the caller, so the admin-only policies above still apply.
create function public.admin_save_deal(
  p_venue_id uuid,
  p_deal_id uuid,
  p_title_en text,
  p_title_th text,
  p_details_en text,
  p_details_th text,
  p_discount_type public.discount_type,
  p_discount_value numeric,
  p_coupon_code text,
  p_is_active boolean
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deal_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_deal_id is null then
    insert into public.deals (venue_id, title_en, title_th, details_en, details_th, discount_type, discount_value, is_active)
    values (p_venue_id, p_title_en, p_title_th, p_details_en, p_details_th, p_discount_type, p_discount_value, p_is_active)
    returning id into v_deal_id;
  else
    update public.deals
    set title_en = p_title_en,
        title_th = p_title_th,
        details_en = p_details_en,
        details_th = p_details_th,
        discount_type = p_discount_type,
        discount_value = p_discount_value,
        is_active = p_is_active
    where id = p_deal_id and venue_id = p_venue_id
    returning id into v_deal_id;
    if v_deal_id is null then
      raise exception 'deal not found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.deal_coupons (deal_id, coupon_code)
  values (v_deal_id, trim(p_coupon_code))
  on conflict (deal_id) do update set coupon_code = excluded.coupon_code;

  return v_deal_id;
end;
$$;

revoke execute on function public.admin_save_deal(uuid, uuid, text, text, text, text, public.discount_type, numeric, text, boolean) from public, anon;
grant execute on function public.admin_save_deal(uuid, uuid, text, text, text, text, public.discount_type, numeric, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Venue staff logins (one or more per venue)
-- ---------------------------------------------------------------------------

create table public.venue_accounts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  login_id text not null unique check (login_id ~ '^[a-z0-9._-]{3,40}$'),
  is_active boolean not null default true,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create index venue_accounts_venue_id_idx on public.venue_accounts (venue_id);

alter table public.venue_accounts enable row level security;

create policy "Admins read venue logins"
on public.venue_accounts for select
to authenticated
using ((select public.is_admin()));

-- Admins may turn a login on/off. Creating logins and passwords goes through functions below.
create policy "Admins update venue logins"
on public.venue_accounts for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "Admins delete venue logins"
on public.venue_accounts for delete
to authenticated
using ((select public.is_admin()));

create table public.venue_account_secrets (
  account_id uuid primary key references public.venue_accounts (id) on delete cascade,
  password_hash text not null
);

alter table public.venue_account_secrets enable row level security;
-- No policies and no grants: unreadable through the API.
revoke all on public.venue_account_secrets from anon, authenticated;

-- Admin: create a staff login for a venue. Returns the new account id.
create function public.admin_create_venue_account(p_venue_id uuid, p_login_id text, p_password text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(p_password) < 8 then
    raise exception 'password must be at least 8 characters' using errcode = '22023';
  end if;

  insert into public.venue_accounts (venue_id, login_id)
  values (p_venue_id, lower(trim(p_login_id)))
  returning id into v_account_id;

  insert into public.venue_account_secrets (account_id, password_hash)
  values (v_account_id, extensions.crypt(p_password, extensions.gen_salt('bf', 10)));

  return v_account_id;
end;
$$;

-- Admin: set a new password. Also clears any lockout.
create function public.admin_set_venue_password(p_account_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(p_password) < 8 then
    raise exception 'password must be at least 8 characters' using errcode = '22023';
  end if;

  update public.venue_account_secrets
  set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 10))
  where account_id = p_account_id;
  if not found then
    raise exception 'venue login not found' using errcode = 'P0002';
  end if;

  update public.venue_accounts
  set failed_attempts = 0, locked_until = null
  where id = p_account_id;
end;
$$;

-- Server only (service role): check a staff login. Returns one row on success, no rows on failure.
-- 5 wrong passwords in a row lock the login for 15 minutes.
create function public.verify_venue_login(p_login_id text, p_password text)
returns table (account_id uuid, venue_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.venue_accounts%rowtype;
  v_hash text;
begin
  select * into v_account from public.venue_accounts a where a.login_id = lower(trim(p_login_id));

  if not found then
    -- Spend the same hashing time as a real check so unknown IDs can't be told apart by timing.
    perform extensions.crypt(p_password, extensions.gen_salt('bf', 10));
    return;
  end if;

  if not v_account.is_active
     or (v_account.locked_until is not null and v_account.locked_until > now()) then
    return;
  end if;

  select s.password_hash into v_hash from public.venue_account_secrets s where s.account_id = v_account.id;

  if v_hash is null or extensions.crypt(p_password, v_hash) <> v_hash then
    update public.venue_accounts a
    set failed_attempts = a.failed_attempts + 1,
        locked_until = case when a.failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
    where a.id = v_account.id;
    return;
  end if;

  update public.venue_accounts a
  set failed_attempts = 0, locked_until = null, last_login_at = now()
  where a.id = v_account.id;

  account_id := v_account.id;
  venue_id := v_account.venue_id;
  return next;
end;
$$;

revoke execute on function public.admin_create_venue_account(uuid, text, text) from public, anon;
grant execute on function public.admin_create_venue_account(uuid, text, text) to authenticated;
revoke execute on function public.admin_set_venue_password(uuid, text) from public, anon;
grant execute on function public.admin_set_venue_password(uuid, text) to authenticated;
revoke execute on function public.verify_venue_login(text, text) from public, anon, authenticated;
grant execute on function public.verify_venue_login(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Live updates: the app listens for venue and deal changes made in the admin panel.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.venues, public.deals;

-- ---------------------------------------------------------------------------
-- Venue photos (public bucket, admin-only writes)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('venue-photos', 'venue-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

-- Public URLs work without this; the API needs it to list/delete/replace files.
create policy "Admins read venue photo objects"
on storage.objects for select
to authenticated
using (bucket_id = 'venue-photos' and (select public.is_admin()));

create policy "Admins upload venue photos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'venue-photos' and (select public.is_admin()));

create policy "Admins update venue photos"
on storage.objects for update
to authenticated
using (bucket_id = 'venue-photos' and (select public.is_admin()));

create policy "Admins delete venue photos"
on storage.objects for delete
to authenticated
using (bucket_id = 'venue-photos' and (select public.is_admin()));
