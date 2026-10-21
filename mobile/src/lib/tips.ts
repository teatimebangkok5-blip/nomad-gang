import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

// Local insider tips on map places and partner venues (supabase/migrations/*_place_tips.sql): one short tip per person
// and place, "Helpful" votes, reports (hidden for the reporter at once, for everyone at 3). All through functions.

export type Tip = {
  id: string;
  user_id: string;
  display_name: string;
  avatar_path: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  helpful: number;
  voted: boolean;
  mine: boolean;
};

export type TipTarget = { placeId: string } | { venueId: string };

export const TIP_MAX = 280;

const TIP_ERRORS = ['not_allowed', 'invalid_tip', 'too_many_tips', 'own_tip', 'not_found'] as const;
export type TipError = (typeof TIP_ERRORS)[number] | 'generic';

function tipError(message: string): TipError {
  console.warn('Tip request failed', message);
  return TIP_ERRORS.find((key) => message.includes(key)) ?? 'generic';
}

function args(target: TipTarget) {
  return 'placeId' in target ? { p_place_id: target.placeId, p_venue_id: null } : { p_place_id: null, p_venue_id: target.venueId };
}

// The tips on one place, most helpful first (null while loading).
export function usePlaceTips(target: TipTarget | null) {
  const [tips, setTips] = useState<Tip[] | null>(null);
  const key = target ? ('placeId' in target ? `p:${target.placeId}` : `v:${target.venueId}`) : null;

  const load = useCallback(() => {
    if (!key) return;
    const [kind, id] = [key.slice(0, 1), key.slice(2)];
    supabase
      .rpc('place_tips', kind === 'p' ? { p_place_id: id, p_venue_id: null } : { p_place_id: null, p_venue_id: id })
      .then(({ data, error }) => {
        if (error) console.warn('Loading tips failed', error.message);
        else setTips((data ?? []) as Tip[]);
      });
  }, [key]);

  useEffect(() => {
    load();
  }, [load]);

  return { tips, reload: load };
}

export async function saveTip(target: TipTarget, body: string): Promise<TipError | null> {
  const { error } = await supabase.rpc('save_tip', { ...args(target), p_body: body.trim() });
  return error ? tipError(error.message) : null;
}

export async function deleteTip(id: string): Promise<TipError | null> {
  const { error } = await supabase.rpc('delete_tip', { p_tip_id: id });
  return error ? tipError(error.message) : null;
}

export async function voteTip(id: string, helpful: boolean): Promise<TipError | null> {
  const { error } = await supabase.rpc('vote_tip', { p_tip_id: id, p_helpful: helpful });
  return error ? tipError(error.message) : null;
}
