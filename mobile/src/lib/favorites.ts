import { useCallback, useEffect, useState } from 'react';

import type { PlaceEntry } from '@/lib/places';
import { supabase } from '@/lib/supabase';

// Favourite places: Bangkok places and partner venues someone saved with the heart on a place card. Private to that
// person (supabase/migrations/*_profile_details.sql).

export type FavoriteTarget = { placeId: string } | { venueId: string };

export type Favorite = {
  id: string;
  created_at: string;
  place: {
    id: string;
    name: string;
    name_en: string | null;
    name_th: string | null;
    kind: string;
    lat: number;
    lng: number;
    purpose: 'food' | 'hangout';
    entry: PlaceEntry | null;
    website: string | null;
  } | null;
  venue: { id: string; name_en: string; name_th: string; category: string; lat: number; lng: number } | null;
};

// Tells open hearts and the Favourites list when something was saved or removed.
const listeners = new Set<() => void>();
function changed() {
  listeners.forEach((listener) => listener());
}

function useOnChange(load: () => void) {
  useEffect(() => {
    listeners.add(load);
    return () => {
      listeners.delete(load);
    };
  }, [load]);
}

export function useFavorites(enabled = true) {
  const [favorites, setFavorites] = useState<Favorite[] | null | 'error'>(null);

  const load = useCallback(() => {
    if (!enabled) return;
    supabase
      .from('favorite_places')
      .select(
        'id, created_at, place:places(id, name, name_en, name_th, kind, lat, lng, purpose, entry, website), venue:venues(id, name_en, name_th, category, lat, lng)',
      )
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.warn('Loading favourites failed', error.message);
        // A venue that was hidden comes back without its details; leave it out.
        setFavorites(error ? 'error' : ((data ?? []) as unknown as Favorite[]).filter((f) => f.place || f.venue));
      });
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);
  useOnChange(load);

  return { favorites, reload: load };
}

// Whether one place / venue is saved, and a toggle for the heart.
export function useFavorite(target: FavoriteTarget | null) {
  const placeId = target && 'placeId' in target ? target.placeId : null;
  const venueId = target && 'venueId' in target ? target.venueId : null;
  const [saved, setSaved] = useState<boolean | null>(null);

  const load = useCallback(() => {
    if (!placeId && !venueId) return;
    const query = supabase.from('favorite_places').select('id');
    (placeId ? query.eq('place_id', placeId) : query.eq('venue_id', venueId as string))
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error) setSaved(Boolean(data));
      });
  }, [placeId, venueId]);

  useEffect(() => {
    load();
  }, [load]);
  useOnChange(load);

  const toggle = useCallback(async () => {
    if (!placeId && !venueId) return false;
    const was = saved === true;
    setSaved(!was);
    const { error } = was
      ? placeId
        ? await supabase.from('favorite_places').delete().eq('place_id', placeId)
        : await supabase.from('favorite_places').delete().eq('venue_id', venueId as string)
      : await supabase.from('favorite_places').insert(placeId ? { place_id: placeId } : { venue_id: venueId });
    // Already saved (e.g. on another screen) counts as saved.
    if (error && error.code !== '23505') {
      console.warn('Saving favourite failed', error.message);
      setSaved(was);
      return false;
    }
    changed();
    return true;
  }, [placeId, venueId, saved]);

  return { saved, toggle };
}

export async function removeFavorite(id: string) {
  const { error } = await supabase.from('favorite_places').delete().eq('id', id);
  if (error) console.warn('Removing favourite failed', error.message);
  else changed();
  return !error;
}
