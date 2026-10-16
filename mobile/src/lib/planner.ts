import type { PlaceEntry } from '@/lib/places';

// Rule-based day planner ("Plan my day"). Pure functions: the screen fetches candidate places, food places, partner
// venues and the rail network, and this builds the day. No AI, no paid services.

export type TravelMode = 'walk' | 'taxi' | 'transit';

export type Interest = 'temples' | 'markets' | 'shopping' | 'museums' | 'parks' | 'sights' | 'fun';

export const INTERESTS: Interest[] = ['temples', 'sights', 'markets', 'shopping', 'museums', 'parks', 'fun'];

export const INTEREST_KINDS: Record<Interest, string[]> = {
  temples: ['temple'],
  sights: ['attraction', 'viewpoint', 'monument', 'castle', 'fort', 'palace'],
  markets: ['market'],
  shopping: ['mall'],
  museums: ['museum', 'gallery', 'arts_centre'],
  parks: ['park', 'garden', 'nature_reserve'],
  fun: ['zoo', 'aquarium', 'theme_park', 'water_park', 'amusement_arcade', 'escape_game', 'ice_rink', 'miniature_golf', 'cinema', 'theatre'],
};

// Minutes to spend at each kind of place.
const VISIT_MINUTES: Record<string, number> = {
  temple: 50, market: 75, mall: 90, museum: 90, gallery: 45, arts_centre: 45, park: 60, garden: 45,
  nature_reserve: 90, attraction: 60, viewpoint: 30, monument: 15, castle: 75, palace: 75, fort: 20, zoo: 150,
  aquarium: 90, theme_park: 240, water_park: 180, amusement_arcade: 60, escape_game: 75, ice_rink: 60,
  miniature_golf: 60, cinema: 150, theatre: 120,
};

export type Coords = { lat: number; lng: number };

export type Candidate = Coords & {
  id: string;
  source: 'place' | 'venue';
  name: string;
  name_en: string | null;
  name_th: string | null;
  kind: string;
  prominence: number;
  entry: PlaceEntry | null;
  website: string | null;
  description_en: string | null;
  description_th: string | null;
  image_url: string | null;
  image_credit: string | null;
  opening_hours: string | null;
};

export type FoodOption = Coords & {
  id: string;
  source: 'place' | 'venue';
  name: string;
  name_en: string | null;
  name_th: string | null;
  kind: string;
  image_url: string | null;
};

export type Station = Coords & { id: string; name: string; name_en: string | null; name_th: string | null };
export type Line = { id: string; network: string; name_en: string; name_th: string | null; station_ids: string[] };
export type TransitNetwork = { stations: Map<string, Station>; lines: Line[] };

export type Leg = {
  mode: TravelMode;
  minutes: number;
  meters: number;
  // By train: where to get on / change / get off, and the lines.
  board?: string;
  change?: string;
  alight?: string;
  lines?: string[];
};

export type PlanStop = Coords & {
  key: string;
  type: 'sight' | 'meal' | 'nightlife';
  place_id: string | null;
  venue_id: string | null;
  name: string;
  name_en: string | null;
  name_th: string | null;
  kind: string;
  arrive: number; // minutes since midnight, Bangkok
  leave: number;
  image_url: string | null;
  image_credit: string | null;
  description_en: string | null;
  description_th: string | null;
  entry: PlaceEntry | null;
  website: string | null;
  opening_hours: string | null;
  // How to get here from the previous stop (or from the start point).
  travel: Leg | null;
};

export type PlanInput = {
  start: Coords;
  startMinutes: number;
  endMinutes: number;
  // One to all three ways of getting around; each trip uses the best of them.
  modes: TravelMode[];
  interests: Interest[];
  meals: boolean;
  nightlife: boolean;
};

// ---------------------------------------------------------------------------
// Distances and travel times
// ---------------------------------------------------------------------------

export function metersBetween(a: Coords, b: Coords): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const walkMinutes = (m: number) => Math.max(1, Math.ceil((m * 1.3) / 75)); // 4.5 km/h, streets aren't straight
const taxiMinutes = (m: number) => 6 + Math.ceil((m * 1.4) / 300); // ~18 km/h in Bangkok traffic + getting one
const MINUTES_PER_STOP = 2.2;
const WAIT = 4;
const CHANGE = 7;

function nearestStation(network: TransitNetwork, at: Coords): { station: Station; meters: number } | null {
  let best: { station: Station; meters: number } | null = null;
  for (const station of network.stations.values()) {
    const meters = metersBetween(at, station);
    if (!best || meters < best.meters) best = { station, meters };
  }
  return best && best.meters <= 1100 ? best : null;
}

const lineName = (line: Line) => `${line.network} ${line.name_en.replace(new RegExp(`^${line.network}\\s*`), '')}`.trim();

