import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

// Host rewards (supabase/migrations/*_travel_deals.sql): when a table or hangout ends (not cancelled) with at least
// 4 people, its host unlocks travel deals for that city: coupons the founder added in the admin panel (city first,
// then country, then everywhere; up to 8), plus "Find deals in {city}" buttons to official deal pages.

export type TravelDealCategory = 'activity' | 'hotel' | 'flight' | 'cruise' | 'other';

export type TravelDeal = {
  id: string;
  brand: string;
  category: TravelDealCategory;
  title_en: string;
  title_th: string;
  details_en: string;
  details_th: string;
  code: string | null;
  url: string | null;
  ends_at: string | null;
  scope: 'city' | 'country' | 'world';
};

export type Reward = {
  meetup_id: string;
  meetup_kind: 'table' | 'hangout';
  title: string;
  place_name: string | null;
  place_name_en: string | null;
  place_name_th: string | null;
  venue_name_en: string | null;
  venue_name_th: string | null;
  city: string | null;
  country_code: string | null;
  lat: number | null;
  lng: number | null;
  ended_at: string;
  member_count: number;
  deals: TravelDeal[];
};

// The host gets travel deals once 4 or more people were in it.
export const REWARD_MIN_PEOPLE = 4;

export function useRewards(enabled = true) {
  const [rewards, setRewards] = useState<Reward[] | null>(null);
  const load = useCallback(() => {
    supabase.rpc('my_rewards').then(({ data, error }) => {
      if (error) console.warn('Loading rewards failed', error.message);
      setRewards(error ? [] : ((data ?? []) as Reward[]));
    });
  }, []);
  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);
  return { rewards, reload: load };
}

// "Didn't work?" Hidden for me at once, and for everyone after 3 reports.
export async function reportTravelDeal(dealId: string): Promise<boolean> {
  const { error } = await supabase.rpc('report_travel_deal', { p_deal_id: dealId });
  if (error) console.warn('Reporting deal failed', error.message);
  return !error;
}

// Official deal and search pages for a city (no accounts or affiliate programs needed). Swap in affiliate links
// later.
export type CityDealLink = { key: string; category: Exclude<TravelDealCategory, 'other'>; brand: string; url: string };

export function cityDealLinks(city: string): CityDealLink[] {
  const q = encodeURIComponent(city);
  return [
    { key: 'klook', category: 'activity', brand: 'Klook', url: `https://www.klook.com/search/?query=${q}` },
    { key: 'gyg', category: 'activity', brand: 'GetYourGuide', url: `https://www.getyourguide.com/s/?q=${q}` },
    { key: 'agoda', category: 'hotel', brand: 'Agoda', url: `https://www.agoda.com/search?textToSearch=${q}` },
    { key: 'booking', category: 'hotel', brand: 'Booking.com', url: `https://www.booking.com/searchresults.html?ss=${q}` },
    {
      key: 'flights',
      category: 'flight',
      brand: 'Google Flights',
      url: `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${city}`)}`,
    },
    {
      key: 'cruise-klook',
      category: 'cruise',
      brand: 'Klook',
      url: `https://www.klook.com/search/?query=${encodeURIComponent(`${city} cruise`)}`,
    },
    {
      key: 'cruise-gyg',
      category: 'cruise',
      brand: 'GetYourGuide',
      url: `https://www.getyourguide.com/s/?q=${encodeURIComponent(`${city} boat tour`)}`,
    },
  ];
}

// The city and country at a point, from OpenStreetMap (Photon reverse search; free, no key). Null if not found.
export async function areaAt(lat: number, lng: number): Promise<{ city: string | null; countryCode: string | null } | null> {
  try {
    const response = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=en&limit=1`);
    if (!response.ok) return null;
    const body = (await response.json()) as {
      features?: { properties: { city?: string; town?: string; village?: string; county?: string; state?: string; countrycode?: string } }[];
    };
    const p = body.features?.[0]?.properties;
    if (!p) return null;
    return { city: p.city ?? p.town ?? p.village ?? p.county ?? p.state ?? null, countryCode: p.countrycode ?? null };
  } catch {
    return null;
  }
}

// Saves where a new hangout outside Bangkok is (host only, once), so its host reward finds that city's deals.
export async function setMeetupArea(meetupId: string, area: { city: string | null; countryCode: string | null }) {
  const { error } = await supabase.rpc('set_meetup_area', {
    p_meetup_id: meetupId,
    p_city: area.city,
    p_country_code: area.countryCode,
  });
  if (error) console.warn('Saving the hangout area failed', error.message);
}
