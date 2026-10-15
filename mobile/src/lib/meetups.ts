import type { PostgrestError } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { supabase, uniqueChannelName } from '@/lib/supabase';

// "Tables" in the app are `meetups` in the database (TABLE is an SQL keyword).
// All writes go through database functions that enforce the rules (see supabase/migrations/*_meetups.sql).

export type OpenMeetup = {
  id: string;
  venue_id: string;
  host_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  max_people: number;
  member_count: number;
  joined: boolean;
};

export type MeetupMember = { user_id: string; joined_at: string; display_name: string };

export type MeetupDetail = {
  id: string;
  venue_id: string;
  host_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  max_people: number;
  status: 'open' | 'cancelled';
  members: MeetupMember[];
};

// Error messages from the database functions are short keys like "meetup_full"; this turns them into the
// key of a translated message (tables.errors.*).
const KNOWN_ERRORS = [
  'auth_required',
  'not_allowed',
  'venue_unavailable',
  'invalid_time',
  'invalid_size',
  'too_many_open',
  'not_found',
  'meetup_full',
  'meetup_ended',
  'meetup_cancelled',
  'not_host',
] as const;
export type MeetupErrorKey = (typeof KNOWN_ERRORS)[number] | 'generic';

export function meetupErrorKey(error: Pick<PostgrestError, 'message'> | null): MeetupErrorKey | null {
  if (!error) return null;
  return KNOWN_ERRORS.find((key) => error.message.includes(key)) ?? 'generic';
}

type Result<T> = { data: T; error: null } | { data: null; error: MeetupErrorKey };

function result<T>(data: T | null, error: PostgrestError | null): Result<T> {
  if (error) {
    console.warn('Table request failed', error.message);
    return { data: null, error: meetupErrorKey(error) ?? 'generic' };
  }
  return { data: data as T, error: null };
}

export async function createMeetup(input: {
  venueId: string;
  startsAt: Date;
  maxPeople: number;
  title: string;
}): Promise<Result<string>> {
  const { data, error } = await supabase.rpc('create_meetup', {
    p_venue_id: input.venueId,
    p_starts_at: input.startsAt.toISOString(),
    p_max_people: input.maxPeople,
    p_title: input.title,
  });
  return result(data as string | null, error);
}

export async function joinMeetup(id: string): Promise<Result<null>> {
  const { error } = await supabase.rpc('join_meetup', { p_meetup_id: id });
  return result(null, error);
}

export async function leaveMeetup(id: string): Promise<Result<null>> {
  const { error } = await supabase.rpc('leave_meetup', { p_meetup_id: id });
  return result(null, error);
}

export async function cancelMeetup(id: string): Promise<Result<null>> {
  const { error } = await supabase.rpc('cancel_meetup', { p_meetup_id: id });
  return result(null, error);
}

async function fetchOpenMeetups(): Promise<OpenMeetup[] | null> {
  const { data, error } = await supabase.rpc('list_open_meetups');
  if (error) {
    console.warn('Loading tables failed', error.message);
    return null;
  }
  return data as OpenMeetup[];
}

type OpenMeetupsState =
  | { status: 'loading'; meetups: OpenMeetup[] }
  | { status: 'ready'; meetups: OpenMeetup[] }
  | { status: 'error'; meetups: OpenMeetup[] };

// Open and upcoming tables at live venues. Live-updates when anyone creates, joins, leaves or cancels a table.
// `enabled` is false until there is a session (tables are only visible to signed-in users and guests).
export function useOpenMeetups(enabled: boolean) {
  const [state, setState] = useState<OpenMeetupsState>({ status: 'loading', meetups: [] });

  const load = useCallback(
    () =>
      fetchOpenMeetups().then((meetups) =>
        setState((prev) =>
          meetups
            ? { status: 'ready', meetups }
            : { status: prev.meetups.length ? 'ready' : 'error', meetups: prev.meetups },
        ),
      ),
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    load();
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') load();
    });
    const channel = supabase
      .channel(uniqueChannelName('open-tables'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetups' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetup_members' }, () => load())
      .subscribe();
    // Tables drop off when they end even if nothing else changes.
    const timer = setInterval(load, 5 * 60 * 1000);
    return () => {
      appState.remove();
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled, load]);

  return { ...state, reload: load };
}

type MeetupRow = Omit<MeetupDetail, 'members'> & {
  meetup_members: { user_id: string; joined_at: string; profiles: { display_name: string } | null }[];
};

async function fetchMeetup(id: string): Promise<MeetupDetail | null | 'error'> {
  const { data, error } = await supabase
    .from('meetups')
    .select(
      'id, venue_id, host_id, title, starts_at, ends_at, max_people, status, meetup_members(user_id, joined_at, profiles(display_name))',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.warn('Loading table failed', error.message);
    return 'error';
  }
  if (!data) return null;
  const { meetup_members, ...meetup } = data as unknown as MeetupRow;
  const members = meetup_members
    .map((m) => ({ user_id: m.user_id, joined_at: m.joined_at, display_name: m.profiles?.display_name ?? '' }))
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at));
  return { ...meetup, members };
}

type MeetupState =
  | { status: 'loading' }
  | { status: 'ready'; meetup: MeetupDetail }
  | { status: 'missing' }
  | { status: 'error' };

// One table with its members, live-updated.
export function useMeetup(id: string) {
  const [state, setState] = useState<MeetupState>({ status: 'loading' });

  const load = useCallback(
    () =>
      fetchMeetup(id).then((meetup) =>
        setState(
          meetup === 'error' ? { status: 'error' } : meetup ? { status: 'ready', meetup } : { status: 'missing' },
        ),
      ),
    [id],
  );

  useEffect(() => {
    load();
    const channel = supabase
      .channel(uniqueChannelName(`table-${id}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetups', filter: `id=eq.${id}` }, () => load())
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meetup_members', filter: `meetup_id=eq.${id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, load]);

  return { state, reload: load };
}
