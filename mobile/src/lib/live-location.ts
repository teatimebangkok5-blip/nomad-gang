import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';

// Keeps my live locations up to date while the app is open (founder's choice: no background location, so no extra
// Google Play review). Runs once in the root layout. When the app is closed, others see the last position and the
// time it was updated; it ends by itself at its end time.

type LiveShare = { chat_kind: 'dm' | 'meetup' | 'group'; chat_id: string; message_id: string; live_until: string };

// How often the position is sent at most.
const UPDATE_EVERY_MS = 15_000;

const listeners = new Set<() => void>();

// Call after starting or stopping a live location so the watcher picks it up.
export function liveSharesChanged() {
  listeners.forEach((listener) => listener());
}

export function useLiveLocationSharing(myId: string | undefined) {
  const [shares, setShares] = useState<LiveShare[]>([]);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const sharesRef = useRef<LiveShare[]>([]);

  const load = useCallback(() => {
    if (!myId) return;
    supabase.rpc('my_live_locations').then(({ data, error }) => {
      if (error) {
        console.warn('Loading live locations failed', error.message);
        return;
      }
      setShares((data ?? []) as LiveShare[]);
    });
  }, [myId]);

  useEffect(() => {
    sharesRef.current = shares;
  }, [shares]);

  useEffect(() => {
    load();
    listeners.add(load);
    const subscription = AppState.addEventListener('change', (next) => {
      setActive(next === 'active');
      if (next === 'active') load();
    });
    return () => {
      listeners.delete(load);
      subscription.remove();
    };
  }, [load]);

  // Drop shares when they end.
  useEffect(() => {
    if (shares.length === 0) return;
    const next = Math.min(...shares.map((share) => new Date(share.live_until).getTime()));
    const timer = setTimeout(load, Math.max(1000, next - Date.now() + 1000));
    return () => clearTimeout(timer);
  }, [shares, load]);

  const sharing = Boolean(myId) && active && shares.length > 0;

  useEffect(() => {
    if (!sharing) return;
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;
    let lastSent = 0;

    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: UPDATE_EVERY_MS, distanceInterval: 15 },
      (position) => {
        const now = Date.now();
        if (now - lastSent < UPDATE_EVERY_MS - 1000) return;
        lastSent = now;
        const running = sharesRef.current.filter((share) => new Date(share.live_until).getTime() > now);
        Promise.all(
          running.map((share) =>
            supabase
              .rpc('update_live_location', {
                p_chat_kind: share.chat_kind,
                p_message_id: share.message_id,
                p_lat: position.coords.latitude,
                p_lng: position.coords.longitude,
              })
              .then(({ data }) => data === true),
          ),
        ).then((results) => {
          // One ended or was stopped on another phone: reload the list.
          if (results.some((ok) => !ok) || running.length !== sharesRef.current.length) load();
        });
      },
    )
      .then((sub) => {
        if (cancelled) sub.remove();
        else subscription = sub;
      })
      .catch((error) => console.warn('Watching location failed', error));

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [sharing, load]);
}
