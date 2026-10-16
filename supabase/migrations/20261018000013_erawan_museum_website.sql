-- Official website (ticket fees page) for the Erawan Elephant Museum, added by the founder (2026-10-16).
-- Shown as "Official website" on the Hangout map.
update public.places
set website = 'https://www.erawanmuseum.com/en/rate/'
where osm_type = 'way' and osm_id = 666021136;
