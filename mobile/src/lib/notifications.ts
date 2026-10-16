import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { supabase, uniqueChannelName } from '@/lib/supabase';
import type { PromotionKind, VenueCategory } from '@/lib/venues';

// In-app notifications (supabase/migrations/*_notifications.sql): built on the server from new tables and hangouts,
// people joining mine, chat and direct messages, new followers and new venue promotions.

export type NotificationKind =
  | 'new_table'
  | 'new_hangout'
  | 'joined'
  | 'chat_message'
  | 'direct_message'
  | 'dm_request'
  | 'follow'
  | 'promotion';

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_avatar: string | null;
  meetup_id: string | null;
  meetup_kind: 'table' | 'hangout' | null;
  title: string | null;
  place_name: string | null;
  place_name_en: string | null;
  place_name_th: string | null;
  venue_id: string | null;
  venue_name_en: string | null;
  venue_name_th: string | null;
  venue_category: VenueCategory | null;
  promo_kind: PromotionKind | null;
  promo_title_en: string | null;
  promo_title_th: string | null;
  body: string | null;
  unread: boolean;
};

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: AppNotification[] };

const REFRESH_MS = 2 * 60 * 1000;

// The list and the unread count. Reloads when the screen using it comes into focus, when the app returns to the
// foreground, every 2 minutes, and (a moment after) when something new happens that could be a notification.
export function useNotifications(enabled: boolean) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    if (!enabled) return;
    supabase.rpc('my_notifications', { p_limit: 60 }).then(({ data, error }) => {
      if (error) {
        console.warn('Loading notifications failed', error.message);
        setState((prev) => (prev.status === 'ready' ? prev : { status: 'error' }));
        return;
      }
      setState({ status: 'ready', items: (data ?? []) as AppNotification[] });
    });
  }, [enabled]);

  useFocusEffect(load);

  useEffect(() => {
    if (!enabled) return;
    const soon = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(load, 1500);
    };
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') load();
    });
    const interval = setInterval(load, REFRESH_MS);
    const channel = supabase
      .channel(uniqueChannelName('notifications'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'meetups' }, soon)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'meetup_members' }, soon)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'meetup_messages' }, soon)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, soon)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'deals' }, soon)
      .subscribe();
    return () => {
      appState.remove();
      clearInterval(interval);
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [enabled, load]);

  const items = state.status === 'ready' ? state.items : [];
  return {
    state,
    items,
    unreadCount: items.filter((item) => item.unread).length,
    reload: load,
  };
}

// Everything up to now counts as seen (the bell's badge clears).
export async function markNotificationsSeen(): Promise<void> {
  const { error } = await supabase.rpc('mark_notifications_seen');
  if (error) console.warn('Marking notifications seen failed', error.message);
}
