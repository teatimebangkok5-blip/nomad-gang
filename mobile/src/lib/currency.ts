import { getLocales } from 'expo-localization';
import { useEffect, useState } from 'react';

// Currency conversion for the split-the-bill tool: daily European Central Bank rates from Frankfurter
// (api.frankfurter.dev, free, no key). Rates are kept in memory and on the phone for 12 hours. Shown as "≈" amounts:
// a guide, not what a bank or card will charge.

// Currencies Frankfurter has (ECB reference rates), Thai Baht first.
export const CURRENCIES = [
  'THB', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'CNY', 'HKD', 'INR', 'IDR', 'JPY', 'KRW', 'MYR', 'NZD', 'PHP',
  'SGD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'ILS', 'BRL', 'MXN', 'ZAR', 'TRY', 'ISK', 'RON',
] as const;

const RATES_TTL = 12 * 60 * 60_000;
const PREF_KEY = 'tm.currency';
const memory = new Map<string, { rates: Record<string, number>; at: number }>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not saved; the default is used next time.
  }
}

// The currency people see bills converted to: their choice, else their phone's region, else US dollars.
export function myCurrency(): string {
  const saved = read(PREF_KEY);
  if (saved && (CURRENCIES as readonly string[]).includes(saved)) return saved;
  const phone = getLocales()[0]?.currencyCode ?? null;
  return phone && (CURRENCIES as readonly string[]).includes(phone) ? phone : 'USD';
}

export function setMyCurrency(code: string) {
  write(PREF_KEY, code);
}

async function loadRates(base: string): Promise<Record<string, number> | null> {
  const cached = memory.get(base);
  if (cached && Date.now() - cached.at < RATES_TTL) return cached.rates;
  const stored = read(`tm.rates.${base}`);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as { rates: Record<string, number>; at: number };
      if (Date.now() - parsed.at < RATES_TTL) {
        memory.set(base, parsed);
        return parsed.rates;
      }
    } catch {
      // Ignore a broken cache.
    }
  }
  try {
    const response = await fetch(`https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(base)}`);
    if (!response.ok) return cached?.rates ?? null;
    const json = (await response.json()) as { rates: Record<string, number> };
    const entry = { rates: { ...json.rates, [base]: 1 }, at: Date.now() };
    memory.set(base, entry);
    write(`tm.rates.${base}`, JSON.stringify(entry));
    return entry.rates;
  } catch (error) {
    console.warn('Loading exchange rates failed', error);
    return cached?.rates ?? null;
  }
}

// Rates from `base` to every other currency (null while loading or if unavailable).
export function useRates(base: string | null): Record<string, number> | null {
  const [rates, setRates] = useState<{ base: string; rates: Record<string, number> } | null>(null);
  useEffect(() => {
    if (!base) return;
    let alive = true;
    loadRates(base).then((loaded) => {
      if (alive && loaded) setRates({ base, rates: loaded });
    });
    return () => {
      alive = false;
    };
  }, [base]);
  return rates && rates.base === base ? rates.rates : null;
}

// "฿1,250.50" / "US$37.12" in the app's language.
export function formatMoney(amount: number, currency: string, language: string): string {
  try {
    return new Intl.NumberFormat(language === 'th' ? 'th-TH' : 'en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