// Train trip between two stations, with at most one change at an interchange (same station or within 300 m).
function trainTrip(network: TransitNetwork, from: Station, to: Station): Omit<Leg, 'meters'> | null {
  let best: Omit<Leg, 'meters'> | null = null;
  for (const a of network.lines) {
    const i = a.station_ids.indexOf(from.id);
    if (i < 0) continue;
    const j = a.station_ids.indexOf(to.id);
    if (j >= 0) {
      const minutes = WAIT + Math.ceil(Math.abs(i - j) * MINUTES_PER_STOP);
      if (!best || minutes < best.minutes) best = { mode: 'transit', minutes, board: from.name, alight: to.name, lines: [lineName(a)] };
      continue;
    }
    for (const b of network.lines) {
      if (b === a) continue;
      const k = b.station_ids.indexOf(to.id);
      if (k < 0) continue;
      for (let x = 0; x < a.station_ids.length; x++) {
        const sx = network.stations.get(a.station_ids[x]);
        if (!sx) continue;
        for (let y = 0; y < b.station_ids.length; y++) {
          const sy = network.stations.get(b.station_ids[y]);
          if (!sy || metersBetween(sx, sy) > 300) continue;
          const minutes = WAIT + Math.ceil(Math.abs(i - x) * MINUTES_PER_STOP) + CHANGE + Math.ceil(Math.abs(y - k) * MINUTES_PER_STOP);
          if (!best || minutes < best.minutes) {
            best = { mode: 'transit', minutes, board: from.name, change: sx.name, alight: to.name, lines: [lineName(a), lineName(b)] };
          }
        }
      }
    }
  }
  return best;
}

// The way to get from one place to the next, out of the ways of getting around the user picked (one to all three).
export function travel(modes: TravelMode[], from: Coords, to: Coords, network: TransitNetwork | null): Leg {
  const meters = Math.round(metersBetween(from, to));
  const walk: Leg = { mode: 'walk', minutes: walkMinutes(meters), meters };
  const canWalk = modes.includes('walk');
  const canTaxi = modes.includes('taxi');
  // Short hops are walked whatever was picked; with walking picked, so is anything up to 20 minutes (or everything,
  // when walking is the only choice).
  if (meters < 900 || (canWalk && (modes.length === 1 || walk.minutes <= 20))) return walk;
  const taxi: Leg = { mode: 'taxi', minutes: taxiMinutes(meters), meters };
  if (modes.includes('transit') && network) {
    const a = nearestStation(network, from);
    const b = nearestStation(network, to);
    if (a && b && a.station.id !== b.station.id) {
      const trip = trainTrip(network, a.station, b.station);
      if (trip) {
        const minutes = walkMinutes(a.meters) + trip.minutes + walkMinutes(b.meters);
        // With taxis picked too, the train only when it isn't much slower.
        if (!canTaxi || minutes <= taxi.minutes * 1.6) return { ...trip, minutes, meters };
      }
    }
  }
  // No train fits: walk if taxis weren't picked and it isn't too far, else a taxi.
  if (canWalk && !canTaxi && walk.minutes <= 45) return walk;
  return taxi;
}

// ---------------------------------------------------------------------------
// Building the day
// ---------------------------------------------------------------------------

const LUNCH_FROM = 11 * 60 + 45;
const LUNCH_UNTIL = 14 * 60;
const DINNER_FROM = 18 * 60;
const DINNER_UNTIL = 20 * 60 + 30;
const MEAL_MINUTES = { lunch: 60, dinner: 75, nightlife: 90 };

export type PlanDeps = {
  candidates: Candidate[];
  network: TransitNetwork | null;
  // Food / drink near a point: partner venues first, then places.
  foodNear: (at: Coords, kind: 'meal' | 'nightlife') => Promise<FoodOption[]>;
  // Places to leave out (e.g. "shuffle" leaves out the previous picks).
  avoid?: Set<string>;
};

function fromCandidate(c: Candidate, arrive: number, leave: number, leg: Leg | null): PlanStop {
  return {
    key: `${c.source}:${c.id}`,
    type: 'sight',
    place_id: c.source === 'place' ? c.id : null,
    venue_id: c.source === 'venue' ? c.id : null,
    name: c.name,
    name_en: c.name_en,
    name_th: c.name_th,
    kind: c.kind,
    lat: c.lat,
    lng: c.lng,
    arrive,
    leave,
    image_url: c.image_url,
    image_credit: c.image_credit,
    description_en: c.description_en,
    description_th: c.description_th,
    entry: c.entry,
    website: c.website,
    opening_hours: c.opening_hours,
    travel: leg,
  };
}

