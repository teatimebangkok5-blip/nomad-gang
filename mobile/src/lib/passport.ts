import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

// Rewards Passport: points, Bangkok district stamps, milestone rewards (3 / 5 / 10 verified meetups) and group
// challenges. A meetup is verified once it has ended with 4+ members checked in by GPS, or with the host's code
// confirmed by 4+ members and approved by the founder. Everything is worked out by the server
// (supabase/migrations/*_rewards_passport.sql); one meetup per day counts.

export const PASSPORT_MILESTONES = [3, 5, 10] as const;
export const PASSPORT_PEOPLE = 4;

export type Challenge = {
  id: string;
  emoji: string;
  title_en: string;
  title_th: string;
  description_en: string;
  description_th: string;
  points: number;
};

export type PassportStamp = { name: string; name_en: string | null; name_th: string | null; count: number; first_at: string };

export type PassportMeetup = {
  id: string;
  kind: 'table' | 'hangout';
  title: string;
  place_name: string | null;
  starts_at: string;
  method: 'gps' | 'code';
  is_host: boolean;
  counted: boolean;
  points: number;
  challenge_id: string | null;
};

export type PassportReward = {
  id: string;
  milestone: number;
  title_en: string;
  title_th: string;
  details_en: string;
  details_th: string;
  venue_id: string | null;
  unlocked: boolean;
  coupon_code: string | null;
  link: string | null;
};

export type Passport = {
  points: number;
  verified: number;
  next_milestone: number | null;
  stamps: PassportStamp[];
  meetups: PassportMeetup[];
  rewards: PassportReward[];
  pending_reviews: number;
};

export type PassportSummary = { points: number; verified: number; stamps: number };

export function useMyPassport() {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; passport: Passport }>({
    status: 'loading',
  });
  const load = useCallback(
    () =>
      supabase.rpc('my_passport').then(({ data, error }) => {
        if (error || !data) {
          if (error) console.warn('Loading the passport failed', error.message);
          setState({ status: 'error' });
        } else {
          setState({ status: 'ready', passport: data as Passport });
        }
      }),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  return { state, reload: load };
}

export function usePassportSummary(userId: string | undefined) {
  const [summary, setSummary] = useState<PassportSummary | null>(null);
  useEffect(() => {
    if (!userId) return;
    supabase.rpc('passport_summary', { p_user_id: userId }).then(({ data }) => setSummary((data as PassportSummary) ?? null));
  }, [userId]);
  return summary;
}

// Active challenges, loaded once per app run.
let challengesCache: Challenge[] | null = null;
let challengesRequest: Promise<Challenge[]> | null = null;

function loadChallenges(): Promise<Challenge[]> {
  challengesRequest ??= Promise.resolve(
    supabase
      .from('challenges')
      .select('id, emoji, title_en, title_th, description_en, description_th, points')
      .eq('is_active', true)
      .order('sort'),
  ).then(({ data, error }) => {
    if (error) {
      challengesRequest = null;
      return [];
    }
    challengesCache = (data ?? []) as Challenge[];
    return challengesCache;
  });
  return challengesRequest;
}

export function useChallenges(): Challenge[] {
  const [challenges, setChallenges] = useState<Challenge[]>(challengesCache ?? []);
  useEffect(() => {
    if (challengesCache) return;
    loadChallenges().then(setChallenges);
  }, []);
  return challenges;
}

export async function setMeetupChallenge(meetupId: string, challengeId: string | null) {
  if (!challengeId) return;
  const { error } = await supabase.rpc('set_meetup_challenge', { p_meetup_id: meetupId, p_challenge_id: challengeId });
  if (error) console.warn('Saving the challenge failed', error.message);
}

const CODE_ERRORS = ['not_host', 'not_member', 'meetup_cancelled', 'not_started', 'too_late', 'no_code', 'too_many_attempts'] as const;
export type CompletionErrorKey = (typeof CODE_ERRORS)[number] | 'wrong_code' | 'generic';

function codeError(message: string): CompletionErrorKey {
  return CODE_ERRORS.find((key) => message.includes(key)) ?? 'generic';
}

// Host: show (and create) the completion code.
export async function startCompletionCode(meetupId: string): Promise<CompletionErrorKey | null> {
  const { error } = await supabase.rpc('start_completion_code', { p_meetup_id: meetupId });
  return error ? codeError(error.message) : null;
}

// Member: confirm with the host's code.
export async function confirmCompletionCode(meetupId: string, code: string): Promise<CompletionErrorKey | null> {
  const { data, error } = await supabase.rpc('confirm_completion_code', { p_meetup_id: meetupId, p_code: code });
  if (error) return codeError(error.message);
  return data === 'wrong_code' ? 'wrong_code' : null;
}
