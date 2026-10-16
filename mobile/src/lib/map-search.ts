import { useEffect, useRef, useState } from 'react';

import type { Language } from '@/i18n';
import type { PlaceEntry, PlacePurpose, Place } from '@/lib/places';
import { supabase } from '@/lib/supabase';
import type { Venue } from '@/lib/venues';

// Search bar on the maps: the map's partner venues (matched here, the app already has them), its places (food or
// hangout) and Bangkok areas (districts, subdistricts, neighbourhoods, main roads) from the database (search_map).

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

export type SearchResult =
  | { type: 'venue'; venue: Venue }
  | { type: 'place'; place: Place }
  | { type: 'area'; area: Area };

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

function venueMatches(venue: Venue, query: string): boolean {
  return [venue.name_en, venue.name_th].some((name) => name.toLowerCase().includes(query));
}

export function useMapSearch(purpose: PlacePurpose, venues: Venue[]) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ query: string; rows: SearchRow[] } | null>(null);
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

  const rows = found && found.query === trimmed ? found.rows : null;
  const results: SearchResult[] = active
    ? [
        ...venues.filter((venue) => venueMatches(venue, trimmed)).slice(0, 5).map((venue) => ({ type: 'venue' as const, venue })),
        ...(rows ?? []).map((row): SearchResult => {
          const base = { id: row.id, name: row.name, name_en: row.name_en, name_th: row.name_th, lat: row.lat, lng: row.lng };
          return row.result_type === 'area'
            ? { type: 'area', area: { ...base, kind: row.kind as AreaKind } }
            : { type: 'place', place: { ...base, kind: row.kind, website: row.website, entry: row.entry } };
        }),
      ]
    : [];

  return {
    query,
    setQuery,
    // True while the query is long enough to show the results panel.
    active,
    searching: active && rows === null,
    results,
    clear: () => setQuery(''),
  };
}

export function areaName(area: Pick<Area, 'name' | 'name_en' | 'name_th'>, language: Language): string {
  return (language === 'th' ? area.name_th : area.name_en) || area.name;
}
