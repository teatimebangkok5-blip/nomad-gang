import { useCallback, useEffect, useRef, useState } from 'react';

import type { Language } from '@/i18n';
import { supabase } from '@/lib/supabase';
import type { VenueCategory } from '@/lib/venues';

// Bangkok places from OpenStreetMap (© OpenStreetMap contributors), stored in public.places. Food and drink places
// ('food') can host a table; places to hang out ('hangout': temples, parks, malls, markets, museums, attractions, …)
// show on the Hangout map. Hangouts can be at either. Partner venues may be linked to one (venues.place_id).
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

export type MapBounds = { west: number; south: number; east: number; north: number; zoom: number };

// Below this zoom too much of Bangkok is in view, so place dots are hidden. Hangout places are fewer and further
// apart, so they show from further out.
const PLACES_MIN_ZOOM: Record<PlacePurpose, number> = { food: 14, hangout: 12 };
// With the Tickets / Free entry filter on there are far fewer places, so they show from further out.
const FILTERED_MIN_ZOOM = 11;

// Places inside the visible map area, refreshed (debounced) as the map moves or the entry filter changes.
// `entry` limits them to places with that entry (Tickets / Free entry buttons); null shows all.
export function usePlacesInView(purpose: PlacePurpose = 'food', entry: PlaceEntry[] | null = null) {
  const [places, setPlaces] = useState<Place[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);
  const lastBounds = useRef<MapBounds | null>(null);
  const entryKey = entry ? entry.join(',') : '';

  const schedule = useCallback(
    (bounds: MapBounds) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const filter = entryKey ? entryKey.split(',') : null;
        if (bounds.zoom < (filter ? FILTERED_MIN_ZOOM : PLACES_MIN_ZOOM[purpose])) {
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

  return { places, onBoundsChange };
}

export async function fetchPlace(id: string): Promise<Place | null> {
  const { data } = await supabase
    .from('places')
    .select('id, name, name_en, name_th, kind, lat, lng, website, entry')
    .eq('id', id)
    .maybeSingle();
  return (data as Place | null) ?? null;
}
