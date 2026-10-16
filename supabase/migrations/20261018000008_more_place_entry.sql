-- More well-known places for the Tickets / Free entry buttons, checked against published entry fees (2026-10-16).
-- Only the group is stored, not prices. Left unset on purpose: Samut Prakan Observation Tower (fee unclear) and
-- Art in Paradise (closed).

update public.places p
set entry = v.entry
from (values
  ('node', 6259620985, 'ticket'),  -- MahaNakhon SkyWalk (one price for everyone)
  ('node', 8797708205, 'ticket'),  -- Baiyoke Tower II observation deck
  ('way', 342522015, 'ticket'),    -- Asiatique Sky ferris wheel
  ('way', 205637198, 'ticket'),    -- The Queen's Gallery
  ('relation', 20443104, 'ticket'), -- Science Centre for Education (Bangkok Planetarium)
  ('node', 12182702233, 'ticket'), -- Songkran Niyomsane Forensic Medical Museum (Siriraj museums ticket)
  ('way', 198877011, 'free')       -- Chong Nonsi Skywalk (public walkway)
) as v (osm_type, osm_id, entry)
where p.osm_type = v.osm_type and p.osm_id = v.osm_id;
