import type { PostgrestError } from '@supabase/supabase-js';
import type { TFunction } from 'i18next';
import { useCallback, useEffect, useState } from 'react';

import type { BangkokDay } from '@/lib/bangkok-time';
import {
  INTEREST_KINDS,
  metersBetween,
  type Candidate,
  type Coords,
  type FoodOption,
  type Interest,
  type Line,
  type PlanStop,
  type Station,
  type TransitNetwork,
  type TravelMode,
} from '@/lib/planner';
import type { PlaceEntry } from '@/lib/places';
import { supabase } from '@/lib/supabase';
import { isHangoutVenue, type Venue } from '@/lib/venues';

// Data for "Plan my day" and saved day plans (supabase/migrations/*_day_planner.sql).

const RADIUS_M: Record<TravelMode, number> = { walk: 3000, taxi: 10000, transit: 12000 };

type CandidateRow = Omit<Candidate, 'source'>;

// Hangout places and partner hangout venues of the chosen interests around the start.
export async function loadCandidates(
  start: Coords,
  modes: TravelMode[],
  interests: Interest[],
  // Entry kinds to keep (e.g. only free places); null = any place.
  entries: PlaceEntry[] | null,
  venues: Venue[],
): Promise<Candidate[] | null> {
  const radius = Math.max(...modes.map((mode) => RADIUS_M[mode]));
  const kinds = interests.flatMap((interest) => INTEREST_KINDS[interest]);
  const { data, error } = await supabase.rpc('plan_candidates', {
    p_lat: start.lat,
    p_lng: start.lng,
    p_radius_m: radius,
    p_kinds: kinds,
    p_entry: entries,
  });
  if (error) {
    console.warn('Loading plan places failed', error.message);
    return null;
  }
  const places = (data as CandidateRow[]).map((row) => ({ ...row, source: 'place' as const }));
  const partner = venues
    .filter((venue) => isHangoutVenue(venue) && metersBetween(start, venue) <= radius)
    .filter((venue) => !entries || (venue.entry !== null && entries.includes(venue.entry)))
    .map(
      (venue): Candidate => ({
        id: venue.id,
        source: 'venue',
        name: venue.name_en,
        name_en: venue.name_en,
        name_th: venue.name_th,
        kind: venueKind(venue.category),
        lat: venue.lat,
        lng: venue.lng,
        prominence: 12,
        entry: venue.entry,
        website: venue.ticket_url,
        description_en: null,
        description_th: null,
        image_url: venue.photo_path ? venuePhoto(venue.photo_path) : null,
        image_credit: null,
        opening_hours: null,
      }),
    );
  return [...partner, ...places];
}

function venueKind(category: Venue['category']): string {
  return category === 'entertainment' ? 'amusement_arcade' : category;
}

function venuePhoto(path: string): string {
  return supabase.storage.from('venue-photos').getPublicUrl(path).data.publicUrl;
}

type FoodRow = { id: string; name: string; name_en: string | null; name_th: string | null; kind: string; lat: number; lng: number };

// Meals: a partner food venue within 800 m first, else the nearest restaurants / food courts. Nightlife: bars.
export function makeFoodNear(venues: Venue[]) {
  return async (at: Coords, type: 'meal' | 'nightlife'): Promise<FoodOption[]> => {
    const partner = venues
      .filter((venue) => !isHangoutVenue(venue))
      .filter((venue) => (type === 'nightlife' ? venue.category === 'bar' || venue.category === 'rooftop' : venue.category !== 'bar'))
      .map((venue) => ({ venue, meters: metersBetween(at, venue) }))
      .filter(({ meters }) => meters <= 800)
      .sort((a, b) => a.meters - b.meters)
      .map(
        ({ venue }): FoodOption => ({
          id: venue.id,
          source: 'venue',
          name: venue.name_en,
          name_en: venue.name_en,
          name_th: venue.name_th,
          kind: venue.category,
          lat: venue.lat,
          lng: venue.lng,
          image_url: venue.photo_path ? venuePhoto(venue.photo_path) : null,
        }),
      );
    const { data, error } = await supabase.rpc('plan_food_near', {
      p_lat: at.lat,
      p_lng: at.lng,
      p_kinds: type === 'nightlife' ? ['bar', 'pub', 'biergarten'] : ['restaurant', 'food_court'],
      p_limit: 8,
    });
    if (error) console.warn('Loading food places failed', error.message);
    const places = ((data ?? []) as FoodRow[]).map((row): FoodOption => ({ ...row, source: 'place', image_url: null }));
    return [...partner, ...places];
  };
}

// The BTS / MRT network, loaded once per app run.
let networkCache: Promise<TransitNetwork | null> | null = null;

