-- Search bar on the maps (home, Create table, Hangout map).
--
-- * public.areas: Bangkok districts (เขต), subdistricts (แขวง), neighbourhoods and main roads from OpenStreetMap
--   (© OpenStreetMap contributors, ODbL), seeded by the next migration. Picking one moves the map there.
-- * search_map(query, purpose): that map's places (food or hangout, not ones shown as a partner venue) and areas,
--   names starting with the query first. Partner venues are matched in the app (it already has them).

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  osm_type text not null check (osm_type in ('node', 'way', 'relation')),
  osm_id bigint not null,
  kind text not null check (kind in ('district', 'subdistrict', 'neighbourhood', 'road')),
  name text not null check (length(trim(name)) between 1 and 200),
  name_en text,
  name_th text,
  lat double precision not null check (lat between 13.45 and 14.10),
  lng double precision not null check (lng between 100.25 and 100.95),
  created_at timestamptz not null default now(),
  unique (osm_type, osm_id)
);

alter table public.areas enable row level security;

create policy "Anyone can read areas"
on public.areas for select
to anon, authenticated
using (true);

create policy "Admins manage areas"
on public.areas for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create function public.search_map(p_query text, p_purpose text default 'food')
returns table (
  result_type text,
  id uuid,
  name text,
  name_en text,
  name_th text,
  kind text,
  lat double precision,
  lng double precision,
  website text,
  entry text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    -- % and _ in the query are searched literally.
    select
      lower(trim(coalesce(p_query, ''))) as t,
      replace(replace(replace(lower(trim(coalesce(p_query, ''))), '\', '\\'), '%', '\%'), '_', '\_') as pattern
  )
  (
    select 'place', p.id, p.name, p.name_en, p.name_th, p.kind, p.lat, p.lng, p.website, p.entry
    from public.places p, q
    where length(q.t) >= 2
      and p.purpose = coalesce(p_purpose, 'food')
      and (
        lower(p.name) like '%' || q.pattern || '%'
        or lower(p.name_en) like '%' || q.pattern || '%'
        or lower(p.name_th) like '%' || q.pattern || '%'
      )
      and not exists (select 1 from public.venues v where v.place_id = p.id and v.is_active)
    order by
      (lower(p.name) like q.pattern || '%' or lower(coalesce(p.name_en, '')) like q.pattern || '%') desc,
      length(p.name)
    limit 12
  )
  union all
  (
    select 'area', a.id, a.name, a.name_en, a.name_th, a.kind, a.lat, a.lng, null, null
    from public.areas a, q
    where length(q.t) >= 2
      and (
        lower(a.name) like '%' || q.pattern || '%'
        or lower(a.name_en) like '%' || q.pattern || '%'
        or lower(a.name_th) like '%' || q.pattern || '%'
      )
    order by
      (lower(a.name) like q.pattern || '%' or lower(coalesce(a.name_en, '')) like q.pattern || '%') desc,
      case a.kind when 'district' then 0 when 'neighbourhood' then 1 when 'subdistrict' then 2 else 3 end,
      length(a.name)
    limit 6
  );
$$;
