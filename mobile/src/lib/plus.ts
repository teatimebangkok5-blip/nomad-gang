import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// TableMeet Plus: Plan my day, Hidden Gems and the Rewards Passport, and no ads. For now the founder gives Plus by
// hand in the admin panel (monthly or yearly). The server checks it too: supabase/migrations/*_tablemeet_plus.sql.

export type PlusPlan = 'monthly' | 'yearly';

export type PlusState =
  | { status: 'loading' }
  | {
      status: 'ready';
      // Has Plus (or is the founder): no ads.
      member: boolean;
      // Can use the Plus features (a member, or the founder has unlocked them for everyone).
      unlocked: boolean;
      plan: PlusPlan | null;
      endsAt: string | null;
    };

// One shared copy for every screen, per signed-in user. Screens get it through React state (setState with the new
// value), never by reading `cache` while rendering: the React Compiler would keep showing the first value.
type Cached = { userId: string; state: PlusState };
let cache: Cached | null = null;
const listeners = new Set<(value: Cached) => void>();

async function fetchPlus(userId: string) {
  const { data, error } = await supabase.rpc('my_plus');
  if (error) {
    console.warn('Loading Plus failed', error.message);
    return;
  }
  const value = (data ?? {}) as { member?: boolean; unlocked?: boolean; plan?: PlusPlan | null; ends_at?: string | null };
  const next: Cached = {
    userId,
    state: {
      status: 'ready',
      member: !!value.member,
      unlocked: !!value.unlocked,
      plan: value.plan ?? null,
      endsAt: value.ends_at ?? null,
    },
  };
  cache = next;
  listeners.forEach((listener) => listener(next));
}

export function reloadPlus() {
  const userId = cache?.userId;
  if (userId) return fetchPlus(userId);
}

export function usePlus(): PlusState & { reload: () => void } {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [current, setCurrent] = useState<Cached | null>(cache);

  useEffect(() => {
    if (!userId) return;
    listeners.add(setCurrent);
    if (cache?.userId === userId) Promise.resolve(cache).then(setCurrent);
    else fetchPlus(userId);
    // The founder may give Plus while the app is open in the background.
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') fetchPlus(userId);
    });
    return () => {
      listeners.delete(setCurrent);
      appState.remove();
    };
  }, [userId]);

  const state: PlusState = userId && current?.userId === userId ? current.state : { status: 'loading' };
  return { ...state, reload: () => userId && fetchPlus(userId) };
}
