import { useCallback, useEffect, useRef, useState } from 'react';

import type { Language } from '@/i18n';
import { supabase } from '@/lib/supabase';
import type { VenueCategory } from '@/lib/venues';

// Bangkok food and drink places from OpenStreetMap (© OpenStreetMap contributors), stored in public.places.
// Any of them can host a table. Partner venues may be linked to one (venues.place_id).

export type Place = {
  id: string;
  name: string;
  name_en: string | null;
  name_th: string | null;
  kind: string;
  lat: number;
  lng: number;
};

export function placeName(place: Pick<Place, 'name' | 'name_en' | 'name_th'>, language: Language): string {
  return (language === 'th' ? place.name_th : place.name_en) || place.name;
}

// OpenStreetMap amenity/shop → the app's place type (for the pin emoji).
export function placeCategory(kind: string): VenueCategory {
  if (['bar', 'pub', 'biergarten'].includes(kind)) return 'bar';
  if (['cafe', 'coffee', 'tea', 'bakery', 'pastry', 'ice_cream', 'confectionery', 'deli'].includes(kind)) return 'cafe';
  return 'restaurant';
}

export type MapBounds = { west: number; south: number; east: number; north: number; zoom: number };

// Below this zoom the whole of Bangkok would be in view, so place dots are hidden.
export const PLACES_MIN_ZOOM = 14;

// Places inside the visible map area, refreshed (debounced) as the map moves.
export function usePlacesInView() {
  const [places, setPlaces] = useState<Place[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  const onBoundsChange = useCallback((bounds: MapBounds) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (bounds.zoom < PLACES_MIN_ZOOM) {
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
      });
      // Ignore answers to older requests that arrive late.
      if (request !== latest.current) return;
      if (error) {
        console.warn('Loading places failed', error.message);
        return;
      }
      setPlaces(data as Place[]);
    }, 350);
  }, []);

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
    .select('id, name, name_en, name_th, kind, lat, lng')
    .eq('id', id)
    .maybeSingle();
  return (data as Place | null) ?? null;
}
