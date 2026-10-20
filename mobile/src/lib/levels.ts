import { useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { reloadPlus } from '@/lib/plus';
import type { TravelDeal } from '@/lib/rewards';
import { supabase } from '@/lib/supabase';

// Levels (free for everyone; rules in supabase/migrations/*_story_likes_levels.sql): 100 points per level. 20 points
// for a table / hangout once 4+ members have checked in (max 2 a day), 20 per challenge. Every level has its own
// challenges, counting what happens after reaching it. Level 15 = TableMeet Plus (no ads) and every travel deal.
// Points are awarded on the server only; my_level() also awards challenges that are finished.

export type ChallengeKind =
  | 'profile_photo'
  | 'about'
  | 'instagram'
  | 'trip'
  | 'favorite'
  | 'story'
  | 'like_given'
  | 'like_received'
  | 'friend'
  | 'feedback'
  | 'checkin'
  | 'join_table'
  | 'join_hangout'
  | 'host_meetup';

export type LevelChallenge = {
  id: string;
  level: number;
  kind: ChallengeKind;
  target: number;
  progress: number;
  done: boolean;
  done_at: string | null;
  // A challenge of the next level (shown, not started).
  locked: boolean;
};

export type LevelHistoryItem = {
  source: 'meetup' | 'challenge';
  // Meetup id or challenge id.
  ref: string;
  points: number;
  at: string;
  meetup_kind: 'table' | 'hangout' | null;
  title: string | null;
  place_name: string | null;
  place_name_en: string | null;
  place_name_th: string | null;
};

export type LevelState = {
  level: number;
  points: number;
  // Points into the current level (0–99).
  level_points: number;
  per_level: number;
  meetup_points: number;
  challenge_points: number;
  plus_level: number;
  meetups_per_day: number;
  level_started_at: string | null;
  challenges: LevelChallenge[];
  history: LevelHistoryItem[];
  // Last 8 weeks (Monday, Bangkok date), oldest first.
  weekly: { week: string; points: number }[];
};

// What each kind of challenge is about, and where to go to do it.
export const CHALLENGE_EMOJI: Record<ChallengeKind, string> = {
  profile_photo: '🤳',
  about: '📝',
  instagram: '📸',
  trip: '🧳',
  favorite: '♥️',
  story: '📍',
  like_given: '👍',
  like_received: '❤️',
  friend: '🤝',
  feedback: '⭐',
  checkin: '✅',
  join_table: '🍽️',
  join_hangout: '🙌',
  host_meetup: '👑',
};

export function challengeRoute(kind: ChallengeKind): Href {
  switch (kind) {
    case 'profile_photo':
    case 'about':
    case 'instagram':
      return '/edit-profile';
    case 'trip':
      return '/trip-form';
    case 'story':
      return '/post-story';
    case 'friend':
      return '/travellers';
    case 'host_meetup':
      return '/create-table';
    case 'join_hangout':
      return '/create-hangout';
    default:
      // Favourites, likes, feedback and check-ins all start from the home map.
      return '/';
  }
}

// The level each signed-in person had when it was last loaded (for the "Level up!" banner).
let lastLevel: { userId: string; level: number } | null = null;

export function useLevel(userId: string | null) {
  const [state, setState] = useState<{ userId: string; level: LevelState | 'error'; levelUp: number | null } | null>(null);

  const load = useCallback(() => {
    if (!userId) return;
    supabase.rpc('my_level').then(({ data, error }) => {
      if (error || !data) {
        if (error) console.warn('Loading the level failed', error.message);
        setState((current) => (current?.userId === userId && current.level !== 'error' ? current : { userId, level: 'error', levelUp: null }));
        return;
      }
      const level = data as LevelState;
      const before = lastLevel?.userId === userId ? lastLevel.level : null;
      lastLevel = { userId, level: level.level };
      // Reaching the Plus level (or a new level after it) unlocks Plus: refresh it everywhere (ads, Plus screens).
      if (level.level >= level.plus_level) reloadPlus();
      setState((current) => ({
        userId,
        level,
        levelUp: before !== null && level.level > before ? level.level : current?.userId === userId ? current.levelUp : null,
      }));
    });
  }, [userId]);

  // Fresh every time the screen shows (e.g. back from finishing a challenge) and when the app comes back.
  useFocusEffect(load);
  useEffect(() => {
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') load();
    });
    return () => appState.remove();
  }, [load]);

  const mine = state && state.userId === userId ? state : null;
  return { level: mine?.level ?? null, levelUp: mine?.levelUp ?? null, reload: load };
}

export type LevelDeal = TravelDeal & { city_name: string | null; country_code: string | null };

// Every travel deal, for people at the Plus level (empty for others).
export function useLevelDeals(enabled: boolean) {
  const [deals, setDeals] = useState<LevelDeal[] | null>(null);
  const load = useCallback(() => {
    supabase.rpc('level_deals').then(({ data, error }) => {
      if (error) console.warn('Loading level deals failed', error.message);
      setDeals(error ? [] : ((data ?? []) as LevelDeal[]));
    });
  }, []);
  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);
  return { deals: enabled ? deals : null, reload: load };
}
