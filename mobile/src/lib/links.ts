import { Linking } from 'react-native';

// Ticket pages and official websites open in the phone's browser. Only https links, the same rule as the database.
export function isSafeLink(url: string | null | undefined): url is string {
  return Boolean(url && /^https:\/\/\S+$/i.test(url));
}

export function openLink(url: string | null | undefined) {
  if (isSafeLink(url)) Linking.openURL(url);
}

// The official ticket page for a venue: an event's or ticket discount's own link first, then the venue's.
export function ticketLink(venue: {
  ticket_url: string | null;
  promotions: { ticket_url: string | null }[];
}): string | null {
  const fromPromotion = venue.promotions.find((promotion) => isSafeLink(promotion.ticket_url))?.ticket_url;
  return fromPromotion ?? (isSafeLink(venue.ticket_url) ? venue.ticket_url : null);
}
