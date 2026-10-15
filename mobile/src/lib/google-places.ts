import Constants from 'expo-constants';

import type { GooglePlace } from '@/lib/meetups';

// TableMeet is Bangkok-only for now. Same box as the database check (supabase/migrations/*_bangkok_only.sql).
const BANGKOK = { minLat: 13.45, maxLat: 14.1, minLng: 100.25, maxLng: 100.95 };

export function inBangkok(place: { lat: number; lng: number }): boolean {
  return (
    place.lat >= BANGKOK.minLat && place.lat <= BANGKOK.maxLat && place.lng >= BANGKOK.minLng && place.lng <= BANGKOK.maxLng
  );
}

// The Maps key (restricted to this Android app) also calls Places API (New) for a place's types.
const apiKey: string | undefined = Constants.expoConfig?.extra?.googleApiKey;
const ANDROID_PACKAGE = 'com.tablemeet.app';
// SHA-1 of the signing key, without colons. Google checks it together with the package name.
// Must match the key used to sign the build (update when Google Play signing is used).
const ANDROID_CERT = '5E8F16062EA3CD2C4A0D547876BAA6F38CABF625';

// Google place types for eating and drinking: restaurants of every cuisine, cafes, bars, pubs, bakeries,
// food courts, noodle/dessert/juice shops, …
const FOOD_TYPE = /(^|_)(restaurant|cafe|coffee|bar|pub|bakery|food|meal|tea|dessert|ice_cream|juice|bistro|diner|deli|brewery|winery|steak|sushi|ramen|pizza|noodle|buffet|night_club|confectionery|chocolate|donut|bagel|hamburger|sandwich|acai|candy)(_|$)/;

export type PlaceCheck = 'food' | 'not_food' | 'outside_bangkok' | 'unknown';

// Is this Google place somewhere people can meet to eat or drink, in Bangkok?
// "unknown" means Google couldn't be asked (no key, no internet); the app then allows it.
export async function checkPlace(place: GooglePlace): Promise<PlaceCheck> {
  if (!inBangkok(place)) return 'outside_bangkok';
  if (!apiKey) return 'unknown';
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(place.placeId)}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'types,primaryType',
        'X-Android-Package': ANDROID_PACKAGE,
        'X-Android-Cert': ANDROID_CERT,
      },
    });
    if (!response.ok) {
      console.warn('Place check failed', response.status, await response.text());
      return 'unknown';
    }
    const data = (await response.json()) as { types?: string[]; primaryType?: string };
    const types = [data.primaryType, ...(data.types ?? [])].filter((type): type is string => Boolean(type));
    return types.some((type) => FOOD_TYPE.test(type)) ? 'food' : 'not_food';
  } catch (error) {
    console.warn('Place check failed', error);
    return 'unknown';
  }
}
