import type { PostgrestError } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';

import { bangkokDay, bangkokMinutes, type BangkokDay } from '@/lib/bangkok-time';
import { formatMoney } from '@/lib/currency';
import { meetupErrorKey, type HangoutWhere, type JoinMode, type MeetupErrorKey } from '@/lib/meetups';
import { supabase, uniqueChannelName } from '@/lib/supabase';

// Events: bigger, planned meetups (kind 'event', 2–150 people, open for 30 minutes to 7 days, up to 60 days ahead)
// created from the Hangout map. Free or paid: a paid event only shows its price (THB and/or USD), paid to the organiser
// at the door or on their own ticket page; nothing is paid in the app. People pick when they arrive within the event's
// hours. Rules live in supabase/migrations/*_events.sql.

export const EVENT_CATEGORIES = ['music', 'art', 'sports', 'workshop', 'language', 'party', 'food', 'outdoors', 'other'] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export const EVENT_EMOJI: Record<EventCategory, string> = {
  music: '🎵',
  art: '🎨',
  sports: '⚽',
  workshop: '🛠️',
  language: '🗣️',
  party: '🎉',
  food: '🍜',
  outdoors: '🌿',
  other: '🎟️',
};

export const EVENT_LIMITS = { minPeople: 2, maxPeople: 150, daysAhead: 60, maxDays: 7, maxPhotos: 2 };
export const EVENT_PHOTO_BUCKET = 'event-photos';

const EVENT_ERRORS = [
  'invalid_category',
  'invalid_price',
  'verification_required',
  'invalid_link',
  'invalid_photo',
  'invalid_mode',
  'not_event',
  'not_member',
  'invalid_arrival',
  'not_full',
  'announce_only',
  'size_below_members',
] as const;
export type EventErrorKey = MeetupErrorKey | (typeof EVENT_ERRORS)[number];

type Result<T> = { data: T; error: null } | { data: null; error: EventErrorKey };

function result<T>(data: T | null, error: PostgrestError | null): Result<T> {
  if (error) {
    console.warn('Event request failed', error.message);
    const own = EVENT_ERRORS.find((key) => error.message.includes(key));
    return { data: null, error: own ?? meetupErrorKey(error) ?? 'generic' };
  }
  return { data: data as T, error: null };
}