export function loadTransitNetwork(): Promise<TransitNetwork | null> {
  networkCache ??= Promise.all([
    supabase.from('transit_stations').select('id, name, name_en, name_th, lat, lng'),
    supabase.from('transit_lines').select('id, network, name_en, name_th, station_ids'),
  ]).then(([stations, lines]) => {
    if (stations.error || lines.error || !stations.data?.length) {
      networkCache = null;
      return null;
    }
    return {
      stations: new Map((stations.data as Station[]).map((s) => [s.id, s])),
      lines: lines.data as Line[],
    };
  });
  return networkCache;
}

// ---------------------------------------------------------------------------
// Saved plans
// ---------------------------------------------------------------------------

export type DayPlan = {
  id: string;
  owner_id: string;
  title: string;
  day: string; // YYYY-MM-DD (Bangkok)
  start_minutes: number;
  end_minutes: number;
  travel_modes: TravelMode[];
  stops: PlanStop[];
  meetup_id: string | null;
  created_at: string;
};

export type PlanErrorKey = 'not_found' | 'already_hangout' | 'generic' | string;

function errorKey(error: PostgrestError | null): PlanErrorKey | null {
  if (!error) return null;
  console.warn('Plan request failed', error.message);
  const known = ['not_found', 'already_hangout', 'not_allowed', 'invalid_size', 'invalid_time', 'too_many_open', 'invalid_duration', 'outside_bangkok', 'venue_unavailable'];
  return known.find((key) => error.message.includes(key)) ?? 'generic';
}

export async function savePlan(plan: Omit<DayPlan, 'id' | 'meetup_id' | 'created_at'>): Promise<{ id: string | null; error: PlanErrorKey | null }> {
  const { data, error } = await supabase.from('day_plans').insert(plan).select('id').single();
  return { id: (data as { id: string } | null)?.id ?? null, error: errorKey(error) };
}

export async function deletePlan(id: string): Promise<boolean> {
  const { error } = await supabase.from('day_plans').delete().eq('id', id);
  return !error;
}

// A plan's `day` column (YYYY-MM-DD) <-> a Bangkok day number.
export function isoDate(day: BangkokDay): string {
  return new Date(day * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function planDay(iso: string): BangkokDay {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / (24 * 60 * 60 * 1000));
}

// The message for a failed "Make it a day hangout": the plan's own errors, else create_hangout's.
export function planHangoutError(error: PlanErrorKey | null, t: TFunction): string {
  if (error === 'already_hangout' || error === 'not_found') return t(`plan.errors.${error}`);
  return t(`hangouts.errors.${(error ?? 'generic') as 'generic'}`);
}

export async function makePlanHangout(planId: string, maxPeople: number): Promise<{ meetupId: string | null; error: PlanErrorKey | null }> {
  const { data, error } = await supabase.rpc('create_plan_hangout', { p_plan_id: planId, p_max_people: maxPeople });
  return { meetupId: (data as string | null) ?? null, error: errorKey(error) };
}

const PLAN_COLUMNS = 'id, owner_id, title, day, start_minutes, end_minutes, travel_modes, stops, meetup_id, created_at';

export function useMyPlans(myId: string | undefined) {
  const [plans, setPlans] = useState<DayPlan[] | null>(null);
  const load = useCallback(() => {
    if (!myId) return;
    supabase
      .from('day_plans')
      .select(PLAN_COLUMNS)
      .eq('owner_id', myId)
      .order('day', { ascending: false })
      .limit(30)
      .then(({ data }) => setPlans((data ?? []) as DayPlan[]));
  }, [myId]);
  useEffect(() => {
    load();
  }, [load]);
  return { plans, reload: load };
}

export function usePlan(id: string) {
  const [plan, setPlan] = useState<DayPlan | null | 'missing'>(null);
  useEffect(() => {
    supabase
      .from('day_plans')
      .select(PLAN_COLUMNS)
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => setPlan((data as DayPlan | null) ?? 'missing'));
  }, [id]);
  return plan;
}

// The day plans behind these hangouts (those made from a plan), by hangout id.
export function usePlansForMeetups(meetupIds: string[]) {
  const [plans, setPlans] = useState<Map<string, DayPlan>>(() => new Map());
  const key = [...meetupIds].sort().join(',');
  useEffect(() => {
    if (!key) return;
    supabase
      .from('day_plans')
      .select(PLAN_COLUMNS)
      .in('meetup_id', key.split(','))
      .then(({ data }) => setPlans(new Map(((data ?? []) as DayPlan[]).map((plan) => [plan.meetup_id as string, plan]))));
  }, [key]);
  return plans;
}

// The day plan behind a day hangout, if it came from one.
export function usePlanForMeetup(meetupId: string) {
  const [plan, setPlan] = useState<DayPlan | null>(null);
  useEffect(() => {
    supabase
      .from('day_plans')
      .select(PLAN_COLUMNS)
      .eq('meetup_id', meetupId)
      .maybeSingle()
      .then(({ data }) => setPlan((data as DayPlan | null) ?? null));
  }, [meetupId]);
  return plan;
}

