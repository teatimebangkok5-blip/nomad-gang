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

// A sample reward (My rewards → "See an example"), so people can see what hosting 4+ people unlocks. Clearly marked
// as an example in the app; its codes aren't real and "Didn't work?" does nothing.
export const EXAMPLE_REWARD: Reward = {
  meetup_id: 'example',
  meetup_kind: 'hangout',
  title: 'Sunset walk at Lumphini Park',
  place_name: 'Lumphini Park',
  place_name_en: 'Lumphini Park',
  place_name_th: 'สวนลุมพินี',
  venue_name_en: null,
  venue_name_th: null,
  city: 'Bangkok',
  country_code: 'TH',
  lat: 13.7314,
  lng: 100.5414,
  ended_at: new Date().toISOString(),
  member_count: 5,
  deals: [
    {
      id: 'example-1',
      brand: 'Klook',
      category: 'cruise',
      title_en: '10% off Chao Phraya dinner cruises',
      title_th: 'ลด 10% ล่องเรือดินเนอร์เจ้าพระยา',
      details_en: 'Example coupon: book any dinner cruise in Bangkok.',
      details_th: 'ตัวอย่างคูปอง: จองล่องเรือดินเนอร์ในกรุงเทพฯ',
      code: 'EXAMPLE10',
      url: 'https://www.klook.com/search/?query=Bangkok%20dinner%20cruise',
      ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      scope: 'city',
    },
    {
      id: 'example-2',
      brand: 'Agoda',
      category: 'hotel',
      title_en: 'Up to 15% off hotels in Thailand',
      title_th: 'ลดสูงสุด 15% โรงแรมทั่วไทย',
      details_en: 'Example deal: opens the official deals page.',
      details_th: 'ตัวอย่างดีล: เปิดหน้าดีลอย่างเป็นทางการ',
      code: null,
      url: 'https://www.agoda.com/search?textToSearch=Bangkok',
      ends_at: null,
      scope: 'country',
    },
    {
      id: 'example-3',
      brand: 'Trip.com',
      category: 'flight',
      title_en: '฿200 off your next flight',
      title_th: 'ลด ฿200 เที่ยวบินถัดไป',
      details_en: 'Example coupon for any city.',
      details_th: 'ตัวอย่างคูปองใช้ได้ทุกเมือง',
      code: 'TRIPEXAMPLE',
      url: null,
      ends_at: null,
      scope: 'world',
    },
  ],
};
