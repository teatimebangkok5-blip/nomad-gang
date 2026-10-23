import * as Location from 'expo-location';
import type { TFunction } from 'i18next';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState } from 'react-native';

import { readPosition, type Coords } from '@/lib/location';
import { supabase } from '@/lib/supabase';

// "Travellers": people within 5 km who chose to be visible, at the last place they opened the app (for 7 days). The
// database never returns exact locations: each person's dot is moved 150–400 m (fixed per saved position) and
// distances are rounded to 0.5 km.

export type Traveller = {
  user_id: string;
  display_name: string;
  fuzzy_lat: number;
  fuzzy_lng: number;
  distance_km: number;
  minutes_ago: number;
};

// Is the signed-in person visible to travellers nearby? null while loading.
export function useDiscoverable(myId: string | undefined) {
  const [on, setOn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!myId) return;
    supabase
      .from('profiles')
      .select('discoverable')
      .eq('id', myId)
      .maybeSingle()
      .then(({ data }) => setOn(Boolean((data as { discoverable: boolean } | null)?.discoverable)));
  }, [myId]);

  const set = useCallback(async (next: boolean) => {
    const { error } = await supabase.rpc('set_discoverable', { p_on: next });
    if (error) {
      console.warn('Changing visibility failed', error.message);
      return false;
    }
    setOn(next);
    return true;
  }, []);

  return { on, set };
}

async function refreshNearby(coords: Coords): Promise<Traveller[] | null> {
  await supabase.rpc('update_my_location', { p_lat: coords.lat, p_lng: coords.lng });
  const { data, error } = await supabase.rpc('nearby_travellers');
  if (error) {
    console.warn('Loading travellers failed', error.message);
    return null;
  }
  return (data as Traveller[]).map((t) => ({ ...t, distance_km: Number(t.distance_km) }));
}

// Shares the caller's position (only stored while they're visible) and lists people within 5 km.
// Refreshes every 2 minutes and when the app comes back to the foreground.
export function useNearbyTravellers(enabled: boolean, coords: Coords | null) {
  const [travellers, setTravellers] = useState<Traveller[] | null>(null);
  const lat = coords?.lat;
  const lng = coords?.lng;

  const load = useCallback(() => {
    if (lat === undefined || lng === undefined) return Promise.resolve();
    return refreshNearby({ lat, lng }).then((rows) => rows && setTravellers(rows));
  }, [lat, lng]);

  useEffect(() => {
    if (!enabled) return;
    load();
    const timer = setInterval(load, 2 * 60 * 1000);
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') load();
    });
    return () => {
      clearInterval(timer);
      appState.remove();
    };
  }, [enabled, load]);

  return { travellers, reload: load };
}

async function isDiscoverable(userId: string) {
  const { data } = await supabase.from('profiles').select('discoverable').eq('id', userId).maybeSingle();
  return Boolean((data as { discoverable: boolean } | null)?.discoverable);
}

const SHARE_EVERY_MS = 10 * 60 * 1000;

// People who are visible show up at the last place they opened the app: saves the position when the app starts and
// when it comes back to the foreground (at most every 10 minutes). Only when location is already allowed; never asks.
export function useShareLocationOnOpen(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    let sharedAt = 0;
    const share = async () => {
      if (Date.now() - sharedAt < SHARE_EVERY_MS) return;
      const permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted || !(await isDiscoverable(userId))) return;
      const coords = await readPosition();
      if (!coords) return;
      const { error } = await supabase.rpc('update_my_location', { p_lat: coords.lat, p_lng: coords.lng });
      if (!error) sharedAt = Date.now();
    };
    share();
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') share();
    });
    return () => appState.remove();
  }, [userId]);
}

function askedKey(userId: string) {
  return `tm.nearbyAsked.${userId}`;
}

// "Show me to travellers nearby" is off until people choose it, so home asks once per account on this phone.
export async function askToBeVisibleOnce(userId: string, t: TFunction) {
  try {
    if (localStorage.getItem(askedKey(userId))) return;
    localStorage.setItem(askedKey(userId), '1');
  } catch {
    return;
  }
  if (await isDiscoverable(userId)) return;
  Alert.alert(
    t('travellers.optInTitle'),
    t('travellers.optInBody'),
    [
      { text: t('travellers.askLater'), style: 'cancel' },
      {
        text: t('travellers.askYes'),
        onPress: async () => {
          const { error } = await supabase.rpc('set_discoverable', { p_on: true });
          if (error) {
            console.warn('Changing visibility failed', error.message);
            return;
          }
          const permission = await Location.requestForegroundPermissionsAsync();
          if (!permission.granted) return;
          const coords = await readPosition();
          if (coords) await supabase.rpc('update_my_location', { p_lat: coords.lat, p_lng: coords.lng });
        },
      },
    ],
    { cancelable: true },
  );
}
