import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { distanceMeters, type Coords } from '@/lib/location';
import { supabase, uniqueChannelName } from '@/lib/supabase';

// The group coupon on a table / hangout at a partner venue: check in at the venue (the server re-checks the 50 m
// rule), then once enough members are checked in (discount / offer: 3; ticket discount: 1) any checked-in member gets
// the group's QR code. It's valid 15 minutes; staff scan it and see the coupon code after their venue login on the
// web page /r/<token>. Rules: supabase/migrations/*_checkins_redemptions_account_deletion.sql.

export type CouponDeal = {
  id: string;
  kind: 'discount' | 'offer' | 'ticket';
  title_en: string;
  title_th: string;
  // Checked-in members needed to unlock it.
  needed: number;
  redeemed_at: string | null;
  // Only for checked-in members, while a code is valid.
  qr_token: string | null;
  qr_expires_at: string | null;
};

export type CouponState = {
  checked_in: number;
  me_checked_in: boolean;
  // From 15 minutes before the start until the end (not cancelled).
  window_open: boolean;
  venue: { lat: number; lng: number; radius_m: number } | null;
  deals: CouponDeal[];
};

const KNOWN_ERRORS = [
  'not_member',
  'meetup_cancelled',
  'not_now',
  'no_venue',
  'too_far',
  'not_checked_in',
  'no_coupon',
  'already_redeemed',
  'need_more_people',
] as const;
export type CouponErrorKey = (typeof KNOWN_ERRORS)[number] | 'no_location' | 'generic';

function couponError(message: string): CouponErrorKey {
  return KNOWN_ERRORS.find((key) => message.includes(key)) ?? 'generic';
}

// The web page staff open. Baked into the app at build time (EXPO_PUBLIC_WEB_URL).
const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? '').replace(/\/+$/, '');

export function redemptionUrl(token: string): string | null {
  return WEB_URL.startsWith('https://') || WEB_URL.startsWith('http://') ? `${WEB_URL}/r/${token}` : null;
}

async function fetchCouponState(meetupId: string): Promise<CouponState | null> {
  const { data, error } = await supabase.rpc('meetup_coupon_state', { p_meetup_id: meetupId });
  if (error) {
    console.warn('Loading the coupon failed', error.message);
    return null;
  }
  return data as CouponState;
}

// Live coupon state for a member: refreshed when someone checks in, every 30 s and when the app comes back.
export function useCouponState(meetupId: string, enabled: boolean) {
  const [state, setState] = useState<CouponState | null>(null);

  const load = useCallback(
    () =>
      fetchCouponState(meetupId).then((next) => {
        if (next) setState(next);
      }),
    [meetupId],
  );

  useEffect(() => {
    if (!enabled) return;
    load();
    const channel = supabase
      .channel(uniqueChannelName(`checkins-${meetupId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meetup_checkins', filter: `meetup_id=eq.${meetupId}` },
        () => load(),
      )
      .subscribe();
    const timer = setInterval(load, 30_000);
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') load();
    });
    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
      appState.remove();
    };
  }, [enabled, meetupId, load]);

  return { state: enabled ? state : null, reload: load };
}

export type DistanceState =
  | { status: 'off' }
  | { status: 'locating' }
  | { status: 'denied'; canAskAgain: boolean }
  | { status: 'ready'; meters: number };

// Watches the phone's position while `active` and returns the distance to the venue. Only decides whether to show
// the Check in button; the server checks the location again.
export function useVenueDistance(venue: Coords | null, active: boolean) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [permission, setPermission] = useState<{ granted: boolean; canAskAgain: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let subscription: Location.LocationSubscription | null = null;
    Location.getForegroundPermissionsAsync()
      .then(async (current) => {
        if (stopped) return;
        setPermission({ granted: current.granted, canAskAgain: current.canAskAgain });
        if (!current.granted) return;
        const watch = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 5000 },
          (position) => setCoords({ lat: position.coords.latitude, lng: position.coords.longitude }),
        );
        if (stopped) watch.remove();
        else subscription = watch;
      })
      .catch(() => {});
    return () => {
      stopped = true;
      subscription?.remove();
    };
  }, [active, attempt]);

  async function ask() {
    const current = await Location.getForegroundPermissionsAsync();
    if (!current.granted && current.canAskAgain) await Location.requestForegroundPermissionsAsync();
    setAttempt((n) => n + 1);
  }

  const state: DistanceState = !active
    ? { status: 'off' }
    : permission && !permission.granted
      ? { status: 'denied', canAskAgain: permission.canAskAgain }
      : venue && coords
        ? { status: 'ready', meters: distanceMeters(venue, coords) }
        : { status: 'locating' };
  return { state, ask };
}

// Check in with a fresh, accurate position.
export async function checkIn(meetupId: string): Promise<CouponErrorKey | null> {
  let position: Location.LocationObject;
  try {
    position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  } catch {
    return 'no_location';
  }
  const { error } = await supabase.rpc('check_in', {
    p_meetup_id: meetupId,
    p_lat: position.coords.latitude,
    p_lng: position.coords.longitude,
  });
  return error ? couponError(error.message) : null;
}

// The group's QR for a promotion (the same one until it expires).
export async function requestQr(meetupId: string, dealId: string): Promise<CouponErrorKey | null> {
  const { error } = await supabase.rpc('issue_redemption_qr', { p_meetup_id: meetupId, p_deal_id: dealId });
  return error ? couponError(error.message) : null;
}
