import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';

export const VENUE_CATEGORIES = ['cafe', 'restaurant', 'rooftop', 'bar'] as const;
export type VenueCategory = (typeof VENUE_CATEGORIES)[number];

export type VenueDeal = {
  id: string;
  title_en: string;
  title_th: string;
  details_en: string;
  details_th: string;
};

export type Venue = {
  id: string;
  name_en: string;
  name_th: string;
  category: VenueCategory;
  address_en: string;
  address_th: string;
  lat: number;
  lng: number;
  photo_path: string | null;
  deal: VenueDeal | null;
};

type VenueRow = Omit<Venue, 'deal'> & { deals: VenueDeal[] };

// Row Level Security only returns live venues and their active deal, so no filters are needed here.
const VENUE_COLUMNS =
  'id, name_en, name_th, category, address_en, address_th, lat, lng, photo_path, deals(id, title_en, title_th, details_en, details_th)';

type VenuesState =
  | { status: 'loading'; venues: Venue[] }
  | { status: 'ready'; venues: Venue[] }
  | { status: 'error'; venues: Venue[] };

// Returns null when loading fails.
async function fetchVenues(): Promise<Venue[] | null> {
  const { data, error } = await supabase.from('venues').select(VENUE_COLUMNS).order('name_en');
  if (error) {
    console.warn('Loading venues failed', error.message);
    return null;
  }
  return (data as VenueRow[]).map(({ deals, ...venue }) => ({ ...venue, deal: deals[0] ?? null }));
}

// Live list of partner venues. Updates by itself when the founder changes venues or deals in the admin panel.
export function useVenues() {
  const [state, setState] = useState<VenuesState>({ status: 'loading', venues: [] });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () =>
      fetchVenues().then((venues) =>
        setState((prev) =>
          venues
            ? { status: 'ready', venues }
            : // Keep showing what we had if a background refresh fails.
              { status: prev.venues.length ? 'ready' : 'error', venues: prev.venues },
        ),
      ),
    [],
  );

  const retry = useCallback(async () => {
    setState((prev) => ({ status: 'loading', venues: prev.venues }));
    await load();
  }, [load]);

  const pullToRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    load();
    // Realtime only sends changes the app is allowed to see, so a venue being *hidden* doesn't arrive as an
    // event. Reloading when the app comes back to the foreground covers that case.
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') load();
    });
    const channel = supabase
      .channel('venues-and-deals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'venues' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, () => load())
      .subscribe();
    return () => {
      appState.remove();
      supabase.removeChannel(channel);
    };
  }, [load]);

  return { ...state, refreshing, retry, pullToRefresh };
}
