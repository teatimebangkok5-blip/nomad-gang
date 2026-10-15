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

export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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
