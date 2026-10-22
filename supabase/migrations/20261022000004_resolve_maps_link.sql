-- Google Maps share links for "Paste a Google Maps link" (founder, 2026-10-22).
--
-- Short share links (https://maps.app.goo.gl/…) don't contain the point; the app has to open them to see where they
-- lead. Some networks can't reach maps.app.goo.gl (on the founder's Jio connection it resolves to a server that
-- refuses), so the app can ask the server, which is in Singapore, to open it instead: resolve_maps_link follows the
-- redirects (Google addresses only) with the pgsql-http extension and reads the point and the place's name from the
-- Google Maps page. Only Google Maps short links are accepted (not maps.app.goo.gl/?link=…, which can lead anywhere),
-- max 30 lookups per person per hour. Nothing is stored except the lookup times for that limit.
--
-- Errors: auth_required, invalid_link, too_many_requests. Returns no row when no point was found (or the request
-- failed), so the app can fall back to searching the place's name.

do $$
begin
  create extension if not exists http with schema extensions;
exception when others then
  -- Not available (e.g. the local test database): resolve_maps_link then finds nothing.
  raise notice 'http extension not available: %', sqlerrm;
end;
$$;

create table public.maps_link_lookups (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index maps_link_lookups_user_idx on public.maps_link_lookups (user_id, created_at);

alter table public.maps_link_lookups enable row level security;
revoke all on public.maps_link_lookups from anon, authenticated;

-- The point and name in a Google Maps URL or page, or nothing.
create function public.maps_point_in(p_text text)
returns table (lat double precision, lng double precision, name text)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := coalesce(p_text, '');
  v_match text[];
  v_name text;
begin
  v_match := coalesce(
    regexp_match(v_text, '!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)'),
    regexp_match(v_text, '[?&;](?:q|query|ll|center|destination)=(-?\d{1,2}\.\d+)(?:,|%2C)\s*(-?\d{1,3}\.\d+)'),
    regexp_match(v_text, 'center=(-?\d{1,2}\.\d+)%2C(-?\d{1,3}\.\d+)'),
    regexp_match(v_text, '@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)'),
    regexp_match(v_text, '\[null,null,(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)\]')
  );
  if v_match is null or abs(v_match[1]::double precision) > 85 or abs(v_match[2]::double precision) > 180
     or (v_match[1]::double precision = 0 and v_match[2]::double precision = 0) then
    return;
  end if;
  v_name := coalesce(
    (regexp_match(v_text, '<meta content="([^"]{1,200})" itemprop="name"'))[1],
    (regexp_match(v_text, '<meta content="([^"]{1,200})" property="og:title"'))[1],
    replace((regexp_match(v_text, '/maps/place/([^/@?"]{1,200})'))[1], '+', ' ')
  );
  -- "Lumphini Park · Rama IV Rd" -> "Lumphini Park"
  v_name := nullif(left(trim(split_part(coalesce(v_name, ''), ' · ', 1)), 80), '');
  return query select v_match[1]::double precision, v_match[2]::double precision, v_name;
end;
$$;

revoke execute on function public.maps_point_in(text) from public, anon, authenticated;

create function public.resolve_maps_link(p_url text)
returns table (lat double precision, lng double precision, name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := trim(coalesce(p_url, ''));
  v_status integer;
  v_body text;
  v_location text;
  v_hops integer := 0;
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if v_url !~ '^https://(maps\.app\.goo\.gl|goo\.gl/maps)/[A-Za-z0-9_-]{4,64}(\?[A-Za-z0-9_=&%.-]{0,200})?$'
     or v_url ~ '[?&]link=' then
    raise exception 'invalid_link';
  end if;
  if (select count(*) from public.maps_link_lookups l
      where l.user_id = auth.uid() and l.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too_many_requests';
  end if;
  insert into public.maps_link_lookups (user_id) values (auth.uid());

  begin
    perform set_config('http.timeout_msec', '6000', true);
    loop
      v_hops := v_hops + 1;
      select r.status, r.content, (select h.value from unnest(r.headers) h where lower(h.field) = 'location' limit 1)
      into v_status, v_body, v_location
      from extensions.http_get(v_url) r;
      -- The redirect target itself often holds the point.
      if v_location is not null and exists (select 1 from public.maps_point_in(v_location)) then
        return query select * from public.maps_point_in(v_location);
        return;
      end if;
      exit when v_status not between 300 and 399 or v_location is null or v_hops >= 5;
      -- Only ever on to Google.
      exit when v_location !~ '^https://([a-z0-9-]+\.)*(google\.[a-z.]{2,6}|goo\.gl)/';
      v_url := v_location;
    end loop;
    return query select * from public.maps_point_in(v_url || ' ' || coalesce(v_body, ''));
  exception when others then
    raise warning 'resolve_maps_link failed: %', sqlerrm;
  end;
end;
$$;

revoke execute on function public.resolve_maps_link(text) from public, anon;
grant execute on function public.resolve_maps_link(text) to authenticated;
