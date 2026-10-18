import type { TFunction } from 'i18next';

import { bangkokDay, bangkokMinutes } from '@/lib/bangkok-time';
import type { OpenMeetup } from '@/lib/meetups';
import type { Venue } from '@/lib/venues';

// Home feed: filters, status and the "3 going for dinner near Asok" line on each card. Everything comes from real
// open tables / hangouts (member counts from the database); areas are the public place's neighbourhood.

export const FEED_FILTERS = ['all', 'today', 'tonight', 'food', 'drinks', 'explore', 'budget'] as const;
export type FeedFilter = (typeof FEED_FILTERS)[number];

// OpenStreetMap kinds and venue categories that count as "Drinks" rather than "Food".
const DRINK_PLACE_KINDS = new Set(['bar', 'pub', 'biergarten', 'nightclub']);
const DRINK_VENUE_CATEGORIES = new Set(['bar', 'rooftop']);
const TONIGHT_FROM = 17 * 60;

function isDrinks(meetup: OpenMeetup, venue: Venue | undefined): boolean {
  if (meetup.kind !== 'table') return false;
  return venue ? DRINK_VENUE_CATEGORIES.has(venue.category) : DRINK_PLACE_KINDS.has(meetup.place_kind ?? '');
}

export function matchesFilter(meetup: OpenMeetup, filter: FeedFilter, venue: Venue | undefined, now: Date): boolean {
  const start = new Date(meetup.starts_at);
  const zone = meetup.time_zone;
  const today = bangkokDay(start, zone) === bangkokDay(now, zone);
  const live = start <= now && now < new Date(meetup.ends_at);
  switch (filter) {
    case 'all':
      return true;
    case 'today':
      return today || live;
    case 'tonight':
      return (today && bangkokMinutes(start, zone) >= TONIGHT_FROM) || (live && bangkokMinutes(now, zone) >= TONIGHT_FROM);
    case 'food':
      return meetup.kind === 'table' && !isDrinks(meetup, venue);
    case 'drinks':
      return isDrinks(meetup, venue);
    case 'explore':
      return meetup.kind === 'hangout';
    case 'budget':
      return typeof meetup.cost_level === 'number' && meetup.cost_level <= 1;
  }
}

export type MeetupStatus =
  | { type: 'live' }
  | { type: 'soon'; minutes: number }
  | { type: 'full' }
  | { type: 'seats'; count: number }
  | null;

// What to show first on a card: happening now, starting within the hour, full, or few seats left.
export function meetupStatus(meetup: Pick<OpenMeetup, 'starts_at' | 'max_people' | 'member_count'>, now: Date): MeetupStatus {
  const start = new Date(meetup.starts_at).getTime();
  const seats = meetup.max_people - meetup.member_count;
  if (seats <= 0) return { type: 'full' };
  if (start <= now.getTime()) return { type: 'live' };
  const minutes = Math.ceil((start - now.getTime()) / 60_000);
  if (minutes <= 60) return { type: 'soon', minutes };
  if (seats <= 2) return { type: 'seats', count: seats };
  return null;
}

export function statusLabel(status: MeetupStatus, t: TFunction): string | null {
  if (!status) return null;
  if (status.type === 'live') return t('feed.status.live');
  if (status.type === 'soon') return t('feed.status.soon', { minutes: status.minutes });
  if (status.type === 'full') return t('feed.status.full');
  return t('feed.seatsLeft', { count: status.count });
}

export function areaName(meetup: OpenMeetup, language: 'en' | 'th'): string | null {
  return (language === 'th' ? meetup.area_name_th : meetup.area_name_en) || meetup.area_name;
}

function meal(meetup: OpenMeetup, venue: Venue | undefined): 'breakfast' | 'lunch' | 'coffee' | 'dinner' | 'drinks' {
  if (isDrinks(meetup, venue)) return 'drinks';
  const minutes = bangkokMinutes(new Date(meetup.starts_at), meetup.time_zone);
  if (minutes < 11 * 60) return 'breakfast';
  if (minutes < 15 * 60) return 'lunch';
  if (minutes < 17 * 60) return 'coffee';
  return 'dinner';
}

// "3 going for dinner near Asok" / "5 going · near Ari".
export function pulseLine(meetup: OpenMeetup, venue: Venue | undefined, t: TFunction, language: 'en' | 'th'): string {
  const area = areaName(meetup, language);
  const count = meetup.member_count;
  if (meetup.kind === 'table') {
    const what = t(`feed.meals.${meal(meetup, venue)}`);
    return area ? t('feed.pulse.tableNear', { count, meal: what, area }) : t('feed.pulse.table', { count, meal: what });
  }
  return area ? t('feed.pulse.hangoutNear', { count, area }) : t('feed.pulse.hangout', { count });
}