export function eventPhotoUrl(path: string): string {
  return supabase.storage.from(EVENT_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function createEvent(input: {
  where: HangoutWhere;
  title: string;
  description: string;
  category: EventCategory;
  startsAt: Date;
  endsAt: Date;
  maxPeople: number;
  meetingPoint: string;
  feeThb: number | null;
  feeUsd: number | null;
  ticketUrl: string | null;
  photoPaths: string[];
  announceOnly: boolean;
  joinMode: JoinMode;
  womenOnly: boolean;
}): Promise<Result<string>> {
  const { where } = input;
  const { data, error } = await supabase.rpc('create_event', {
    p_title: input.title,
    p_description: input.description,
    p_category: input.category,
    p_starts_at: input.startsAt.toISOString(),
    p_ends_at: input.endsAt.toISOString(),
    p_max_people: input.maxPeople,
    p_venue_id: where.type === 'venue' ? where.venueId : null,
    p_place_id: where.type === 'place' ? where.placeId : null,
    p_spot_lat: where.type === 'spot' ? where.lat : null,
    p_spot_lng: where.type === 'spot' ? where.lng : null,
    p_spot_name: where.type === 'spot' ? where.name : null,
    p_time_zone: where.type === 'spot' ? where.timeZone : null,
    p_meeting_point: input.meetingPoint.trim() || null,
    p_fee_thb: input.feeThb,
    p_fee_usd: input.feeUsd,
    p_ticket_url: input.ticketUrl,
    p_photo_paths: input.photoPaths,
    p_announce_only: input.announceOnly,
    p_join_mode: input.joinMode,
    p_women_only: input.womenOnly,
  });
  return result(data as string | null, error);
}

// The organiser edits an event: everything from the form except who can join and women-only (update_event).
export async function updateEvent(
  id: string,
  input: Omit<Parameters<typeof createEvent>[0], 'joinMode' | 'womenOnly'>,
): Promise<Result<null>> {
  const { where } = input;
  const { error } = await supabase.rpc('update_event', {
    p_meetup_id: id,
    p_title: input.title,
    p_description: input.description,
    p_category: input.category,
    p_starts_at: input.startsAt.toISOString(),
    p_ends_at: input.endsAt.toISOString(),
    p_max_people: input.maxPeople,
    p_venue_id: where.type === 'venue' ? where.venueId : null,
    p_place_id: where.type === 'place' ? where.placeId : null,
    p_spot_lat: where.type === 'spot' ? where.lat : null,
    p_spot_lng: where.type === 'spot' ? where.lng : null,
    p_spot_name: where.type === 'spot' ? where.name : null,
    p_time_zone: where.type === 'spot' ? where.timeZone : null,
    p_meeting_point: input.meetingPoint.trim() || null,
    p_fee_thb: input.feeThb,
    p_fee_usd: input.feeUsd,
    p_ticket_url: input.ticketUrl,
    p_photo_paths: input.photoPaths,
    p_announce_only: input.announceOnly,
  });
  return result(null, error);
}

export function deleteEventPhotos(paths: string[]) {
  if (paths.length === 0) return;
  supabase.storage
    .from(EVENT_PHOTO_BUCKET)
    .remove(paths)
    .then(({ error }) => error && console.warn('Removing event photos failed', error.message));
}

export async function joinEvent(id: string, arrivalAt: Date | null): Promise<Result<null>> {
  const { error } = await supabase.rpc('join_event', { p_meetup_id: id, p_arrival_at: arrivalAt?.toISOString() ?? null });
  return result(null, error);
}

export async function setEventArrival(id: string, arrivalAt: Date | null): Promise<Result<null>> {
  const { error } = await supabase.rpc('set_event_arrival', { p_meetup_id: id, p_arrival_at: arrivalAt?.toISOString() ?? null });
  return result(null, error);
}

export async function joinWaitlist(id: string, arrivalAt: Date | null): Promise<Result<null>> {
  const { error } = await supabase.rpc('join_waitlist', { p_meetup_id: id, p_arrival_at: arrivalAt?.toISOString() ?? null });
  return result(null, error);
}

export async function leaveWaitlist(id: string): Promise<Result<null>> {
  const { error } = await supabase.rpc('leave_waitlist', { p_meetup_id: id });
  return result(null, error);
}

export async function setEventAnnounceOnly(id: string, on: boolean): Promise<Result<null>> {
  const { error } = await supabase.rpc('set_event_announce_only', { p_meetup_id: id, p_on: on });
  return result(null, error);
}

// How many wait for a full event, and my place in line (null when I'm not waiting). `version` reloads it (e.g. the
// member count, since someone leaving moves the line).
export function useEventWaitlist(id: string, enabled: boolean, version: number) {
  const [state, setState] = useState<{ waiting: number; myPosition: number | null }>({ waiting: 0, myPosition: null });
  const load = useCallback(() => {
    supabase.rpc('event_waitlist', { p_meetup_id: id }).then(({ data, error }) => {
      if (error) {
        console.warn('Loading the waiting list failed', error.message);
        return;
      }
      const row = (data as { waiting: number; my_position: number | null }[] | null)?.[0];
      setState({ waiting: row?.waiting ?? 0, myPosition: row?.my_position ?? null });
    });
  }, [id]);

  useEffect(() => {
    if (!enabled) return;
    load();
    const channel = supabase
      .channel(uniqueChannelName(`waitlist-${id}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetup_waitlist', filter: `meetup_id=eq.${id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, id, load, version]);

  return { ...state, reload: load };
}

// "Free", or "฿500 · US$15".
export function eventPriceLabel(
  event: { entry_fee_thb: number | string | null; entry_fee_usd: number | string | null },
  language: 'en' | 'th',
  freeLabel: string,
): string {
  const thb = event.entry_fee_thb === null ? null : Number(event.entry_fee_thb);
  const usd = event.entry_fee_usd === null ? null : Number(event.entry_fee_usd);
  if (thb === null && usd === null) return freeLabel;
  return [thb !== null ? formatMoney(thb, 'THB', language) : null, usd !== null ? formatMoney(usd, 'USD', language) : null]
    .filter(Boolean)
    .join(' · ');
}

export function isPaidEvent(event: { entry_fee_thb: number | string | null; entry_fee_usd: number | string | null }) {
  return event.entry_fee_thb !== null || event.entry_fee_usd !== null;
}

// A typed price ("1,200", "15.50") -> a number, or null when empty; NaN when it isn't a price.
export function parsePrice(text: string): number | null {
  const clean = text.replace(/[,\s฿$]/g, '');
  if (!clean) return null;
  return /^\d{1,7}(\.\d{1,2})?$/.test(clean) ? Number(clean) : NaN;
}

// ---------------------------------------------------------------------------
// Arrival times
// ---------------------------------------------------------------------------

export type ArrivalSlot = { day: BangkokDay; minutes: number; at: Date };

// Arrival times every half hour from the start (or from now, once it has started) until before the end.
export function arrivalSlots(startsAt: string, endsAt: string, zone: string, now = new Date()): ArrivalSlot[] {
  const step = 30 * 60_000;
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  const slots: ArrivalSlot[] = [];
  for (let at = start + Math.max(0, Math.ceil((now.getTime() - start) / step)) * step; at < end && slots.length < 400; at += step) {
    const date = new Date(at);
    slots.push({ day: bangkokDay(date, zone), minutes: bangkokMinutes(date, zone), at: date });
  }
  return slots;
}

// "Who's coming when": members with an arrival time, counted per hour (local time); plus how many gave none.
export function arrivalBuckets(arrivals: (string | null)[], zone: string) {
  const counts = new Map<string, { day: BangkokDay; hour: number; count: number }>();
  let unknown = 0;
  for (const iso of arrivals) {
    if (!iso) {
      unknown++;
      continue;
    }
    const date = new Date(iso);
    const day = bangkokDay(date, zone);
    const hour = Math.floor(bangkokMinutes(date, zone) / 60);
    const key = `${day}:${hour}`;
    const found = counts.get(key);
    if (found) found.count++;
    else counts.set(key, { day, hour, count: 1 });
  }
  const buckets = [...counts.values()].sort((a, b) => a.day - b.day || a.hour - b.hour);
  return { buckets, unknown };
}

// ---------------------------------------------------------------------------
// Google Maps links (free links, no Google API or key)
// ---------------------------------------------------------------------------

export function googleMapsPinUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function streetViewUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
}

const GOOGLE_HOST = /^(?:[a-z0-9-]+\.)*(?:google\.[a-z.]{2,6}|goo\.gl)$/i;

function validCoords(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0);
}

// The point (and place name, if any) in a Google Maps link, or plain "13.7563, 100.5018" text. Null if none.
export function parseMapsText(text: string): { lat: number; lng: number; name: string | null } | null {
  let decoded = text.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep it as typed.
  }
  const patterns = [
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/, // the place itself
    /[?&](?:q|query|ll|destination|center|viewpoint|daddr)=(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/,
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/, // where the map was looking
    /^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(decoded);
    if (match) {
      const lat = Number(match[1]);
      const lng = Number(match[2]);
      if (!validCoords(lat, lng)) continue;
      const place = /\/maps\/place\/([^/@?]+)/.exec(decoded)?.[1]?.replace(/\+/g, ' ').trim();
      return { lat, lng, name: place ? place.slice(0, 80) : null };
    }
  }
  return null;
}

// Reads a pasted Google Maps link. Short share links (maps.app.goo.gl/…) are opened first to see where they lead;
// only Google's own addresses are opened. Null if no point was found.
export async function resolveMapsLink(text: string): Promise<{ lat: number; lng: number; name: string | null } | null> {
  const direct = parseMapsText(text);
  if (direct) return direct;
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !GOOGLE_HOST.test(url.hostname)) return null;
  try {
    const response = await fetch(url.toString());
    const found = parseMapsText(response.url);
    if (found) return found;
    // Some redirects only carry the point in the page itself.
    const body = await response.text();
    return parseMapsText(/https:\/\/www\.google\.[a-z.]+\/maps\/[^"'\s]+/.exec(body)?.[0] ?? '');
  } catch (error) {
    console.warn('Opening the maps link failed', error);
    return null;
  }
}
