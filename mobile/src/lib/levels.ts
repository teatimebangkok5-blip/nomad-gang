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
      setKnownLevel(userId, level.level);
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

// ---------------------------------------------------------------------------
// Everyone's level, for the badge on profile pictures. Requests from all badges on screen are collected for a moment
// and loaded in one call (user_levels, max 300 ids, nothing across a block); results are kept for 5 minutes.
// ---------------------------------------------------------------------------

const LEVEL_TTL = 5 * 60_000;
const levelCache = new Map<string, { level: number | null; at: number }>();
const levelListeners = new Set<(levels: Map<string, number | null>) => void>();
const pendingLevels = new Set<string>();
let levelTimer: ReturnType<typeof setTimeout> | null = null;

function notifyLevels(ids: string[]) {
  const update = new Map(ids.map((id) => [id, levelCache.get(id)?.level ?? null]));
  levelListeners.forEach((listener) => listener(update));
}

async function flushLevels() {
  levelTimer = null;
  const ids = [...pendingLevels].slice(0, 300);
  ids.forEach((id) => pendingLevels.delete(id));
  if (pendingLevels.size) levelTimer = setTimeout(flushLevels, 0);
  if (!ids.length) return;
  const { data, error } = await supabase.rpc('user_levels', { p_user_ids: ids });
  if (error) {
    console.warn('Loading levels failed', error.message);
    return;
  }
  const now = Date.now();
  // People missing from the answer (blocked, deleted) get no badge.
  ids.forEach((id) => levelCache.set(id, { level: null, at: now }));
  for (const row of (data ?? []) as { user_id: string; level: number }[]) levelCache.set(row.user_id, { level: row.level, at: now });
  notifyLevels(ids);
}

function requestLevels(ids: string[]) {
  const now = Date.now();
  const fresh: string[] = [];
  for (const id of ids) {
    const cached = levelCache.get(id);
    if (cached && now - cached.at < LEVEL_TTL) fresh.push(id);
    else pendingLevels.add(id);
  }
  // Already known: hand them over after this render (never set state while rendering).
  if (fresh.length) Promise.resolve().then(() => notifyLevels(fresh));
  if (pendingLevels.size && !levelTimer) levelTimer = setTimeout(flushLevels, 30);
}

// My own level just loaded (My rewards): update my badges everywhere.
export function setKnownLevel(userId: string, level: number) {
  levelCache.set(userId, { level, at: Date.now() });
  notifyLevels([userId]);
}

// Levels of these people (missing until loaded; null = no badge).
export function useUserLevels(ids: (string | null | undefined)[]): Map<string, number | null> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))].sort();
  const key = wanted.join(',');
  const [levels, setLevels] = useState<Map<string, number | null>>(() => new Map());

  useEffect(() => {
    if (!key) return;
    const mine = new Set(key.split(','));
    const listener = (update: Map<string, number | null>) => {
      const relevant = [...update].filter(([id]) => mine.has(id));
      if (!relevant.length) return;
      setLevels((current) => {
        if (relevant.every(([id, level]) => current.has(id) && current.get(id) === level)) return current;
        const next = new Map(current);
        relevant.forEach(([id, level]) => next.set(id, level));
        return next;
      });
    };
    levelListeners.add(listener);
    requestLevels([...mine]);
    return () => {
      levelListeners.delete(listener);
    };
  }, [key]);

  return levels;
}

export function useUserLevel(userId: string | null | undefined): number | null {
  const levels = useUserLevels([userId]);
  return userId ? (levels.get(userId) ?? null) : null;
}
