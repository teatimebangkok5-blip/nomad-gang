import type { PostgrestError } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { EventCategory } from '@/lib/events';
import { supabase, uniqueChannelName } from '@/lib/supabase';

// "Tables", "hangouts" and "events" in the app are `meetups` in the database (TABLE is an SQL keyword), told apart by
// `kind`. All writes go through database functions that enforce the rules (see supabase/migrations/*_meetups.sql,
// *_hangouts.sql and *_events.sql). Joining, leaving, cancelling and the group chat work the same for all three.
export type MeetupKind = 'table' | 'hangout' | 'event';

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
  // IANA time zone of the place (hangouts can be anywhere; tables are 'Asia/Bangkok'). Times show in this zone.
  time_zone: string;
  host_id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  max_people: number;
  member_count: number;
  joined: boolean;
  // OpenStreetMap kind of the place (restaurant, bar, …), for the Food / Drinks filters.
  place_kind: string | null;
  cost_level: CostLevel | null;
  meeting_point: string | null;
  // Nearest named Bangkok neighbourhood / subdistrict ("near Ari"); null outside Bangkok.
  area_name: string | null;
  area_name_en: string | null;
  area_name_th: string | null;
  // Group challenge picked by the host (Rewards Passport).
  challenge_id?: string | null;
  // Open: anyone joins. Private: people send a join request and the host approves.
  join_mode?: JoinMode;
  // My join request to a private one that isn't approved yet.
  my_request?: 'pending' | 'declined' | null;
  // The host's vibe tag.
  vibe?: Vibe | null;
  // "Heading to X in 15 min": a short hangout starting within the hour.
  pitstop?: boolean;
  // Only verified women see and join it.
  women_only?: boolean;
  // Events only (null / empty otherwise): category, entry price (null = free) and photo paths (event-photos bucket).
  event_category?: EventCategory | null;
  entry_fee_thb?: number | null;
  entry_fee_usd?: number | null;
  photo_paths?: string[];
};

export type JoinMode = 'open' | 'private';

// Vibe tags the host picks; "cowork" is the daytime "Work & coffee" mode.
export const VIBES = ['chill', 'party', 'foodies', 'networking', 'cowork'] as const;
export type Vibe = (typeof VIBES)[number];
export const VIBE_EMOJI: Record<Vibe, string> = { chill: '🤫', party: '🍻', foodies: '📸', networking: '💼', cowork: '💻' };

// Expected cost per person: 0 free, 1 under ฿300, 2 ฿300–700, 3 ฿700–1,500, 4 over ฿1,500.
export const COST_LEVELS = [0, 1, 2, 3, 4] as const;
export type CostLevel = (typeof COST_LEVELS)[number];

export type MeetupMember = {
  user_id: string;
  joined_at: string;
  display_name: string;
  avatar_path: string | null;
  // Events: when they plan to arrive.
  arrival_at: string | null;
};

