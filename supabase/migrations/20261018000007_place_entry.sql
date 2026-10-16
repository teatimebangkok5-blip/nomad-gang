-- Entry for the Hangout map's "Tickets" and "Free entry" buttons.
--
-- * entry: 'ticket' (everyone pays: entry tickets, or pay to play / watch), 'free', or 'free_thai' (free for Thai
--   citizens, foreigners pay, e.g. Wat Pho). Null = not confirmed: shown on the map, but under neither button.
--   The app shows 'free_thai' under Free entry in Thai and under Tickets in English.
-- * Set by place type where the type decides it (malls, markets, public parks and gardens, monuments and temples are
--   free; zoos, aquariums, theme and water parks, cinemas, theatres, escape rooms, arcades, ice rinks are ticketed), then by
--   OpenStreetMap fee tags, then for places checked against official sites and published entry fees (prices change,
--   so only the group is stored). Temples are free except the famous ones that charge foreigners (free_thai below) and
--   Wat Hua Lamphong (a published 40 baht fee, not confirmed, so left unset). Galleries and most museums stay unset.
-- * venues.entry: set by the founder in the admin panel; when empty the app uses the linked place's entry.

alter table public.places add column entry text check (entry in ('ticket', 'free', 'free_thai'));
alter table public.venues add column entry text check (entry in ('ticket', 'free', 'free_thai'));

create index places_entry_idx on public.places (entry) where entry is not null;

update public.places set entry = 'free'
where purpose = 'hangout' and kind in ('mall', 'market', 'park', 'garden', 'nature_reserve', 'monument', 'temple');

update public.places set entry = 'ticket'
where purpose = 'hangout'
  and kind in ('zoo', 'aquarium', 'theme_park', 'water_park', 'cinema', 'theatre', 'escape_game', 'ice_rink',
               'amusement_arcade', 'miniature_golf', 'bowling_alley');

update public.places p
set entry = v.entry
from (values
('node', 2397987931, 'free'),
('node', 2962478192, 'free'),
('node', 7086006640, 'free'),
('node', 12011861808, 'free'),
('node', 12619471943, 'free'),
('way', 23482754, 'free_thai'),
('way', 23486019, 'free'),
('way', 32011053, 'free_thai'),
('way', 33042465, 'ticket'),
('way', 48966995, 'free'),
('way', 82078207, 'ticket'),
('way', 99029135, 'free'),
('way', 210306786, 'free'),
('way', 253429082, 'ticket'),
('way', 253429084, 'ticket'),
('way', 320273828, 'ticket'),
('way', 341577338, 'ticket'),
('way', 341577340, 'ticket'),
('way', 352117293, 'free'),
('way', 539268957, 'free'),
('way', 706259602, 'ticket'),
('way', 760456011, 'ticket'),
('way', 897909009, 'ticket'),
('way', 1147659014, 'ticket'),
('way', 1174244967, 'free'),
('way', 1184268295, 'free'),
('way', 1190810492, 'free'),
('way', 1202023478, 'free'),
('way', 1224439620, 'ticket'),
('way', 1224439624, 'free'),
('way', 1226419516, 'ticket'),
('way', 1294703709, 'ticket'),
('way', 1358537231, 'free'),
('way', 1412419212, 'ticket'),
('way', 1498369684, 'free'),
('way', 1532918713, 'free'),
('relation', 20159195, 'ticket'),
('way', 376675947, 'free'),
('way', 233810865, 'free'),
('way', 31983987, 'free'),
('way', 342355805, 'free'),
('way', 138947464, 'free'),
('way', 107936513, 'free'),
('way', 103022352, 'free'),
('way', 23610119, 'free'),
('way', 1516377328, 'free'),
('way', 462532630, 'free'),
('way', 754824716, 'free'),
('way', 832948770, 'free'),
('way', 872380813, 'free'),
('way', 1305800722, 'free'),
('way', 178353988, 'free'),
('relation', 20440796, 'free'),
('relation', 4051990, 'free'),
('way', 37911198, 'free'),
('node', 5057927728, 'free'),
('node', 3542061032, 'free'),
('way', 1464119566, 'free'),
('way', 164588367, 'free'),
('node', 1641043367, 'free'),
('relation', 20505832, 'ticket'),
('way', 202235947, 'ticket'),
('relation', 20710624, 'ticket'),
('way', 82542417, 'ticket'),
('way', 349609932, 'ticket'),
('node', 1696984912, 'ticket'),
('way', 666021136, 'ticket'),
('node', 4240101592, 'ticket'),
('way', 166114555, 'ticket'),
('way', 198428496, 'ticket'),
('way', 421586983, 'ticket'),
('way', 1336674593, 'ticket'),
('node', 2447283108, 'ticket'),
('node', 4590299089, 'ticket'),
('way', 1410385850, 'ticket'),
('way', 241865727, 'ticket'),
('way', 248978431, 'ticket'),
('way', 1434802191, 'ticket'),
('way', 124857541, 'ticket'),
('way', 832285306, 'ticket'),
('node', 1696984984, 'ticket'),
('node', 4130721589, 'ticket'),
('way', 230010054, 'free_thai'),
('relation', 18593471, 'free_thai'),
('way', 82541999, 'free_thai'),
('way', 205631558, 'free_thai'),
('way', 82543520, 'free_thai'),
('way', 376312450, 'free_thai'),
('relation', 11169995, 'free_thai'),
('way', 23481741, 'free_thai'),
('way', 243936903, 'free_thai'),
('relation', 20594102, 'free_thai'),
('way', 31987718, 'free_thai'),
('way', 241879483, 'free_thai'),
('way', 103097698, 'free_thai'),
('way', 103022363, 'free_thai')
) as v (osm_type, osm_id, entry)
where p.osm_type = v.osm_type and p.osm_id = v.osm_id;

-- Wat Hua Lamphong: a fee is published but not confirmed.
update public.places set entry = null where osm_type = 'way' and osm_id = 231405199;

-- Same as before, plus the entry and an optional entry filter (p_entry) for the Tickets / Free entry buttons.
drop function public.places_in_bounds(double precision, double precision, double precision, double precision, integer, text);

create function public.places_in_bounds(
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision,
  p_limit integer default 400,
  p_purpose text default 'food',
  p_entry text[] default null
)
returns table (
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
  select p.id, p.name, p.name_en, p.name_th, p.kind, p.lat, p.lng, p.website, p.entry
  from public.places p
  where p.purpose = coalesce(p_purpose, 'food')
    and (p_entry is null or p.entry = any (p_entry))
    and p.lat between p_south and p_north
    and p.lng between p_west and p_east
    and not exists (select 1 from public.venues v where v.place_id = p.id and v.is_active)
  limit least(greatest(coalesce(p_limit, 400), 1), 1000);
$$;
