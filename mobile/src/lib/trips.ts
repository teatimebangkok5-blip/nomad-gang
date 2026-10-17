import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { profileErrorKey, type ProfileErrorKey } from '@/lib/profiles';
import { supabase } from '@/lib/supabase';

// Trips on a profile: a city and dates, past or upcoming. Anyone signed in can see them (not across a block);
// changes go through save_trip / delete_trip (supabase/migrations/*_profile_details.sql).

export type Trip = {
  id: string;
  user_id: string;
  city: string;
  country_code: string | null;
  lat: number | null;
  lng: number | null;
  starts_on: string;
  ends_on: string;
  note: string | null;
};

// Someone's trips, soonest first. Reloads when the screen comes back into focus (after adding or editing one).
export function useTrips(userId: string, enabled = true) {
  const [trips, setTrips] = useState<Trip[] | null | 'error'>(null);

  const load = useCallback(() => {
    if (!enabled) return;
    supabase
      .from('trips')
      .select('id, user_id, city, country_code, lat, lng, starts_on, ends_on, note')
      .eq('user_id', userId)
      .order('starts_on', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.warn('Loading trips failed', error.message);
        setTrips(error ? 'error' : ((data ?? []) as Trip[]));
      });
  }, [userId, enabled]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return { trips, reload: load };
}

export async function fetchTrip(id: string): Promise<Trip | null> {
  const { data } = await supabase
    .from('trips')
    .select('id, user_id, city, country_code, lat, lng, starts_on, ends_on, note')
    .eq('id', id)
    .maybeSingle();
  return (data as Trip | null) ?? null;
}

export async function saveTrip(trip: Omit<Trip, 'id' | 'user_id'> & { id: string | null }): Promise<ProfileErrorKey | null> {
  const { error } = await supabase.rpc('save_trip', {
    p_id: trip.id,
    p_city: trip.city,
    p_country_code: trip.country_code,
    p_lat: trip.lat,
    p_lng: trip.lng,
    p_starts_on: trip.starts_on,
    p_ends_on: trip.ends_on,
    p_note: trip.note ?? '',
  });
  return profileErrorKey(error);
}

export async function deleteTrip(id: string): Promise<ProfileErrorKey | null> {
  const { error } = await supabase.rpc('delete_trip', { p_id: id });
  return profileErrorKey(error);
}

export type CityResult = { key: string; city: string; context: string; countryCode: string | null; lat: number; lng: number };

type PhotonCity = {
  geometry: { type: string; coordinates: [number, number] };
  properties: { osm_id?: number; name?: string; state?: string; country?: string; countrycode?: string; type?: string };
};

// Cities and towns anywhere in the world from Photon (photon.komoot.io, free OpenStreetMap search, no key).
export async function searchCities(query: string): Promise<CityResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({ q, limit: '8', lang: 'en' });
  for (const tag of ['place:city', 'place:town', 'place:village', 'place:island', 'place:state']) {
    params.append('osm_tag', tag);
  }
  const response = await fetch(`https://photon.komoot.io/api/?${params}`);
  if (!response.ok) throw new Error(`Photon ${response.status}`);
  const body = (await response.json()) as { features?: PhotonCity[] };
  const seen = new Set<string>();
  return (body.features ?? []).flatMap((feature): CityResult[] => {
    const p = feature.properties;
    const city = p.name?.trim();
    if (!city || feature.geometry?.type !== 'Point') return [];
    const context = [p.state, p.country].filter((part) => part && part !== city).join(', ');
    const key = `${city}|${context}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const [lng, lat] = feature.geometry.coordinates;
    return [{ key, city, context, countryCode: p.countrycode?.toUpperCase() ?? null, lat, lng }];
  });
}
