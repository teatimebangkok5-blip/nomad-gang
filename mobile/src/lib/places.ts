import { useCallback, useEffect, useRef, useState } from 'react';

import type { Language } from '@/i18n';
import { supabase } from '@/lib/supabase';
import type { VenueCategory } from '@/lib/venues';

// Bangkok places from OpenStreetMap (© OpenStreetMap contributors), stored in public.places. Food and drink places
// ('food') can host a table; places to hang out ('hangout': temples, parks, malls, markets, museums, attractions, …)
// show on the Hangout map. Hangouts can be at either. Partner venues may be linked to one (venues.place_id).
// Outside Bangkok the Hangout map shows world places from the map tiles instead (see WORLD_SUBCLASS_KIND).
export type PlacePurpose = 'food' | 'hangout';

export type Place = {
  id: string;
  name: string;
  name_en: string | null;
  name_th: string | null;
  kind: string;
  lat: number;
  lng: number;
  // Official website from OpenStreetMap (https only), shown as "Official website".
  website?: string | null;
  // Hangout places: whether entry needs a ticket (null = not confirmed).
  entry?: PlaceEntry | null;
  // A place from the world map tiles (not in public.places): a hangout there is created as a named spot.
  world?: boolean;
};

// 'free_thai': free for Thai citizens, foreigners pay (e.g. Wat Pho, Grand Palace).
export type PlaceEntry = 'ticket' | 'free' | 'free_thai';

// What the Tickets / Free entry buttons show. Free-for-Thais places count as free in Thai and as ticketed in English
// (the founder's decision: Thai users get in free, visitors need a ticket).
export function entryFilter(button: 'ticket' | 'free_entry', language: Language): PlaceEntry[] {
  if (button === 'ticket') return language === 'th' ? ['ticket'] : ['ticket', 'free_thai'];
  return language === 'th' ? ['free', 'free_thai'] : ['free'];
}

export function placeName(place: Pick<Place, 'name' | 'name_en' | 'name_th'>, language: Language): string {
  return (language === 'th' ? place.name_th : place.name_en) || place.name;
}

// OpenStreetMap amenity/shop → the app's place type (for the pin emoji).
export function placeCategory(kind: string): VenueCategory {
  if (['bar', 'pub', 'biergarten'].includes(kind)) return 'bar';
  if (['cafe', 'coffee', 'tea', 'bakery', 'pastry', 'ice_cream', 'confectionery', 'deli'].includes(kind)) return 'cafe';
  return 'restaurant';
}

// OpenStreetMap kind of a hangout place (see the seed migration) → emoji for its card.
const HANGOUT_KIND_EMOJI: Record<string, string> = {
  temple: '🛕',
  park: '🌳',
  garden: '🌳',
  nature_reserve: '🌳',
  market: '🛍️',
  mall: '🏬',
  museum: '🏛️',
  gallery: '🖼️',
  arts_centre: '🎨',
  attraction: '⭐',
  viewpoint: '🌇',
  monument: '🗿',
  castle: '🏯',
  fort: '🏯',
  palace: '🏯',
  zoo: '🦒',
  aquarium: '🐠',
  theme_park: '🎢',
  water_park: '🌊',
  cinema: '🎬',
  theatre: '🎭',
  escape_game: '🔐',
  bowling_alley: '🎳',
  ice_rink: '⛸️',
  miniature_golf: '⛳',
  amusement_arcade: '🕹️',
};

export function placeEmoji(kind: string): string {
  return HANGOUT_KIND_EMOJI[kind] ?? '📍';
}

// Map icons: a colored circle with a white icon (assets/images/map-icons/<icon>.png, made from Google's Material
// icons, Apache 2.0) and the place name beside it in the same color.
export const PLACE_ICON_COLORS = {
  food: '#F08A24',
  fastfood: '#F08A24',
  cafe: '#A0673A',
  bakery: '#C9772E',
  icecream: '#E8508C',
  bar: '#B83FA0',
  pub: '#B83FA0',
  temple: '#D69A1E',
  park: '#38A24F',
  market: '#E59E0B',
  mall: '#E59E0B',
  museum: '#DB4F8C',
  theatre: '#DB4F8C',
  cinema: '#8B5CF6',
  fun: '#8B5CF6',
  zoo: '#1E9E8C',
  attraction: '#3F78E0',
  monument: '#3F78E0',
  castle: '#3F78E0',
  viewpoint: '#3F78E0',
  place: '#7C7C8F',
} as const;
export type PlaceIcon = keyof typeof PLACE_ICON_COLORS;

