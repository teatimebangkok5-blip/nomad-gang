import type { PostgrestError } from '@supabase/supabase-js';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

// Profiles (name, Instagram, About, travel details, counts), follows (one-way, like Instagram; mutual = friends) and
// 👍 / 👎 feedback after a table or hangout. Rules live in the database
// (supabase/migrations/*_profiles_follows_feedback.sql, *_profile_details.sql).

export type Profile = {
  id: string;
  display_name: string;
  instagram: string | null;
  avatar_path: string | null;
  photo_paths: string[];
  followers: number;
  following: number;
  friends: number;
  tables: number;
  hangouts: number;
  thumbs_up: number;
  thumbs_down: number;
  i_follow: boolean;
  follows_me: boolean;
  age: number | null;
  home_country: string | null;
  languages: string[];
  profession: string | null;
  travel_style: string | null;
  interests: string[];
  world_clocks: string[];
  visited_countries: string[];
  upcoming_trips: number;
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
  'birth_date_required',
  'invalid_birth_date',
  'too_young',
  'invalid_country',
  'invalid_details',
  'invalid_time_zone',
  'too_many_clocks',
  'invalid_trip',
  'too_many_trips',
] as const;
export type ProfileErrorKey = (typeof KNOWN_ERRORS)[number] | 'generic';

export function profileErrorKey(error: Pick<PostgrestError, 'message'> | null): ProfileErrorKey | null {
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

// One profile. Reloads when the screen comes back into focus (after editing, adding a trip, …).
export function useProfile(userId: string) {
  const [state, setState] = useState<ProfileState>({ status: 'loading' });

  const load = useCallback(
    () =>
      supabase
        .rpc('get_profile', { p_user_id: userId })
        .then(({ data, error }) => {
          if (error) {
            console.warn('Loading profile failed', error.message);
            setState((prev) => (prev.status === 'ready' ? prev : { status: 'error' }));
            return;
          }
          const row = (data as Profile[])[0];
          setState(row ? { status: 'ready', profile: row } : { status: 'missing' });
        }),
    [userId],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return { state, reload: load };
}

export async function followUser(userId: string): Promise<ProfileErrorKey | null> {
  const { error } = await supabase.rpc('follow_user', { p_user_id: userId });
  return profileErrorKey(error);
}

export async function unfollowUser(userId: string): Promise<ProfileErrorKey | null> {
  const { error } = await supabase.rpc('unfollow_user', { p_user_id: userId });
  return profileErrorKey(error);
}

// What the first-time questions and Edit profile ask.
export type ProfileDetails = {
  display_name: string;
  instagram: string | null;
  birth_date: string | null;
  home_country: string | null;
  languages: string[];
  profession: string | null;
  travel_style: string | null;
  interests: string[];
  onboarded: boolean;
};

export async function fetchMyDetails(): Promise<ProfileDetails | null | 'error'> {
  const { data, error } = await supabase.rpc('my_profile_details');
  if (error) {
    console.warn('Loading my details failed', error.message);
    return 'error';
  }
  return ((data ?? []) as ProfileDetails[])[0] ?? null;
}

export async function saveMyProfile(details: Omit<ProfileDetails, 'onboarded'>): Promise<ProfileErrorKey | null> {
  const { error } = await supabase.rpc('save_my_profile', {
    p_display_name: details.display_name,
    p_instagram: details.instagram ?? '',
    p_birth_date: details.birth_date,
    p_home_country: details.home_country,
    p_languages: details.languages,
    p_profession: details.profession,
    p_travel_style: details.travel_style,
    p_interests: details.interests,
  });
  return profileErrorKey(error);
}

export async function saveWorldClocks(zones: string[]): Promise<ProfileErrorKey | null> {
  const { error } = await supabase.rpc('set_my_world_clocks', { p_zones: zones });
  return profileErrorKey(error);
}

export async function saveVisitedCountries(codes: string[]): Promise<ProfileErrorKey | null> {
  const { error } = await supabase.rpc('set_my_visited_countries', { p_codes: codes });
  return profileErrorKey(error);
}

export type FriendRow = { id: string; display_name: string; avatar_path: string | null; home_country: string | null };

// Someone's friends (people who follow each other).
export function useFriendsOf(userId: string) {
  const [friends, setFriends] = useState<FriendRow[] | null | 'error'>(null);
  useEffect(() => {
    supabase.rpc('user_friends', { p_user_id: userId }).then(({ data, error }) => {
      if (error) console.warn('Loading friends failed', error.message);
      setFriends(error ? 'error' : ((data ?? []) as FriendRow[]));
    });
  }, [userId]);
  return friends;
}

export type ProfileMeetup = {
  id: string;
  kind: 'table' | 'hangout';
  title: string | null;
  place_name: string | null;
  place_name_en: string | null;
  place_name_th: string | null;
  venue_name_en: string | null;
  venue_name_th: string | null;
  starts_at: string;
  ends_at: string;
  time_zone: string | null;
  member_count: number;
  is_host: boolean;
  upcoming: boolean;
};

// The tables and hangouts someone is going to or went to (Events tab).
export function useProfileMeetups(userId: string, enabled: boolean) {
  const [meetups, setMeetups] = useState<ProfileMeetup[] | null | 'error'>(null);
  useEffect(() => {
    if (!enabled) return;
    supabase.rpc('profile_meetups', { p_user_id: userId }).then(({ data, error }) => {
      if (error) console.warn('Loading events failed', error.message);
      setMeetups(error ? 'error' : ((data ?? []) as ProfileMeetup[]));
    });
  }, [userId, enabled]);
  return meetups;
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
      const key = profileErrorKey(error);
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
