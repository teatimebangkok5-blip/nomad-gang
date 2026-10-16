-- "Buy tickets" and "Official website" buttons on the Hangout map.
--
-- * venues.ticket_url / deals.ticket_url: the official ticket page, pasted by the founder in the admin panel (for a
--   venue, or for one event / ticket discount). "Buy tickets" shows only where one is set.
-- * places.website: the place's official website from OpenStreetMap (seeded by the next migration), shown as
--   "Official website" (we can't tell whether that site sells tickets).
-- Only https links are accepted.

alter table public.venues
  add column ticket_url text check (ticket_url is null or (ticket_url ~ '^https://[^\s]+$' and length(ticket_url) <= 500));

alter table public.deals
  add column ticket_url text check (ticket_url is null or (ticket_url ~ '^https://[^\s]+$' and length(ticket_url) <= 500));

alter table public.places
  add column website text check (website is null or (website ~ '^https://[^\s]+$' and length(website) <= 500));

-- Same as before, plus the website.
drop function public.places_in_bounds(double precision, double precision, double precision, double precision, integer, text);

create function public.places_in_bounds(
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision,
  p_limit integer default 400,
  p_purpose text default 'food'
)
returns table (
  id uuid,
  name text,
  name_en text,
  name_th text,
  kind text,
  lat double precision,
  lng double precision,
  website text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.name, p.name_en, p.name_th, p.kind, p.lat, p.lng, p.website
  from public.places p
  where p.purpose = coalesce(p_purpose, 'food')
    and p.lat between p_south and p_north
    and p.lng between p_west and p_east
    and not exists (select 1 from public.venues v where v.place_id = p.id and v.is_active)
  limit least(greatest(coalesce(p_limit, 400), 1), 1000);
$$;

-- admin_save_promotion gains p_ticket_url (last, optional), so existing calls keep working.
drop function public.admin_save_promotion(uuid, uuid, public.promotion_kind, text, text, text, text, public.discount_type, numeric, text, timestamptz, timestamptz, boolean);

create function public.admin_save_promotion(
  p_venue_id uuid,
  p_promotion_id uuid,
  p_kind public.promotion_kind,
  p_title_en text,
  p_title_th text,
  p_details_en text,
  p_details_th text,
  p_discount_type public.discount_type,
  p_discount_value numeric,
  p_coupon_code text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_is_active boolean,
  p_ticket_url text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_kind text := p_kind::text;
  v_has_coupon boolean := v_kind in ('discount', 'offer', 'ticket');
  v_has_discount boolean := v_kind in ('discount', 'ticket');
  v_discount_type public.discount_type := case when v_has_discount then p_discount_type else 'other' end;
  v_discount_value numeric := case when v_has_discount then p_discount_value else null end;
  v_starts_at timestamptz := case when v_kind in ('discount', 'offer') then null else p_starts_at end;
  v_ends_at timestamptz := case when v_kind in ('discount', 'offer') then null else p_ends_at end;
  v_ticket_url text := nullif(trim(coalesce(p_ticket_url, '')), '');
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_has_coupon and length(trim(coalesce(p_coupon_code, ''))) = 0 then
    raise exception 'coupon code required' using errcode = '22023';
  end if;

  if p_promotion_id is null then
    insert into public.deals (
      venue_id, kind, title_en, title_th, details_en, details_th,
      discount_type, discount_value, starts_at, ends_at, is_active, ticket_url
    )
    values (
      p_venue_id, p_kind, p_title_en, p_title_th, p_details_en, p_details_th,
      v_discount_type, v_discount_value, v_starts_at, v_ends_at, p_is_active, v_ticket_url
    )
    returning id into v_id;
  else
    update public.deals
    set kind = p_kind,
        title_en = p_title_en,
        title_th = p_title_th,
        details_en = p_details_en,
        details_th = p_details_th,
        discount_type = v_discount_type,
        discount_value = v_discount_value,
        starts_at = v_starts_at,
        ends_at = v_ends_at,
        is_active = p_is_active,
        ticket_url = v_ticket_url
    where id = p_promotion_id and venue_id = p_venue_id
    returning id into v_id;
    if v_id is null then
      raise exception 'promotion not found' using errcode = 'P0002';
    end if;
  end if;

  if v_has_coupon then
    insert into public.deal_coupons (deal_id, coupon_code)
    values (v_id, trim(p_coupon_code))
    on conflict (deal_id) do update set coupon_code = excluded.coupon_code;
  else
    delete from public.deal_coupons where deal_id = v_id;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.admin_save_promotion(uuid, uuid, public.promotion_kind, text, text, text, text, public.discount_type, numeric, text, timestamptz, timestamptz, boolean, text) from public, anon;
grant execute on function public.admin_save_promotion(uuid, uuid, public.promotion_kind, text, text, text, text, public.discount_type, numeric, text, timestamptz, timestamptz, boolean, text) to authenticated;
