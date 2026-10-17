import { useEffect, useRef, useState } from 'react';

import { currentLanguage, type Language } from '@/i18n';
import type { Coords } from '@/lib/location';
import { WORLD_SUBCLASS_KIND, type PlaceEntry, type PlacePurpose, type Place } from '@/lib/places';
import { supabase } from '@/lib/supabase';
import type { Venue } from '@/lib/venues';

// Search bar on the maps: the map's partner venues (matched here, the app already has them), its places (food or
// hangout) and Bangkok areas (districts, subdistricts, neighbourhoods, main roads) from the database (search_map).
// With `world` on (home and the Hangout map), also cities, areas and places anywhere in the world from Photon
// (photon.komoot.io: free OpenStreetMap search, no key or billing, fair use), listed after the Bangkok results.

export type AreaKind = 'district' | 'subdistrict' | 'neighbourhood' | 'road';
export type Area = {
  id: string;
  name: string;
  name_en: string | null;
  name_th: string | null;
  kind: AreaKind;
  lat: number;
  lng: number;
};

// A Photon result: a country, region, city, area, street or place somewhere in the world.
export type WorldResult = {
  id: string;
  name: string;
  // "Paris, France"
  context: string;
  kind: 'country' | 'region' | 'city' | 'area' | 'street' | 'place';
  lat: number;
  lng: number;
  zoom: number;
  // Set for places to hang out (museums, parks, …): the Hangout map opens their card.
  place: Place | null;
};

export type SearchResult =
  | { type: 'venue'; venue: Venue }
  | { type: 'place'; place: Place }
  | { type: 'area'; area: Area }
  | { type: 'world'; world: WorldResult };

type SearchRow = {
  result_type: 'place' | 'area';
  id: string;
  name: string;
  name_en: string | null;
  name_th: string | null;
  kind: string;
  lat: number;
  lng: number;
  website: string | null;
  entry: PlaceEntry | null;
};

// How far to zoom in on a result.
export const AREA_ZOOM: Record<AreaKind, number> = { district: 14, subdistrict: 15, neighbourhood: 15.5, road: 15 };
export const PLACE_ZOOM = 16.5;

const MIN_LENGTH = 2;
const PHOTON = 'https://photon.komoot.io/api/';
const WORLD_ZOOM: Record<WorldResult['kind'], number> = { country: 5, region: 7, city: 12, area: 14, street: 16, place: 16.5 };

type PhotonFeature = {
  geometry: { type: string; coordinates: [number, number] };
  properties: {
    osm_id?: number;
    osm_type?: string;
    osm_key?: string;
    osm_value?: string;
    type?: string;
    name?: string;
    city?: string;
    state?: string;
    country?: string;
  };
};

function worldKind(type: string | undefined): WorldResult['kind'] {
  if (type === 'country') return 'country';
  if (type === 'state' || type === 'county') return 'region';
  if (type === 'city') return 'city';
  if (type === 'district' || type === 'locality') return 'area';
  if (type === 'street') return 'street';
  return 'place';
}

