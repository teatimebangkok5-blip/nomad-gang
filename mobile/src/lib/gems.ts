import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

// Hidden Gems: the founder's curated Bangkok places (with price, hours, a local tip and a suggested activity), saved
// gems, "useful" votes and suggestions from users. Rules: supabase/migrations/*_hidden_gems.sql.

export const GEM_CATEGORIES = ['food', 'cafes', 'culture', 'markets', 'nightlife', 'outdoor', 'group'] as const;
export type GemCategory = (typeof GEM_CATEGORIES)[number];

export const GEM_CATEGORY_EMOJI: Record<GemCategory, string> = {
  food: '🍜',
  cafes: '☕',
  culture: '🏛️',
  markets: '🛍️',
  nightlife: '🌙',
  outdoor: '🌳',
  group: '👥',
};

// Budget filter: starting spend per person.
export const GEM_BUDGETS = ['any', 'free', 'under100', 'under200'] as const;
export type GemBudget = (typeof GEM_BUDGETS)[number];

export type Gem = {
  id: string;
  number: number | null;
  area_en: string;
  area_th: string;
  category: GemCategory;
  name_en: string;
  name_th: string;
  subtitle_en: string;
  subtitle_th: string;
  description_en: string;
  description_th: string;
  budget_en: string;
  budget_th: string;
  min_spend: number;
  hours_en: string;
  hours_th: string;
  tip_en: string;
  tip_th: string;
  activity_en: string;
  activity_th: string;
  lat: number;
  lng: number;
  place_id: string | null;
  photo_path: string | null;
  image_url: string | null;
  image_credit: string | null;
  local_pick: boolean;
  contributor_id: string | null;
  contributor_name: string | null;
  useful: number;
  i_found_useful: boolean;
  saved: boolean;
  visited: boolean;
};

export function gemPhoto(gem: Gem): { uri: string; credit: string | null } | null {
  if (gem.photo_path) return { uri: supabase.storage.from('gem-photos').getPublicUrl(gem.photo_path).data.publicUrl, credit: null };
  if (gem.image_url) return { uri: gem.image_url, credit: gem.image_credit };
  return null;
}

export function matchesBudget(gem: Gem, budget: GemBudget): boolean {
  if (budget === 'free') return gem.min_spend === 0;
  if (budget === 'under100') return gem.min_spend < 100;
  if (budget === 'under200') return gem.min_spend < 200;
  return true;
}

// Every published gem, shared by the map, the list and the detail screen (loaded once, reloaded after changes).
let cache: Gem[] | null = null;
const listeners = new Set<(gems: Gem[] | null) => void>();

async function fetchGems() {
  const { data, error } = await supabase.rpc('list_gems');
  if (error) {
    console.warn('Loading gems failed', error.message);
    return;
  }
  cache = (data ?? []) as Gem[];
  listeners.forEach((listener) => listener(cache));
}

export function useGems() {
  const [gems, setGems] = useState<Gem[] | null>(cache);
  useEffect(() => {
    listeners.add(setGems);
    if (!cache) fetchGems();
    return () => {
      listeners.delete(setGems);
    };
  }, []);
  const reload = useCallback(() => fetchGems(), []);
  return { gems, reload };
}

function update(id: string, change: Partial<Gem>) {
  if (!cache) return;
  cache = cache.map((gem) => (gem.id === id ? { ...gem, ...change } : gem));
  listeners.forEach((listener) => listener(cache));
}

export async function setGemSaved(gem: Gem, saved: boolean) {
  update(gem.id, { saved });
  const { error } = saved
    ? await supabase.from('gem_saves').insert({ gem_id: gem.id })
    : await supabase.from('gem_saves').delete().eq('gem_id', gem.id);
  if (error) {
    console.warn('Saving the gem failed', error.message);
    update(gem.id, { saved: !saved });
  }
}

export async function setGemUseful(gem: Gem, useful: boolean) {
  update(gem.id, { i_found_useful: useful, useful: gem.useful + (useful ? 1 : -1) });
  const { error } = useful
    ? await supabase.from('gem_votes').insert({ gem_id: gem.id })
    : await supabase.from('gem_votes').delete().eq('gem_id', gem.id);
  if (error) {
    console.warn('Saving the vote failed', error.message);
    update(gem.id, { i_found_useful: gem.i_found_useful, useful: gem.useful });
  }
}

const SUGGEST_ERRORS = ['invalid_suggestion', 'outside_bangkok', 'invalid_photo', 'too_many_suggestions'] as const;
export type SuggestErrorKey = (typeof SUGGEST_ERRORS)[number] | 'generic';

export async function suggestGem(input: {
  name: string;
  category: GemCategory;
  description: string;
  tip: string;
  price: string;
  lat: number;
  lng: number;
  photoPath: string | null;
}): Promise<SuggestErrorKey | null> {
  const { error } = await supabase.rpc('suggest_gem', {
    p_name: input.name.trim(),
    p_category: input.category,
    p_description: input.description.trim(),
    p_tip: input.tip.trim(),
    p_price: input.price.trim(),
    p_lat: input.lat,
    p_lng: input.lng,
    p_photo_path: input.photoPath,
  });
  if (!error) return null;
  return SUGGEST_ERRORS.find((key) => error.message.includes(key)) ?? 'generic';
}
