import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';

export type Coords = { lat: number; lng: number };

export type LocationState =
  | { status: 'checking' }
  | { status: 'granted'; coords: Coords | null }
  // canAskAgain false means Android won't show the prompt again; the user has to use Settings.
  | { status: 'denied'; canAskAgain: boolean };

async function readPosition(): Promise<Coords | null> {
  try {
    // A recent cached fix shows distances instantly; a fresh one replaces it moments later.
    const position =
      (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    // Location services are switched off on the phone.
    return null;
  }
}

async function checkLocation(): Promise<LocationState> {
  const permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted) return { status: 'denied', canAskAgain: permission.canAskAgain };
  return { status: 'granted', coords: await readPosition() };
}

// Shows the permission prompt, or opens Settings when Android won't show it any more.
// Returns null when the user was sent to Settings (the app re-checks when they come back).
async function requestLocation(): Promise<LocationState | null> {
  const current = await Location.getForegroundPermissionsAsync();
  if (!current.granted && !current.canAskAgain) {
    await Linking.openSettings();
    return null;
  }
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return { status: 'denied', canAskAgain: permission.canAskAgain };
  return { status: 'granted', coords: await readPosition() };
}

export function useCurrentLocation() {
  const [state, setState] = useState<LocationState>({ status: 'checking' });

  const refresh = useCallback(() => checkLocation().then(setState), []);

  const request = useCallback(
    () =>
      requestLocation().then((next) => {
        if (next) setState(next);
      }),
    [],
  );

  useEffect(() => {
    refresh();
    // Re-check when the user comes back from Settings.
    const subscription = AppState.addEventListener('change', (appState) => {
      if (appState === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  return { state, refresh, request };
}

// Greater Bangkok (the same box the maps use). Tables can only be made here.
export const BANGKOK_CENTER: Coords = { lat: 13.7466, lng: 100.5393 };
export function inBangkok({ lat, lng }: Coords): boolean {
  return lat >= 13.45 && lat <= 14.1 && lng >= 100.25 && lng <= 100.95;
}

// Straight-line distance in meters (haversine).
export function distanceMeters(a: Coords, b: Coords): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