async function searchWorld(query: string, near: Coords | null, language: Language): Promise<WorldResult[]> {
  const params = new URLSearchParams({ q: query, limit: '8' });
  // Photon has English but not Thai names; Thai gets the local names.
  if (language === 'en') params.set('lang', 'en');
  if (near) {
    params.set('lat', near.lat.toFixed(3));
    params.set('lon', near.lng.toFixed(3));
  }
  const response = await fetch(`${PHOTON}?${params}`);
  if (!response.ok) throw new Error(`Photon ${response.status}`);
  const body = (await response.json()) as { features?: PhotonFeature[] };
  const seen = new Set<string>();
  return (body.features ?? []).flatMap((feature): WorldResult[] => {
    const p = feature.properties;
    const name = p.name?.trim();
    if (!name || feature.geometry?.type !== 'Point') return [];
    const [lng, lat] = feature.geometry.coordinates;
    const kind = worldKind(p.type);
    const context = [p.city, p.state, p.country]
      .filter((part, index, all): part is string => Boolean(part) && part !== name && all.indexOf(part) === index)
      .slice(-2)
      .join(', ');
    const key = `${name}|${context}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const placeKind =
      p.osm_value === 'place_of_worship' ? 'temple' : p.osm_value ? WORLD_SUBCLASS_KIND[p.osm_value] : undefined;
    const id = `world:${p.osm_type ?? ''}${p.osm_id ?? `${lat},${lng}`}`;
    return [
      {
        id,
        name,
        context,
        kind,
        lat,
        lng,
        zoom: WORLD_ZOOM[kind],
        place:
          kind === 'place' && placeKind
            ? { id, name, name_en: name, name_th: null, kind: placeKind, lat, lng, world: true }
            : null,
      },
    ];
  });
}

function venueMatches(venue: Venue, query: string): boolean {
  return [venue.name_en, venue.name_th].some((name) => name.toLowerCase().includes(query));
}

// `world`: also search the whole world (Photon), nearest to `near` (the user's location) first.
export function useMapSearch(purpose: PlacePurpose, venues: Venue[], world: { near: Coords | null } | null = null) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ query: string; rows: SearchRow[] } | null>(null);
  const [worldFound, setWorldFound] = useState<{ query: string; results: WorldResult[] } | null>(null);
  const worldLatest = useRef(0);
  const searchWorldToo = world !== null;
  const nearKey = world?.near ? `${world.near.lat.toFixed(2)},${world.near.lng.toFixed(2)}` : '';
  const latest = useRef(0);
  const trimmed = query.trim().toLowerCase();
  const active = trimmed.length >= MIN_LENGTH;

  useEffect(() => {
    if (trimmed.length < MIN_LENGTH) return;
    const request = ++latest.current;
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc('search_map', { p_query: trimmed, p_purpose: purpose });
      if (request !== latest.current) return;
      if (error) console.warn('Search failed', error.message);
      setFound({ query: trimmed, rows: error ? [] : (data as SearchRow[]) });
    }, 300);
    return () => clearTimeout(timer);
  }, [trimmed, purpose]);

  useEffect(() => {
    if (!searchWorldToo || trimmed.length < MIN_LENGTH) return;
    const request = ++worldLatest.current;
    const [lat, lng] = nearKey ? nearKey.split(',').map(Number) : [];
    const near = nearKey ? { lat, lng } : null;
    // A little longer than the Bangkok search, to send fewer requests to the free service while typing.
    const timer = setTimeout(() => {
      searchWorld(trimmed, near, currentLanguage())
        .catch((error: Error) => {
          console.warn('World search failed', error.message);
          return [];
        })
        .then((results) => {
          if (request !== worldLatest.current) return;
          setWorldFound({ query: trimmed, results });
        });
    }, 450);
    return () => clearTimeout(timer);
  }, [trimmed, searchWorldToo, nearKey]);

  const rows = found && found.query === trimmed ? found.rows : null;
  const worldResults = worldFound && worldFound.query === trimmed ? worldFound.results : null;
  const results: SearchResult[] = active
    ? [
        ...venues.filter((venue) => venueMatches(venue, trimmed)).slice(0, 5).map((venue) => ({ type: 'venue' as const, venue })),
        ...(rows ?? []).map((row): SearchResult => {
          const base = { id: row.id, name: row.name, name_en: row.name_en, name_th: row.name_th, lat: row.lat, lng: row.lng };
          return row.result_type === 'area'
            ? { type: 'area', area: { ...base, kind: row.kind as AreaKind } }
            : { type: 'place', place: { ...base, kind: row.kind, website: row.website, entry: row.entry } };
        }),
        ...(worldResults ?? []).map((result): SearchResult => ({ type: 'world', world: result })),
      ]
    : [];

  return {
    query,
    setQuery,
    // True while the query is long enough to show the results panel.
    active,
    searching: active && (rows === null || (searchWorldToo && worldResults === null)),
    results,
    clear: () => setQuery(''),
  };
}

export function areaName(area: Pick<Area, 'name' | 'name_en' | 'name_th'>, language: Language): string {
  return (language === 'th' ? area.name_th : area.name_en) || area.name;
}