// OpenStreetMap kind (food and hangout places) → map icon.
const KIND_ICON: Record<string, PlaceIcon> = {
  restaurant: 'food',
  food_court: 'food',
  fast_food: 'fastfood',
  cafe: 'cafe',
  coffee: 'cafe',
  tea: 'cafe',
  bakery: 'bakery',
  pastry: 'bakery',
  confectionery: 'bakery',
  deli: 'bakery',
  ice_cream: 'icecream',
  bar: 'bar',
  biergarten: 'pub',
  pub: 'pub',
  temple: 'temple',
  park: 'park',
  garden: 'park',
  nature_reserve: 'park',
  market: 'market',
  mall: 'mall',
  museum: 'museum',
  gallery: 'museum',
  arts_centre: 'museum',
  theatre: 'theatre',
  cinema: 'cinema',
  theme_park: 'fun',
  water_park: 'fun',
  amusement_arcade: 'fun',
  bowling_alley: 'fun',
  escape_game: 'fun',
  ice_rink: 'fun',
  miniature_golf: 'fun',
  zoo: 'zoo',
  aquarium: 'zoo',
  attraction: 'attraction',
  monument: 'monument',
  castle: 'castle',
  fort: 'castle',
  palace: 'castle',
  viewpoint: 'viewpoint',
};

export function placeIcon(kind: string): PlaceIcon {
  return KIND_ICON[kind] ?? 'place';
}

// World places: outside Bangkok the Hangout map draws places straight from the OpenFreeMap vector tiles
// (OpenStreetMap, layer "poi"), so nothing is stored for them. These tile subclasses are shown, mapped to the app's
// place kinds (founder's choice: sights & culture, parks & nature, shopping & markets, fun & entertainment).
export const WORLD_SUBCLASS_KIND: Record<string, string> = {
  // Sights & culture
  attraction: 'attraction',
  viewpoint: 'viewpoint',
  monument: 'monument',
  memorial: 'monument',
  castle: 'castle',
  palace: 'castle',
  fort: 'castle',
  ruins: 'monument',
  museum: 'museum',
  gallery: 'gallery',
  arts_centre: 'arts_centre',
  // Parks & nature
  park: 'park',
  garden: 'garden',
  nature_reserve: 'nature_reserve',
  // Shopping & markets
  mall: 'mall',
  department_store: 'mall',
  marketplace: 'market',
  // Fun & entertainment
  zoo: 'zoo',
  aquarium: 'aquarium',
  theme_park: 'theme_park',
  water_park: 'water_park',
  cinema: 'cinema',
  theatre: 'theatre',
  escape_game: 'escape_game',
  bowling_alley: 'bowling_alley',
  ice_rink: 'ice_rink',
  miniature_golf: 'miniature_golf',
  amusement_arcade: 'amusement_arcade',
};

// Religious places (temples, churches, mosques, …) only when well known: their name is written in at least
// WORLD_FAMOUS_MIN of these languages in OpenStreetMap (famous ones have dozens; neighbourhood ones 0–4).
export const WORLD_FAMOUS_LANGUAGES = ['en', 'de', 'fr', 'es', 'it', 'ru', 'ja', 'zh', 'ko', 'ar', 'pt', 'pl', 'uk', 'nl'];
export const WORLD_FAMOUS_MIN = 8;

// A world place tapped on the map (from the tiles): shown on the place card, and a hangout there is a spot with its
// name and pin.
export function worldPlaceFromTile(feature: GeoJSON.Feature): Place | null {
  const p = feature.properties ?? {};
  const name = typeof p.name === 'string' ? p.name.trim() : '';
  if (!name || feature.geometry?.type !== 'Point') return null;
  const [lng, lat] = feature.geometry.coordinates;
  const kind = p.class === 'place_of_worship' ? 'temple' : WORLD_SUBCLASS_KIND[String(p.subclass)] ?? 'attraction';
  return {
    id: `world:${feature.id ?? `${lat.toFixed(5)},${lng.toFixed(5)}`}`,
    name,
    name_en: typeof p['name:en'] === 'string' ? p['name:en'] : null,
    name_th: typeof p['name:th'] === 'string' ? p['name:th'] : null,
    kind,
    lat,
    lng,
    world: true,
  };
}

