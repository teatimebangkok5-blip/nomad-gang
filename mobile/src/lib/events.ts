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

// Links to Google's own addresses (React Native's URL can't read hostnames, so this checks the text).
const GOOGLE_LINK = /^https:\/\/(?:[a-z0-9-]+\.)*(?:google\.[a-z.]{2,6}|goo\.gl)(?:[/?#]|$)/i;
// A Google Maps short share link (it has to be opened to see where it leads).
const SHORT_LINK = /^https:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\/[A-Za-z0-9_-]{4,64}/i;
const LINK_IN_TEXT = /https?:\/\/[^\s<>"']+/i;

type MapsPoint = { lat: number; lng: number; name: string | null };

function validCoords(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0);
}

// The point (and place name, if any) in a Google Maps link or page, or plain "13.7563, 100.5018" text. Null if none.
export function parseMapsText(text: string): MapsPoint | null {
  let decoded = text.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep it as typed.
  }
  const patterns = [
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/, // the place itself
    /[?&;](?:q|query|ll|destination|center|viewpoint|daddr)=(-?\d{1,2}\.\d+)(?:\s*,\s*|%2C)(-?\d{1,3}\.\d+)/i,
    /center=(-?\d{1,2}\.\d+)(?:,|%2C)(-?\d{1,3}\.\d+)/i, // the page's map picture
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/, // where the map was looking
    /\[null,null,(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)\]/,
    /^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(decoded);
    if (match) {
      const lat = Number(match[1]);
      const lng = Number(match[2]);
      if (!validCoords(lat, lng)) continue;
      const place = /\/maps\/place\/([^/@?"]+)/.exec(decoded)?.[1]?.replace(/\+/g, ' ').trim();
      return { lat, lng, name: place ? place.slice(0, 80) : null };
    }
  }
  return null;
}

// What a Google Maps address searches for ("?q=Lumphini Park, Bangkok", "/maps/place/Wat+Arun"), if anything.
function searchTextIn(url: string): string | null {
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // Keep it.
  }
  const found = /[?&](?:q|query)=([^&#]+)/.exec(decoded)?.[1] ?? /\/maps\/place\/([^/@?#]+)/.exec(decoded)?.[1];
  const text = found?.replace(/\+/g, ' ').trim();
  return text && !/^-?\d/.test(text) ? text : null;
}

// Opens the link on the phone (6 seconds at most). The final address, and the point if it or the page has one.
async function openHere(url: string): Promise<{ found: MapsPoint | null; finalUrl: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const finalUrl = response.url || url;
    // Only read pages from Google.
    if (!GOOGLE_LINK.test(finalUrl)) return { found: null, finalUrl: null };
    const fromUrl = parseMapsText(finalUrl);
    if (fromUrl) return { found: fromUrl, finalUrl };
    const body = await response.text();
    const fromPage = parseMapsText(body.slice(0, 2_000_000));
    const name = /<meta content="([^"]{1,200})" (?:itemprop="name"|property="og:title")/.exec(body)?.[1]?.split(' · ')[0]?.trim();
    return { found: fromPage ? { ...fromPage, name: fromPage.name ?? name ?? null } : null, finalUrl };
  } catch (error) {
    console.warn('Opening the maps link on the phone failed', error);
    return { found: null, finalUrl: null };
  } finally {
    clearTimeout(timer);
  }
}

// The first place Photon (free OpenStreetMap search) finds for a name or address, near `near` if given.
async function searchPlace(query: string, near: { lat: number; lng: number } | null): Promise<MapsPoint | null> {
  const params = new URLSearchParams({ q: query.slice(0, 200), limit: '1' });
  if (near) {
    params.set('lat', near.lat.toFixed(3));
    params.set('lon', near.lng.toFixed(3));
  }
  try {
    const response = await fetch(`https://photon.komoot.io/api/?${params}`);
    if (!response.ok) return null;
    const body = (await response.json()) as {
      features?: { geometry?: { coordinates?: [number, number] }; properties?: { name?: string } }[];
    };
    const feature = body.features?.[0];
    const [lng, lat] = feature?.geometry?.coordinates ?? [NaN, NaN];
    return validCoords(lat, lng) ? { lat, lng, name: feature?.properties?.name ?? query.slice(0, 80) } : null;
  } catch (error) {
    console.warn('Searching the place failed', error);
    return null;
  }
}

// Reads what was pasted from Google Maps: a link, the share text around it ("Lumphini Park\nRama IV Rd…\nhttps://…"),
// or coordinates. In order: a point in the text itself; open a Google link on the phone; ask our server to open a
// short link (some networks can't reach maps.app.goo.gl); search the place's name / address. Null if nothing worked.
export async function resolveMapsLink(text: string, near: { lat: number; lng: number } | null = null): Promise<MapsPoint | null> {
  const direct = parseMapsText(text);
  if (direct) return direct;
  const link = LINK_IN_TEXT.exec(text)?.[0]?.replace(/[).,]+$/, '') ?? null;
  // The words around the link: Google's share text starts with the place's name, then its address.
  const lines = text
    .replace(LINK_IN_TEXT, '\n')
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let searchText: string | null = lines.length ? lines.join(', ') : null;

  if (link && GOOGLE_LINK.test(link)) {
    const here = await openHere(link);
    if (here.found) return { ...here.found, name: here.found.name ?? lines[0] ?? null };
    searchText = searchText ?? (here.finalUrl ? searchTextIn(here.finalUrl) : searchTextIn(link));
    if (SHORT_LINK.test(link)) {
      const { data, error } = await supabase.rpc('resolve_maps_link', { p_url: link });
      if (error) console.warn('Server lookup of the maps link failed', error.message);
      const row = (data as MapsPoint[] | null)?.[0];
      if (row && validCoords(row.lat, row.lng)) return { lat: row.lat, lng: row.lng, name: row.name ?? lines[0] ?? null };
    }
  } else if (link) {
    // Not a Google link: nothing to open.
    return null;
  }

  if (!searchText) return null;
  // The name alone first (most precise), then name + address.
  const byName = lines[0] ? await searchPlace(lines[0], near) : null;
  return byName ?? (lines.length > 1 || !lines[0] ? await searchPlace(searchText, near) : null);
}
