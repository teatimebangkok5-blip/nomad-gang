import type { TFunction } from 'i18next';

// Bangkok is UTC+7 all year (no daylight saving), so times are computed with plain arithmetic instead of relying
// on the phone's time zone or Intl time-zone support.
const OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

// A calendar day in Bangkok, counted in days since 1970-01-01.
export type BangkokDay = number;

export function bangkokDay(date: Date): BangkokDay {
  return Math.floor((date.getTime() + OFFSET_MS) / DAY_MS);
}

// Minutes since midnight, Bangkok time.
export function bangkokMinutes(date: Date): number {
  const local = new Date(date.getTime() + OFFSET_MS);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

// The real instant for a Bangkok day + minutes since midnight.
export function fromBangkok(day: BangkokDay, minutes: number): Date {
  return new Date(day * DAY_MS + minutes * 60 * 1000 - OFFSET_MS);
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

// "Today", "Tomorrow", or "Sat 18".
export function formatDayLabel(day: BangkokDay, t: TFunction, now = new Date()): string {
  const diff = day - bangkokDay(now);
  if (diff === 0) return t('tables.today');
  if (diff === 1) return t('tables.tomorrow');
  const date = new Date(day * DAY_MS);
  return `${t(`weekday.${WEEKDAYS[date.getUTCDay()]}`)} ${date.getUTCDate()}`;
}

// "Today 20:00", "Tomorrow 19:30", "Sat 18 21:00".
export function formatWhen(iso: string, t: TFunction, now = new Date()): string {
  const date = new Date(iso);
  return `${formatDayLabel(bangkokDay(date), t, now)} ${formatClock(bangkokMinutes(date))}`;
}

// "Today 18:00–21:00", or "Sat 18 22:00 – Sun 19 02:00" when it ends on another day.
export function formatWhenRange(startIso: string, endIso: string, t: TFunction, now = new Date()): string {
  const end = new Date(endIso);
  const sameDay = bangkokDay(new Date(startIso)) === bangkokDay(end);
  return sameDay
    ? `${formatWhen(startIso, t, now)}–${formatClock(bangkokMinutes(end))}`
    : `${formatWhen(startIso, t, now)} – ${formatWhen(endIso, t, now)}`;
}

// Half-hour start times (minutes since midnight) from 06:00 to 23:30 on a Bangkok day; for today, only times at
// least 15 minutes from now.
export function timeSlots(day: BangkokDay, now: Date): number[] {
  const earliest = day === bangkokDay(now) ? bangkokMinutes(now) + 15 : 0;
  const slots: number[] = [];
  for (let minutes = 6 * 60; minutes <= 23 * 60 + 30; minutes += 30) {
    if (minutes >= earliest) slots.push(minutes);
  }
  return slots;
}
