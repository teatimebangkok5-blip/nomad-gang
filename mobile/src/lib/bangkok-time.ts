import tzLookup from '@photostructure/tz-lookup';
import type { TFunction } from 'i18next';

// Day / time maths for meetups. Tables are in Bangkok, which is UTC+7 all year (no daylight saving), so Bangkok
// times use plain arithmetic. Hangouts can be anywhere in the world: those functions take the meetup's IANA time
// zone (`zone`, default Bangkok) and read its UTC offset from Intl, so times always show in local time at the place.
const BANGKOK = 'Asia/Bangkok';
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;

// A calendar day (in Bangkok, or in the given zone), counted in days since 1970-01-01.
export type BangkokDay = number;

const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(zone: string): Intl.DateTimeFormat | null {
  if (!formatters.has(zone)) {
    let formatter: Intl.DateTimeFormat | null = null;
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      });
    } catch {
      formatter = null; // unknown zone
    }
    formatters.set(zone, formatter);
  }
  return formatters.get(zone) ?? null;
}

// How far the zone's clock is ahead of UTC at that moment, in ms. Falls back to the phone's own offset if the zone
// isn't known.
export function zoneOffsetMs(zone: string, date: Date): number {
  if (zone === BANGKOK) return BANGKOK_OFFSET_MS;
  const formatter = formatterFor(zone);
  if (!formatter) return -date.getTimezoneOffset() * 60 * 1000;
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// The time zone at a point on the map (offline lookup). Bangkok for anything inside the Bangkok box.
export function zoneAt(lat: number, lng: number): string {
  if (lat >= 13.45 && lat <= 14.1 && lng >= 100.25 && lng <= 100.95) return BANGKOK;
  try {
    return tzLookup(lat, lng);
  } catch {
    return deviceZone();
  }
}

// The phone's own time zone (for chat times and comparing with a meetup's zone).
export function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || BANGKOK;
  } catch {
    return BANGKOK;
  }
}

// "UTC+7", "UTC-3:30", for showing which local time a hangout uses.
export function formatUtcOffset(zone: string, date = new Date()): string {
  const minutes = Math.round(zoneOffsetMs(zone, date) / 60000);
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const mins = abs % 60;
  return `UTC${sign}${Math.floor(abs / 60)}${mins ? `:${String(mins).padStart(2, '0')}` : ''}`;
}

// True when two zones show the same clock time now (e.g. the phone's zone and a hangout's).
export function sameClock(a: string, b: string, date = new Date()): boolean {
  return zoneOffsetMs(a, date) === zoneOffsetMs(b, date);
}

export function bangkokDay(date: Date, zone = BANGKOK): BangkokDay {
  return Math.floor((date.getTime() + zoneOffsetMs(zone, date)) / DAY_MS);
}

// Minutes since midnight (Bangkok time, or in the given zone).
export function bangkokMinutes(date: Date, zone = BANGKOK): number {
  const local = new Date(date.getTime() + zoneOffsetMs(zone, date));
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

// The real instant for a day + minutes since midnight (Bangkok, or in the given zone; daylight saving included).
export function fromBangkok(day: BangkokDay, minutes: number, zone = BANGKOK): Date {
  const wall = day * DAY_MS + minutes * 60 * 1000;
  let instant = wall - zoneOffsetMs(zone, new Date(wall));
  // Near a daylight-saving change the offset at the guess can differ; one more pass settles it.
  instant = wall - zoneOffsetMs(zone, new Date(instant));
  return new Date(instant);
}

// "09:30". `allowMidnightEnd` shows 24:00 as "24:00" (the end of a day) instead of "00:00".
export function formatClock(minutes: number, allowMidnightEnd = false): string {
  if (allowMidnightEnd && minutes === 24 * 60) return '24:00';
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// A typed time -> minutes since midnight, or null. Takes "9", "09", "930", "0930", "9:30", "9.30", "21 00" and
// "24:00" (the end of a day).
export function parseClock(text: string): number | null {
  const match = text.trim().match(/^(\d{1,2})(?:[:.\s]?(\d{2}))?$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = match[2] ? Number(match[2]) : 0;
  if (m > 59 || h > 24 || (h === 24 && m > 0)) return null;
  return h * 60 + m;
}

// "Today", "Tomorrow", or "Sat 18" ("today" in the given zone).
export function formatDayLabel(day: BangkokDay, t: TFunction, now = new Date(), zone = BANGKOK): string {
  const diff = day - bangkokDay(now, zone);
  if (diff === 0) return t('tables.today');
  if (diff === 1) return t('tables.tomorrow');
  const date = new Date(day * DAY_MS);
  const label = `${t(`weekday.${WEEKDAYS[date.getUTCDay()]}`)} ${date.getUTCDate()}`;
  // Meetup day chips reach 13 days ahead and stay short; further away (deal end dates, past events, old messages)
  // "Wed 18" alone is ambiguous, so add the month: "Wed 18 Nov".
  return diff < -6 || diff > 13 ? `${label} ${t(`month.${MONTHS[date.getUTCMonth()]}`)}` : label;
}

// "Today 20:00", "Tomorrow 19:30", "Sat 18 21:00".
export function formatWhen(iso: string, t: TFunction, now = new Date(), zone = BANGKOK): string {
  const date = new Date(iso);
  return `${formatDayLabel(bangkokDay(date, zone), t, now, zone)} ${formatClock(bangkokMinutes(date, zone))}`;
}

// "Today 18:00–21:00", or "Sat 18 22:00 – Sun 19 02:00" when it ends on another day.
export function formatWhenRange(startIso: string, endIso: string, t: TFunction, now = new Date(), zone = BANGKOK): string {
  const end = new Date(endIso);
  const sameDay = bangkokDay(new Date(startIso), zone) === bangkokDay(end, zone);
  return sameDay
    ? `${formatWhen(startIso, t, now, zone)}–${formatClock(bangkokMinutes(end, zone))}`
    : `${formatWhen(startIso, t, now, zone)} – ${formatWhen(endIso, t, now, zone)}`;
}

// Half-hour start times (minutes since midnight) from 06:00 to 23:30 on a day; for today, only times at least 15
// minutes from now.
export function timeSlots(day: BangkokDay, now: Date, zone = BANGKOK): number[] {
  const earliest = day === bangkokDay(now, zone) ? bangkokMinutes(now, zone) + 15 : 0;
  const slots: number[] = [];
  for (let minutes = 6 * 60; minutes <= 23 * 60 + 30; minutes += 30) {
    if (minutes >= earliest) slots.push(minutes);
  }
  return slots;
}
