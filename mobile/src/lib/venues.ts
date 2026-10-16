import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { supabase, uniqueChannelName } from '@/lib/supabase';

// Food and drink venues host tables; hangout venues (parks, malls, museums, …) show on the Hangout map.
export const DINING_CATEGORIES = ['cafe', 'restaurant', 'rooftop', 'bar'] as const;
export const HANGOUT_CATEGORIES = ['attraction', 'park', 'mall', 'museum', 'temple', 'market', 'entertainment'] as const;
export const VENUE_CATEGORIES = [...DINING_CATEGORIES, ...HANGOUT_CATEGORIES] as const;
export type VenueCategory = (typeof VENUE_CATEGORIES)[number];

export function isHangoutVenue(venue: Pick<Venue, 'category'>): boolean {
  return (HANGOUT_CATEGORIES as readonly string[]).includes(venue.category);
}

export const PROMOTION_KINDS = ['discount', 'offer', 'event', 'party', 'ticket', 'free_entry'] as const;
export type PromotionKind = (typeof PROMOTION_KINDS)[number];

// The filter buttons on each map.
export const DINING_PROMOTION_KINDS: readonly PromotionKind[] = ['discount', 'offer', 'event', 'party'];
export const HANGOUT_PROMOTION_KINDS: readonly PromotionKind[] = ['ticket', 'free_entry', 'event', 'party'];

// Discount and offer use the coupon (unlocked when 3+ people check in); a ticket discount uses the coupon too, but
// any member of a hangout there can use it. Event, party and free entry are listings without a coupon.
export const COUPON_KINDS: readonly PromotionKind[] = ['discount', 'offer', 'ticket'];

// Used on the floating filter buttons and on map pins.
export const PROMOTION_EMOJI: Record<PromotionKind, string> = {
  discount: '💸',
  offer: '🎁',
  event: '🎵',
  party: '🎉',
  ticket: '🎟️',
  free_entry: '🆓',
};

// An event, party or dated ticket/free-entry promotion that is on right now.
export function isHappeningNow(promotion: Pick<VenueDeal, 'starts_at' | 'ends_at'>, now = Date.now()): boolean {
  return (
    promotion.starts_at !== null &&
    promotion.ends_at !== null &&
    new Date(promotion.starts_at).getTime() <= now &&
    new Date(promotion.ends_at).getTime() > now
  );
}

export type VenueDeal = {
  id: string;
  kind: PromotionKind;
  title_en: string;
  title_th: string;
  details_en: string;
  details_th: string;
  starts_at: string | null;
  ends_at: string | null;
  // Official ticket page for this event or ticket discount (https), set by the founder.
  ticket_url: string | null;
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
  place_id: string | null;
  // Official ticket page (https), set by the founder. Shown as "Buy tickets".
  ticket_url: string | null;
  // The active coupon promotion (discount, offer or ticket discount), if any.
  deal: VenueDeal | null;
  // Every active promotion, events/parties that have not ended yet, soonest first.
  promotions: VenueDeal[];
};

type VenueRow = Omit<Venue, 'deal' | 'promotions'> & { deals: VenueDeal[] };

// Row Level Security only returns live venues and their active promotions, so no filters are needed here.
const VENUE_COLUMNS =
  'id, name_en, name_th, category, address_en, address_th, lat, lng, photo_path, place_id, ticket_url, deals(id, kind, title_en, title_th, details_en, details_th, starts_at, ends_at, ticket_url)';

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
  const now = Date.now();
  return (data as VenueRow[]).map(({ deals, ...venue }) => {
    const promotions = deals
      .filter((deal) => !deal.ends_at || new Date(deal.ends_at).getTime() > now)
      .sort((a, b) => (a.starts_at ?? '').localeCompare(b.starts_at ?? ''));
    return { ...venue, promotions, deal: promotions.find((deal) => COUPON_KINDS.includes(deal.kind)) ?? null };
  });
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
      .channel(uniqueChannelName('venues-and-deals'))
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
