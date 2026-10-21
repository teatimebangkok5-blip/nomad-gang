import { useCallback, useEffect, useState } from 'react';

import { meetupErrorKey, type MeetupErrorKey } from '@/lib/meetups';
import { supabase } from '@/lib/supabase';

// "Continuing the night?" (supabase/migrations/*_second_round.sql). From 30 minutes before a table / hangout ends
// until 3 hours after, its members see bars nearby and can start a second round (a pit-stop there, announced in
// the first chat). Its host can invite other groups nearby (max 3 per 12 hours).

// The window in which the members see it (the server checks the same).
export function secondRoundOpen(endsAt: string, now: number): boolean {
  const end = new Date(endsAt).getTime();
  return now >= end - 30 * 60_000 && now <= end + 3 * 60 * 60_000;
}

export type RoundPlace = {
  place_id: string | null;
  venue_id: string | null;
  name: string;
  name_en: string | null;
  name_th: string | null;
  kind: string;
  lat: number;
  lng: number;
  distance_m: number;
};

export function useSecondRoundPlaces(meetupId: string, enabled: boolean) {
  const [places, setPlaces] = useState<RoundPlace[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    supabase.rpc('second_round_places', { p_meetup_id: meetupId }).then(({ data, error }) => {
      if (error) console.warn('Loading second-round places failed', error.message);
      setPlaces((data ?? []) as RoundPlace[]);
    });
  }, [meetupId, enabled]);
  return places;
}

export async function createSecondRound(input: {
  meetupId: string;
  title: string;
  place: RoundPlace;
  startsInMinutes: number;
  durationMinutes: number;
  maxPeople: number;
}): Promise<{ id: string; error: null } | { id: null; error: MeetupErrorKey }> {
  const { data, error } = await supabase.rpc('create_second_round', {
    p_meetup_id: input.meetupId,
    p_title: input.title,
    p_venue_id: input.place.venue_id,
    p_place_id: input.place.place_id,
    p_starts_in_minutes: input.startsInMinutes,
    p_duration_minutes: input.durationMinutes,
    p_max_people: input.maxPeople,
  });
  if (error) {
    console.warn('Starting the second round failed', error.message);
    return { id: null, error: meetupErrorKey(error) ?? 'generic' };
  }
  return { id: data as string, error: null };
}

export type RoundTarget = {
  id: string;
  kind: 'table' | 'hangout';
  title: string;
  place_name: string | null;
  place_name_en: string | null;
  place_name_th: string | null;
  venue_id: string | null;
  member_count: number;
  distance_m: number;
  ends_at: string;
  invited: boolean;
};

// Groups nearby the host of a second round may invite.
export function useSecondRoundTargets(roundId: string, enabled: boolean) {
  const [targets, setTargets] = useState<RoundTarget[] | null>(null);
  const load = useCallback(() => {
    if (!enabled) return;
    supabase.rpc('second_round_targets', { p_round_id: roundId }).then(({ data, error }) => {
      if (error) console.warn('Loading groups nearby failed', error.message);
      setTargets((data ?? []) as RoundTarget[]);
    });
  }, [roundId, enabled]);
  useEffect(() => {
    load();
  }, [load]);
  return { targets, reload: load };
}

export async function inviteTable(roundId: string, targetId: string): Promise<MeetupErrorKey | null> {
  const { error } = await supabase.rpc('invite_table', { p_round_id: roundId, p_target_id: targetId });
  if (error) console.warn('Inviting failed', error.message);
  return meetupErrorKey(error);
}
