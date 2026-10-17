-- Place dots for zoomed-out maps (founder, 2026-10-17: show the dots until the whole of central Bangkok is in view).
-- A zoomed-out view holds thousands of places (5,000+ food places in central Bangkok), too many to load with names
-- on every map move, so the app loads every place's dot once: id, kind and position only, as one compact JSON array
-- [[id, kind, lat, lng], …] (one value, so the API's row limit doesn't cut it short). Names load only when zoomed in
-- (places_in_bounds) or when a dot is tapped. Same rules as places_in_bounds: one purpose, optional entry filter,
-- places shown as a partner venue left out.
create function public.place_dots(p_purpose text default 'food', p_entry text[] default null)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(json_agg(json_build_array(p.id, p.kind, round(p.lat::numeric, 5), round(p.lng::numeric, 5))), '[]'::json)
  from public.places p
  where p.purpose = coalesce(p_purpose, 'food')
    and (p_entry is null or p.entry = any (p_entry))
    and not exists (select 1 from public.venues v where v.place_id = p.id and v.is_active);
$$;