function fromFood(f: FoodOption, type: 'meal' | 'nightlife', arrive: number, leave: number, leg: Leg): PlanStop {
  return {
    key: `${f.source}:${f.id}`,
    type,
    place_id: f.source === 'place' ? f.id : null,
    venue_id: f.source === 'venue' ? f.id : null,
    name: f.name,
    name_en: f.name_en,
    name_th: f.name_th,
    kind: f.kind,
    lat: f.lat,
    lng: f.lng,
    arrive,
    leave,
    image_url: f.image_url,
    image_credit: null,
    description_en: null,
    description_th: null,
    entry: null,
    website: null,
    opening_hours: null,
    travel: leg,
  };
}

export async function buildPlan(input: PlanInput, deps: PlanDeps): Promise<PlanStop[]> {
  const stops: PlanStop[] = [];
  const used = new Set<string>(deps.avoid ?? []);
  const onlyTemples = input.interests.length === 1 && input.interests[0] === 'temples';
  let here: Coords = input.start;
  let now = input.startMinutes;
  let lunched = !input.meals;
  let dined = !input.meals;

  async function addFood(type: 'meal' | 'nightlife', minutes: number) {
    const options = await deps.foodNear(here, type);
    const pick = options.find((f) => !used.has(`${f.source}:${f.id}`));
    if (!pick) return false;
    const leg = travel(input.modes, here, pick, deps.network);
    const arrive = now + leg.minutes;
    const leave = Math.min(arrive + minutes, input.endMinutes);
    if (leave - arrive < 30) return false;
    used.add(`${pick.source}:${pick.id}`);
    stops.push(fromFood(pick, type, arrive, leave, leg));
    here = pick;
    now = leave;
    return true;
  }

  for (let guard = 0; guard < 14 && now < input.endMinutes - 20; guard++) {
    if (!lunched && now >= LUNCH_FROM && now < LUNCH_UNTIL) {
      lunched = true;
      if (await addFood('meal', MEAL_MINUTES.lunch)) continue;
    }
    if (!dined && now >= DINNER_FROM && now < DINNER_UNTIL) {
      dined = true;
      if (await addFood('meal', MEAL_MINUTES.dinner)) continue;
    }
    // Visits should end by the next meal (give or take 30 minutes).
    const nextMeal = !lunched && now < LUNCH_UNTIL ? LUNCH_FROM : !dined && now < DINNER_UNTIL ? DINNER_FROM : null;
    const limit = nextMeal !== null ? Math.min(input.endMinutes, Math.max(nextMeal, now) + 30) : input.endMinutes;

    const previousKind = stops.length ? stops[stops.length - 1].kind : null;
    const temples = stops.filter((s) => s.kind === 'temple').length;
    let best: { c: Candidate; leg: Leg; visit: number; score: number } | null = null;
    for (const c of deps.candidates) {
      if (used.has(`${c.source}:${c.id}`)) continue;
      if (c.kind === 'temple' && temples >= 3 && !onlyTemples) continue;
      const visit = VISIT_MINUTES[c.kind] ?? 60;
      const leg = travel(input.modes, here, c, deps.network);
      if (now + leg.minutes + Math.min(visit, 45) > limit) continue;
      let score = c.prominence * 3 - leg.minutes * 0.8;
      if (c.source === 'venue') score += 6; // partner venues
      if (c.kind === previousKind) score -= 8; // variety
      if (c.image_url) score += 2;
      if (!best || score > best.score) best = { c, leg, visit, score };
    }
    if (!best) {
      // Nothing fits before the next meal: wait for it (free time), else the day is done.
      if (nextMeal !== null && nextMeal > now) {
        now = nextMeal;
        continue;
      }
      break;
    }
    const arrive = now + best.leg.minutes;
    const leave = Math.min(arrive + best.visit, limit, input.endMinutes);
    used.add(`${best.c.source}:${best.c.id}`);
    stops.push(fromCandidate(best.c, arrive, leave, best.leg));
    here = best.c;
    now = leave;
    if (stops.length >= 10) break;
  }

  // Evening out to finish.
  if (input.nightlife && now >= 19 * 60 && now < input.endMinutes - 45 && stops.length < 12) {
    await addFood('nightlife', Math.min(MEAL_MINUTES.nightlife, input.endMinutes - now));
  }
  return stops;
}

// After a stop is removed: recompute the trips and times from the start, keeping each visit's length.
export function retime(stops: PlanStop[], input: Pick<PlanInput, 'start' | 'startMinutes' | 'endMinutes' | 'modes'>, network: TransitNetwork | null): PlanStop[] {
  let here: Coords = input.start;
  let now = input.startMinutes;
  const out: PlanStop[] = [];
  for (const stop of stops) {
    const leg = travel(input.modes, here, stop, network);
    const arrive = now + leg.minutes;
    if (arrive >= input.endMinutes) break;
    const leave = Math.min(arrive + (stop.leave - stop.arrive), input.endMinutes);
    out.push({ ...stop, travel: leg, arrive, leave });
    here = stop;
    now = leave;
  }
  return out;
}