export type MapBounds = { west: number; south: number; east: number; north: number; zoom: number };

// Zoomed out, places are small dots in their icon color; from ICON_ZOOM they show their icon and name.
export const ICON_ZOOM = 15;
// Dots show from this zoom: about all of central Bangkok in view (founder, 2026-10-17). Hangout places are fewer and
// further apart, so they show from further out.
export const DOTS_MIN_ZOOM: Record<PlacePurpose, number> = { food: 12, hangout: 11 };

// A place as a dot: no names (they load when zoomed in, or when the dot is tapped).
export type PlaceDot = { id: string; kind: string; lat: number; lng: number };

// Every place's dot, loaded once per purpose + entry filter for the whole app session (place_dots returns them all
// as one compact array; places rarely change).
const dotsCache = new Map<string, Promise<PlaceDot[]>>();

function loadDots(purpose: PlacePurpose, entryKey: string): Promise<PlaceDot[]> {
  const key = `${purpose}|${entryKey}`;
  let promise = dotsCache.get(key);
  if (!promise) {
    promise = Promise.resolve(
      supabase.rpc('place_dots', { p_purpose: purpose, p_entry: entryKey ? entryKey.split(',') : null }),
    ).then(({ data, error }) => {
      if (error) {
        dotsCache.delete(key); // try again next time
        console.warn('Loading place dots failed', error.message);
        return [];
      }
      return ((data ?? []) as [string, string, number, number][]).map(([id, kind, lat, lng]) => ({ id, kind, lat, lng }));
    });
    dotsCache.set(key, promise);
  }
  return promise;
}

// Places for the map: every place as a dot (zoomed out), and the places inside the visible area with their names
// (from ICON_ZOOM - 0.5), refreshed (debounced) as the map moves or the entry filter changes. `entry` limits both to
// places with that entry (Tickets / Free entry buttons); null shows all.
export function usePlacesInView(purpose: PlacePurpose = 'food', entry: PlaceEntry[] | null = null) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [dots, setDots] = useState<{ key: string; dots: PlaceDot[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);
  const lastBounds = useRef<MapBounds | null>(null);
  const entryKey = entry ? entry.join(',') : '';
  const dotsKey = `${purpose}|${entryKey}`;

  useEffect(() => {
    let current = true;
    loadDots(purpose, entryKey).then((loaded) => {
      if (current) setDots({ key: `${purpose}|${entryKey}`, dots: loaded });
    });
    return () => {
      current = false;
    };
  }, [purpose, entryKey]);

  const schedule = useCallback(
    (bounds: MapBounds) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const filter = entryKey ? entryKey.split(',') : null;
        if (bounds.zoom < ICON_ZOOM - 0.5) {
          ++latest.current;
          setPlaces([]);
          return;
        }
        const request = ++latest.current;
        const { data, error } = await supabase.rpc('places_in_bounds', {
          p_west: bounds.west,
          p_south: bounds.south,
          p_east: bounds.east,
          p_north: bounds.north,
          p_limit: 400,
          p_purpose: purpose,
          p_entry: filter,
        });
        // Ignore answers to older requests that arrive late.
        if (request !== latest.current) return;
        if (error) {
          console.warn('Loading places failed', error.message);
          return;
        }
        setPlaces(data as Place[]);
      }, 350);
    },
    [purpose, entryKey],
  );

  const onBoundsChange = useCallback(
    (bounds: MapBounds) => {
      lastBounds.current = bounds;
      schedule(bounds);
    },
    [schedule],
  );

  // Filter changed: reload the same map area.
  useEffect(() => {
    if (lastBounds.current) schedule(lastBounds.current);
  }, [schedule]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return {
    places,
    dots: dots && dots.key === dotsKey ? dots.dots : [],
    dotsMinZoom: DOTS_MIN_ZOOM[purpose],
    onBoundsChange,
  };
}

export async function fetchPlace(id: string): Promise<Place | null> {
  const { data } = await supabase
    .from('places')
    .select('id, name, name_en, name_th, kind, lat, lng, website, entry')
    .eq('id', id)
    .maybeSingle();
  return (data as Place | null) ?? null;
}
