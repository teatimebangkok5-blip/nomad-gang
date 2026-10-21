import { useEffect, useState } from 'react';

import type { Vibe } from '@/lib/meetups';
import { supabase } from '@/lib/supabase';

// My vibes (profiles.vibes, set with set_my_vibes): tables and hangouts with one of them are marked "Your vibe".
// Loaded once per app start and shared by every card.

let mine: Vibe[] | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<(vibes: Vibe[]) => void>();

function load() {
  loading ??= (async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      loading = null;
      return;
    }
    const { data, error } = await supabase.from('profiles').select('vibes').eq('id', auth.user.id).maybeSingle();
    if (error) {
      console.warn('Loading my vibes failed', error.message);
      loading = null;
      return;
    }
    mine = ((data?.vibes as Vibe[] | null) ?? []).slice();
    listeners.forEach((listener) => listener(mine as Vibe[]));
  })();
}

export function useMyVibes(): Vibe[] {
  const [vibes, setVibes] = useState<Vibe[]>(() => mine ?? []);
  useEffect(() => {
    listeners.add(setVibes);
    if (mine) Promise.resolve().then(() => setVibes(mine as Vibe[]));
    else load();
    return () => {
      listeners.delete(setVibes);
    };
  }, []);
  return vibes;
}

export async function saveMyVibes(vibes: Vibe[]): Promise<boolean> {
  const { error } = await supabase.rpc('set_my_vibes', { p_vibes: vibes });
  if (error) {
    console.warn('Saving my vibes failed', error.message);
    return false;
  }
  mine = [...vibes].sort();
  listeners.forEach((listener) => listener(mine as Vibe[]));
  return true;
}

// Someone's vibes, for their profile (About).
export function useProfileVibes(userId: string): Vibe[] {
  const [vibes, setVibes] = useState<Vibe[]>([]);
  useEffect(() => {
    supabase
      .from('profiles')
      .select('vibes')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => setVibes(((data?.vibes as Vibe[] | null) ?? []).slice()));
  }, [userId]);
  return vibes;
}
