-- Website for Safari World, added by the founder (2026-10-16). Shown as "Official website" on the Hangout map.
update public.places
set website = 'https://www.safariworld.online/'
where osm_type = 'way' and osm_id = 706259602;
