import type { PostgrestError } from '@supabase/supabase-js';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

// Profiles (name, Instagram, counts), follows (one-way, like Instagram) and 👍 / 👎 feedback after a table or
// hangout. Rules live in the database (supabase/migrations/*_profiles_follows_feedback.sql).

export type Profile = {
  id: string;
  display_name: string;
  instagram: string | null;
  avatar_path: string | null;
  photo_paths: string[];
  followers: number;
  following: number;
  tables: number;
  hangouts: number;
  thumbs_up: number;
  thumbs_down: number;
  i_follow: boolean;
  follows_me: boolean;
};

const KNOWN_ERRORS = [
  'auth_required',
  'not_allowed',
  'not_found',
  'blocked',
  'name_required',
  'invalid_instagram',
  'not_member',
  'meetup_cancelled',
  'meetup_not_ended',
  'feedback_closed',
  'invalid_vote',
  'invalid_photo',
  'too_many_photos',
] as const;
export type ProfileErrorKey = (typeof KNOWN_ERRORS)[number] | 'generic';

function errorKey(error: PostgrestError | null): ProfileErrorKey | null {
  if (!error) return null;
  console.warn('Profile request failed', error.message);
  return KNOWN_ERRORS.find((key) => error.message.includes(key)) ?? 'generic';
}

// The signed-in person's name and picture (for the profile button on home). Reloads when the screen comes back
// into focus, so changes made on the profile page show straight away.
export function useMyName(myId: string | undefined) {
  const [me, setMe] = useState<{ name: string; avatarPath: string | null } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!myId) return;
      supabase
        .from('profiles')
        .select('display_name, avatar_path')
        .eq('id', myId)
        .maybeSingle()
        .then(({ data }) => {
          const row = data as { display_name: string; avatar_path: string | null } | null;
          setMe(row ? { name: row.display_name, avatarPath: row.avatar_path } : null);
        });
    }, [myId]),
  );

  return me;
}

export function instagramUrl(handle: string): string {
  return `https://www.instagram.com/${encodeURIComponent(handle)}/`;
}

type ProfileState = { status: 'loading' } | { status: 'ready'; profile: Profile } | { status: 'missing' } | { status: 'error' };

export function useProfile(userId: string) {
  const [state, setState] = useState<ProfileState>({ status: 'loading' });

  const load = useCallback(
    () =>
      supabase
        .rpc('get_profile', { p_user_id: userId })
        .then(({ data, error }) => {
          if (error) {
            console.warn('Loading profile failed', error.message);
            setState({ status: 'error' });
            return;
          }
          const row = (data as Profile[])[0];
          setState(row ? { status: 'ready', profile: row } : { status: 'missing' });
        }),
    [userId],
  );

  useEffect(() => {
    load();
  }, [load]);

  return { state, reload: load };
}

export async function followUser(userId: string): Promise<ProfileErrorKey | null> {
  const { error } = await supabase.rpc('follow_user', { p_user_id: userId });
  return errorKey(error);
}

export async function unfollowUser(userId: string): Promise<ProfileErrorKey | null> {
  const { error } = await supabase.rpc('unfollow_user', { p_user_id: userId });
  return errorKey(error);
}

export async function updateMyProfile(displayName: string, instagram: string): Promise<ProfileErrorKey | null> {
  const { error } = await supabase.rpc('update_my_profile', { p_display_name: displayName, p_instagram: instagram });
  return errorKey(error);
}

// The people the caller follows (for Follow buttons in lists such as Travellers nearby).
export function useFollowing(myId: string | undefined) {
  const [ids, setIds] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    if (!myId) return;
    supabase
      .from('follows')
      .select('followee_id')
      .eq('follower_id', myId)
      .then(({ data }) => setIds(new Set(((data ?? []) as { followee_id: string }[]).map((row) => row.followee_id))));
  }, [myId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = useCallback(
    async (userId: string) => {
      const following = ids.has(userId);
      const error = following ? await unfollowUser(userId) : await followUser(userId);
      if (!error) {
        setIds((prev) => {
          const next = new Set(prev);
          if (following) next.delete(userId);
          else next.add(userId);
          return next;
        });
      }
      return error;
    },
    [ids],
  );

  return { ids, toggle };
}

export type Vote = 1 | -1;

// The 👍 / 👎 the caller gave at one table or hangout, by person.
export function useMyFeedback(meetupId: string, enabled: boolean) {
  const [votes, setVotes] = useState<Map<string, Vote>>(new Map());

  useEffect(() => {
    if (!enabled) return;
    supabase
      .from('member_feedback')
      .select('to_id, vote')
      .eq('meetup_id', meetupId)
      .then(({ data }) =>
        setVotes(new Map(((data ?? []) as { to_id: string; vote: Vote }[]).map((row) => [row.to_id, row.vote]))),
      );
  }, [meetupId, enabled]);

  // Tapping the same thumb again takes the vote back.
  const give = useCallback(
    async (toUser: string, vote: Vote) => {
      const next = votes.get(toUser) === vote ? 0 : vote;
      const { error } = await supabase.rpc('give_feedback', { p_meetup_id: meetupId, p_to_user: toUser, p_vote: next });
      const key = errorKey(error);
      if (!key) {
        setVotes((prev) => {
          const updated = new Map(prev);
          if (next === 0) updated.delete(toUser);
          else updated.set(toUser, next);
          return updated;
        });
      }
      return key;
    },
    [meetupId, votes],
  );

  return { votes, give };
}