export type MeetupDetail = MeetupPlace & {
  id: string;
  kind: MeetupKind;
  time_zone: string;
  host_id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  max_people: number;
  status: 'open' | 'cancelled';
  cost_level: CostLevel | null;
  meeting_point: string | null;
  challenge_id: string | null;
  join_mode: JoinMode;
  vibe: Vibe | null;
  pitstop: boolean;
  women_only: boolean;
  // A second round started from this table / hangout.
  second_round_of: string | null;
  // Events only.
  event_category: EventCategory | null;
  entry_fee_thb: number | null;
  entry_fee_usd: number | null;
  ticket_url: string | null;
  photo_paths: string[];
  announce_only: boolean;
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
  'invalid_time_zone',
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
  'approval_required',
  'not_private',
  'already_member',
  'blocked',
  'request_declined',
  'invalid_vibe',
  'not_verified_woman',
  'women_only',
  'not_now',
  'too_far',
  'already_invited',
  'too_many_invites',
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

// A hangout at a partner venue, a place (food or hangout place), or a named spot anywhere in the world (a dropped pin
// or a world place from the map tiles), with the spot's time zone.
export type HangoutWhere =
  | { type: 'venue'; venueId: string }
  | { type: 'place'; placeId: string }
  | { type: 'spot'; lat: number; lng: number; name: string; timeZone: string };

export async function createHangout(input: {
  where: HangoutWhere;
  startsAt: Date;
  durationMinutes: number;
  maxPeople: number;
  title: string;
  description: string;
  womenOnly?: boolean;
}): Promise<Result<string>> {
  const { where } = input;
  const { data, error } = await supabase.rpc(input.womenOnly ? 'create_women_only_hangout' : 'create_hangout', {
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
    p_time_zone: where.type === 'spot' ? where.timeZone : null,
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

// Expected cost and meeting point, set by the host right after creating (best effort: the table exists either way).
export async function setMeetupDetails(id: string, costLevel: CostLevel | null, meetingPoint: string) {
  if (costLevel === null && !meetingPoint.trim()) return;
  const { error } = await supabase.rpc('set_meetup_details', {
    p_meetup_id: id,
    p_cost_level: costLevel,
    p_meeting_point: meetingPoint.trim() || null,
  });
  if (error) console.warn('Saving cost / meeting point failed', error.message);
}

// Private (join requests, host approves) or open. Set by the host right after creating, like the details above.
export async function setMeetupJoinMode(id: string, mode: JoinMode) {
  if (mode === 'open') return;
  const { error } = await supabase.rpc('set_meetup_join_mode', { p_meetup_id: id, p_mode: mode });
  if (error) console.warn('Making the table private failed', error.message);
}

// The host's vibe tag; for a "Work & coffee" table also its length (1–8 hours instead of 3).
export async function setMeetupVibe(id: string, vibe: Vibe | null, hours?: number) {
  if (!vibe) return;
  const { error } = await supabase.rpc('set_meetup_vibe', { p_meetup_id: id, p_vibe: vibe, p_hours: hours ?? null });
  if (error) console.warn('Saving the vibe failed', error.message);
}

// A women-only table (only a verified woman can make one; only verified women see it).
export async function createWomenOnlyTable(input: {
  venueId: string | null;
  placeId: string | null;
  startsAt: Date;
  maxPeople: number;
  title: string;
}): Promise<Result<string>> {
  const { data, error } = await supabase.rpc('create_women_only_table', {
    p_venue_id: input.venueId,
    p_place_id: input.placeId,
    p_starts_at: input.startsAt.toISOString(),
    p_max_people: input.maxPeople,
    p_title: input.title,
  });
  return result(data as string | null, error);
}

// "Heading to X in 15 min": starts 0–60 minutes from now, 30–120 minutes long, 2–8 people.
export async function createPitstop(input: {
  where: HangoutWhere;
  title: string;
  startsInMinutes: number;
  durationMinutes: number;
  maxPeople: number;
}): Promise<Result<string>> {
  const { where } = input;
  const { data, error } = await supabase.rpc('create_pitstop', {
    p_title: input.title,
    p_starts_in_minutes: input.startsInMinutes,
    p_duration_minutes: input.durationMinutes,
    p_max_people: input.maxPeople,
    p_venue_id: where.type === 'venue' ? where.venueId : null,
    p_place_id: where.type === 'place' ? where.placeId : null,
    p_spot_lat: where.type === 'spot' ? where.lat : null,
    p_spot_lng: where.type === 'spot' ? where.lng : null,
    p_spot_name: where.type === 'spot' ? where.name : null,
    p_time_zone: where.type === 'spot' ? where.timeZone : null,
  });
  return result(data as string | null, error);
}

export async function requestToJoin(id: string): Promise<Result<null>> {
  const { error } = await supabase.rpc('request_to_join', { p_meetup_id: id });
  return result(null, error);
}

export async function cancelJoinRequest(id: string): Promise<Result<null>> {
  const { error } = await supabase.rpc('cancel_join_request', { p_meetup_id: id });
  return result(null, error);
}

export async function decideJoinRequest(id: string, userId: string, approve: boolean): Promise<Result<null>> {
  const { error } = await supabase.rpc('decide_join_request', { p_meetup_id: id, p_user_id: userId, p_approve: approve });
  return result(null, error);
}

export type JoinRequest = {
  user_id: string;
  status: 'pending' | 'approved' | 'declined';
  created_at: string;
  display_name: string;
  avatar_path: string | null;
};

// Join requests of a private table / hangout that I can see: all of them as the host, else only mine.
export function useJoinRequests(meetupId: string | undefined, enabled: boolean) {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const load = useCallback(() => {
    if (!meetupId) return;
    supabase
      .from('meetup_join_requests')
      .select('user_id, status, created_at, profiles(display_name, avatar_path)')
      .eq('meetup_id', meetupId)
      .order('created_at')
      .then(({ data, error }) => {
        if (error) {
          console.warn('Loading join requests failed', error.message);
          return;
        }
        type Row = Omit<JoinRequest, 'display_name' | 'avatar_path'> & {
          profiles: { display_name: string; avatar_path: string | null } | null;
        };
        setRequests(
          ((data ?? []) as unknown as Row[]).map(({ profiles, ...row }) => ({
            ...row,
            display_name: profiles?.display_name ?? '',
            avatar_path: profiles?.avatar_path ?? null,
          })),
        );
      });
  }, [meetupId]);

  useEffect(() => {
    if (!enabled || !meetupId) return;
    load();
    const channel = supabase
      .channel(uniqueChannelName(`join-requests-${meetupId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetup_join_requests', filter: `meetup_id=eq.${meetupId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, meetupId, load]);

  return { requests, reload: load };
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
  meetup_members: {
    user_id: string;
    joined_at: string;
    arrival_at: string | null;
    profiles: { display_name: string; avatar_path: string | null } | null;
  }[];
};

// One meetup with its members; null when it doesn't exist (or I can't see it).
export async function fetchMeetup(id: string): Promise<MeetupDetail | null | 'error'> {
  const { data, error } = await supabase
    .from('meetups')
    .select(
      'id, kind, time_zone, venue_id, place_id, place:places(name, name_en, name_th, lat, lng, website), spot_name, spot_lat, spot_lng, ' +
        'host_id, title, description, starts_at, ends_at, max_people, status, cost_level, meeting_point, challenge_id, join_mode, ' +
        'vibe, pitstop, women_only, second_round_of, ' +
        'event_category, entry_fee_thb, entry_fee_usd, ticket_url, photo_paths, announce_only, ' +
        'meetup_members(user_id, joined_at, arrival_at, profiles(display_name, avatar_path))',
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
    .map((m) => ({
      user_id: m.user_id,
      joined_at: m.joined_at,
      arrival_at: m.arrival_at,
      display_name: m.profiles?.display_name ?? '',
      avatar_path: m.profiles?.avatar_path ?? null,
    }))
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
