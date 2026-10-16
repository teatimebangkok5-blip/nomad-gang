import type { PostgrestError } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { supabase, uniqueChannelName } from '@/lib/supabase';

// "Tables" and "hangouts" in the app are `meetups` in the database (TABLE is an SQL keyword), told apart by `kind`.
// All writes go through database functions that enforce the rules (see supabase/migrations/*_meetups.sql and
// *_hangouts.sql). Joining, leaving, cancelling and the group chat work the same for both.
export type MeetupKind = 'table' | 'hangout';

// Where a meetup is: a partner venue (venue_id), a Bangkok place from OpenStreetMap (place_id; place_* filled in
// from public.places), or, for hangouts only, a spot anywhere on the map (no ids; place_name/lat/lng are the spot).
export type MeetupPlace = {
  venue_id: string | null;
  place_id: string | null;
  place_name: string | null;
  place_name_en: string | null;
  place_name_th: string | null;
  place_lat: number | null;
  place_lng: number | null;
};

export type OpenMeetup = MeetupPlace & {
  id: string;
  kind: MeetupKind;
  host_id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  max_people: number;
  member_count: number;
  joined: boolean;
};

export type MeetupMember = { user_id: string; joined_at: string; display_name: string };

export type MeetupDetail = MeetupPlace & {
  id: string;
  kind: MeetupKind;
  host_id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  max_people: number;
  status: 'open' | 'cancelled';
  members: MeetupMember[];
  // The place's official website (OpenStreetMap), if any.
  place_website: string | null;
};

// Error messages from the database functions are short keys like "meetup_full"; this turns them into the
// key of a translated message (tables.errors.* or hangouts.errors.*).
const KNOWN_ERRORS = [
  'invalid_duration',
  'title_required',
  'invalid_place',
  'outside_bangkok',
  'spot_name_required',
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

// A table at any Bangkok food place. The database moves it to the partner venue if one is linked to that place.
export async function createMeetupAtPlace(input: {
  placeId: string;
  startsAt: Date;
  maxPeople: number;
  title: string;
}): Promise<Result<string>> {
  const { data, error } = await supabase.rpc('create_meetup_at_place', {
    p_place_id: input.placeId,
    p_starts_at: input.startsAt.toISOString(),
    p_max_people: input.maxPeople,
    p_title: input.title,
  });
  return result(data as string | null, error);
}

// A hangout at a partner venue, a place (food or hangout place), or a named spot anywhere on the map.
export type HangoutWhere =
  | { type: 'venue'; venueId: string }
  | { type: 'place'; placeId: string }
  | { type: 'spot'; lat: number; lng: number; name: string };

export async function createHangout(input: {
  where: HangoutWhere;
  startsAt: Date;
  durationMinutes: number;
  maxPeople: number;
  title: string;
  description: string;
}): Promise<Result<string>> {
  const { where } = input;
  const { data, error } = await supabase.rpc('create_hangout', {
    p_title: input.title,
    p_description: input.description,
    p_starts_at: input.startsAt.toISOString(),
    p_duration_minutes: input.durationMinutes,
    p_max_people: input.maxPeople,
    p_venue_id: where.type === 'venue' ? where.venueId : null,
    p_place_id: where.type === 'place' ? where.placeId : null,
    p_spot_lat: where.type === 'spot' ? where.lat : null,
    p_spot_lng: where.type === 'spot' ? where.lng : null,
    p_spot_name: where.type === 'spot' ? where.name : null,
  });
  return result(data as string | null, error);
}

// The place name for a meetup that isn't at a partner venue (a place or a hangout's spot), in the app's language.
export function meetupPlaceName(meetup: MeetupPlace, language: 'en' | 'th'): string {
  return (language === 'th' ? meetup.place_name_th : meetup.place_name_en) || meetup.place_name || '—';
}

// Hangouts at the same venue, place or spot share one map pin.
export function meetupLocationKey(meetup: MeetupPlace): string {
  if (meetup.venue_id) return `v:${meetup.venue_id}`;
  if (meetup.place_id) return `p:${meetup.place_id}`;
  return `s:${meetup.place_lat?.toFixed(5)},${meetup.place_lng?.toFixed(5)}`;
}

// Where to draw a meetup: its venue's pin, or its place / spot.
export function meetupCoords(
  meetup: MeetupPlace,
  venueById: Map<string, { lat: number; lng: number }>,
): { lat: number; lng: number } | null {
  const venue = meetup.venue_id ? venueById.get(meetup.venue_id) : undefined;
  if (venue) return { lat: venue.lat, lng: venue.lng };
  return meetup.place_lat !== null && meetup.place_lng !== null ? { lat: meetup.place_lat, lng: meetup.place_lng } : null;
}

// Opens the spot in the phone's maps app (Google Maps, etc.) for directions. Free: it's just a link.
export function directionsUrl(place: { lat: number; lng: number; name?: string | null }) {
  const label = place.name ? `(${encodeURIComponent(place.name)})` : '';
  return `geo:${place.lat},${place.lng}?q=${place.lat},${place.lng}${label}`;
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

type MeetupRow = Omit<
  MeetupDetail,
  'members' | 'place_name' | 'place_name_en' | 'place_name_th' | 'place_lat' | 'place_lng' | 'place_website'
> & {
  place: {
    name: string;
    name_en: string | null;
    name_th: string | null;
    lat: number;
    lng: number;
    website: string | null;
  } | null;
  spot_name: string | null;
  spot_lat: number | null;
  spot_lng: number | null;
  meetup_members: { user_id: string; joined_at: string; profiles: { display_name: string } | null }[];
};

async function fetchMeetup(id: string): Promise<MeetupDetail | null | 'error'> {
  const { data, error } = await supabase
    .from('meetups')
    .select(
      'id, kind, venue_id, place_id, place:places(name, name_en, name_th, lat, lng, website), spot_name, spot_lat, spot_lng, ' +
        'host_id, title, description, starts_at, ends_at, max_people, status, ' +
        'meetup_members(user_id, joined_at, profiles(display_name))',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.warn('Loading table failed', error.message);
    return 'error';
  }
  if (!data) return null;
  const { meetup_members, place, spot_name, spot_lat, spot_lng, ...meetup } = data as unknown as MeetupRow;
  const members = meetup_members
    .map((m) => ({ user_id: m.user_id, joined_at: m.joined_at, display_name: m.profiles?.display_name ?? '' }))
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at));
  return {
    ...meetup,
    place_name: place?.name ?? spot_name,
    place_name_en: place?.name_en ?? null,
    place_name_th: place?.name_th ?? null,
    place_lat: place?.lat ?? spot_lat,
    place_lng: place?.lng ?? spot_lng,
    place_website: place?.website ?? null,
    members,
  };
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
