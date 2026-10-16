-- Every place website from OpenStreetMap was opened and checked by hand (2026-10-16). Only official websites stay:
-- 48 are removed (dead or expired sites, domains taken over by gambling sites, YouTube / Wikipedia /
-- Facebook / Linktree pages, travel or directory sites, or the wrong place) and 10 are corrected to the place's
-- official site. 120 official websites remain.

update public.places p
set website = null
from (values
('node', 10693793813),
('way', 500230827),
('way', 1556494902),
('node', 4333980589),
('node', 11563600464),
('way', 543836131),
('node', 8797708205),
('node', 12210708407),
('way', 164588367),
('way', 37911198),
('node', 4208776982),
('way', 208058784),
('way', 1427711804),
('way', 176298722),
('way', 1435614685),
('way', 341577338),
('node', 7577260667),
('way', 283723388),
('node', 9739291657),
('way', 31141565),
('way', 539806478),
('relation', 10904051),
('way', 1464119566),
('node', 12219062143),
('way', 225697159),
('way', 163727394),
('way', 256162460),
('node', 2640789618),
('way', 127851223),
('way', 121554541),
('way', 229970775),
('way', 199925704),
('way', 23481741),
('way', 31987718),
('way', 233810865),
('way', 376377640),
('way', 376466920),
('node', 4571891590),
('node', 2459549396),
('way', 194521680),
('way', 138947464),
('way', 342337807),
('relation', 20594102),
('way', 231663783),
('way', 707208340),
('way', 562209094),
('way', 1373388545),
('way', 1233468944)
) as v (osm_type, osm_id)
where p.osm_type = v.osm_type and p.osm_id = v.osm_id;

update public.places p
set website = v.website
from (values
('way', 196107455, 'https://www.asiatiquethailand.com/'),
('way', 113135445, 'https://www.centurythemovieplaza.com/'),
('way', 124857541, 'https://www.dreamworld.co.th/'),
('way', 25787548, 'https://www.gaysornvillage.com/'),
('way', 253429081, 'https://www.nsm.or.th/'),
('way', 253429083, 'https://www.nsm.or.th/'),
('way', 253429084, 'https://www.nsm.or.th/'),
('way', 421586983, 'https://siamserpentarium.com/'),
('node', 4840964126, 'https://www.tcdc.or.th/'),
('way', 230010054, 'https://www.royalgrandpalace.th/en/home')
) as v (osm_type, osm_id, website)
where p.osm_type = v.osm_type and p.osm_id = v.osm_id;
