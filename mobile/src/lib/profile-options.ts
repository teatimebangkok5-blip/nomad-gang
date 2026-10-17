import type { TFunction } from 'i18next';

import type { Language } from '@/i18n';
import { COUNTRIES, LANGUAGES, type Country, type LanguageOption } from '@/lib/countries';

// The choices on a profile (first-time questions and Edit profile). Profession, travel style and interests are
// stored as keys and named through the translation files (about.professions.*, about.styles.*, about.interestNames.*);
// countries and languages carry their own English and Thai names (src/lib/countries.ts).

export const PROFESSIONS = [
  'marketing',
  'tech',
  'design',
  'business',
  'finance',
  'education',
  'healthcare',
  'hospitality',
  'media',
  'engineering',
  'law',
  'science',
  'arts',
  'entrepreneur',
  'freelancer',
  'student',
  'retired',
  'other',
] as const;

export const TRAVEL_STYLES = [
  'digital_nomad',
  'backpacker',
  'tourist',
  'expat',
  'local',
  'remote_worker',
  'business',
  'student',
  'solo',
  'slow',
  'luxury',
  'volunteer',
] as const;

export const INTERESTS = [
  { key: 'food', emoji: '🍽️' },
  { key: 'coffee', emoji: '☕' },
  { key: 'sightseeing', emoji: '👀' },
  { key: 'tech', emoji: '🚀' },
  { key: 'content', emoji: '📸' },
  { key: 'nightlife', emoji: '🍸' },
  { key: 'music', emoji: '🎶' },
  { key: 'art', emoji: '🎨' },
  { key: 'culture', emoji: '🏛️' },
  { key: 'temples', emoji: '🛕' },
  { key: 'markets', emoji: '🛍️' },
  { key: 'shopping', emoji: '🛒' },
  { key: 'beach', emoji: '🏖️' },
  { key: 'hiking', emoji: '🥾' },
  { key: 'fitness', emoji: '💪' },
  { key: 'yoga', emoji: '🧘' },
  { key: 'sports', emoji: '⚽' },
  { key: 'muay_thai', emoji: '🥊' },
  { key: 'cooking', emoji: '🍳' },
  { key: 'wine', emoji: '🍷' },
  { key: 'photography', emoji: '📷' },
  { key: 'movies', emoji: '🎬' },
  { key: 'reading', emoji: '📚' },
  { key: 'gaming', emoji: '🎮' },
  { key: 'dancing', emoji: '💃' },
  { key: 'languages', emoji: '🗣️' },
  { key: 'wellness', emoji: '💆' },
  { key: 'volunteering', emoji: '🤝' },
] as const;

type Profession = (typeof PROFESSIONS)[number];
type TravelStyle = (typeof TRAVEL_STYLES)[number];
type Interest = (typeof INTERESTS)[number]['key'];

// Labels for stored keys; a key the app doesn't know (e.g. added in a newer version) shows as it is.
export function professionLabel(t: TFunction, key: string): string {
  return (PROFESSIONS as readonly string[]).includes(key) ? t(`about.professions.${key as Profession}`) : key;
}

export function travelStyleLabel(t: TFunction, key: string): string {
  return (TRAVEL_STYLES as readonly string[]).includes(key) ? t(`about.styles.${key as TravelStyle}`) : key;
}

export function interestLabel(t: TFunction, key: string): string {
  return INTERESTS.some((interest) => interest.key === key) ? t(`about.interestNames.${key as Interest}`) : key;
}

export const MAX_INTERESTS = 15;
export const MAX_LANGUAGES = 10;
export const MAX_CLOCKS = 6;
// The 193 UN members plus the 2 observer states, for "World %".
export const WORLD_COUNTRY_COUNT = 195;

export function interestEmoji(key: string): string {
  return INTERESTS.find((interest) => interest.key === key)?.emoji ?? '✨';
}

// 'TH' → 🇹🇭
export function flagEmoji(code: string | null | undefined): string {
  if (!code || !/^[A-Z]{2}$/.test(code)) return '🌐';
  return String.fromCodePoint(...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

const countryByCode = new Map(COUNTRIES.map((country) => [country.code, country]));
const languageByCode = new Map(LANGUAGES.map((language) => [language.code, language]));

export function countryName(code: string | null | undefined, language: Language): string {
  const country = code ? countryByCode.get(code) : undefined;
  return country ? country[language] : (code ?? '');
}

export function findCountry(code: string | null | undefined): Country | undefined {
  return code ? countryByCode.get(code) : undefined;
}

// 'other' is "Other"; unknown codes show as they are.
export function languageLabel(code: string, language: Language, otherLabel: string): { flag: string; name: string } {
  if (code === 'other') return { flag: '🌐', name: otherLabel };
  const option: LanguageOption | undefined = languageByCode.get(code);
  return option ? { flag: flagEmoji(option.flag), name: option[language] } : { flag: '🌐', name: code };
}

// Search by English or Thai name, or code.
export function matchesSearch(names: string[], query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || names.some((name) => name.toLowerCase().includes(q));
}

const MONTHS: Record<Language, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  th: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
};

// Calendar dates are kept as 'YYYY-MM-DD' (Postgres date), never shifted by time zones.
export function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

// "4 May 1997"; Thai uses the Buddhist year (2540). `withYear` false: "4 May".
export function formatDate(iso: string, language: Language, withYear = true): string {
  const [y, m, d] = iso.split('-').map(Number);
  const year = language === 'th' ? y + 543 : y;
  return withYear ? `${d} ${MONTHS[language][m - 1]} ${year}` : `${d} ${MONTHS[language][m - 1]}`;
}

// "10 – 20 Oct 2026", "28 Oct – 3 Nov 2026", "28 Dec 2026 – 3 Jan 2027"
export function formatDateRange(startIso: string, endIso: string, language: Language): string {
  if (startIso === endIso) return formatDate(startIso, language);
  const sameYear = startIso.slice(0, 4) === endIso.slice(0, 4);
  const sameMonth = sameYear && startIso.slice(5, 7) === endIso.slice(5, 7);
  const start = sameMonth ? String(Number(startIso.slice(8, 10))) : formatDate(startIso, language, !sameYear);
  return `${start} – ${formatDate(endIso, language)}`;
}

// Age in whole years on `today`.
export function ageOn(birthIso: string, today = new Date()): number {
  const [y, m, d] = birthIso.split('-').map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age;
}

export type ClockCity = { zone: string; en: string; th: string };

// Cities for world clocks.
export const CLOCK_CITIES: ClockCity[] = [
  { zone: 'Asia/Bangkok', en: 'Bangkok', th: 'กรุงเทพฯ' },
  { zone: 'Asia/Singapore', en: 'Singapore', th: 'สิงคโปร์' },
  { zone: 'Asia/Kuala_Lumpur', en: 'Kuala Lumpur', th: 'กัวลาลัมเปอร์' },
  { zone: 'Asia/Jakarta', en: 'Jakarta', th: 'จาการ์ตา' },
  { zone: 'Asia/Makassar', en: 'Bali', th: 'บาหลี' },
  { zone: 'Asia/Ho_Chi_Minh', en: 'Ho Chi Minh City', th: 'โฮจิมินห์' },
  { zone: 'Asia/Manila', en: 'Manila', th: 'มะนิลา' },
  { zone: 'Asia/Hong_Kong', en: 'Hong Kong', th: 'ฮ่องกง' },
  { zone: 'Asia/Shanghai', en: 'Beijing / Shanghai', th: 'ปักกิ่ง / เซี่ยงไฮ้' },
  { zone: 'Asia/Taipei', en: 'Taipei', th: 'ไทเป' },
  { zone: 'Asia/Seoul', en: 'Seoul', th: 'โซล' },
  { zone: 'Asia/Tokyo', en: 'Tokyo', th: 'โตเกียว' },
  { zone: 'Asia/Kolkata', en: 'Delhi / Mumbai', th: 'เดลี / มุมไบ' },
  { zone: 'Asia/Kathmandu', en: 'Kathmandu', th: 'กาฐมาณฑุ' },
  { zone: 'Asia/Dhaka', en: 'Dhaka', th: 'ธากา' },
  { zone: 'Asia/Colombo', en: 'Colombo', th: 'โคลัมโบ' },
  { zone: 'Asia/Karachi', en: 'Karachi', th: 'การาจี' },
  { zone: 'Asia/Dubai', en: 'Dubai', th: 'ดูไบ' },
  { zone: 'Asia/Riyadh', en: 'Riyadh', th: 'ริยาด' },
  { zone: 'Asia/Jerusalem', en: 'Jerusalem', th: 'เยรูซาเลม' },
  { zone: 'Europe/Istanbul', en: 'Istanbul', th: 'อิสตันบูล' },
  { zone: 'Europe/Moscow', en: 'Moscow', th: 'มอสโก' },
  { zone: 'Europe/Athens', en: 'Athens', th: 'เอเธนส์' },
  { zone: 'Europe/Berlin', en: 'Berlin', th: 'เบอร์ลิน' },
  { zone: 'Europe/Paris', en: 'Paris', th: 'ปารีส' },
  { zone: 'Europe/Amsterdam', en: 'Amsterdam', th: 'อัมสเตอร์ดัม' },
  { zone: 'Europe/Madrid', en: 'Madrid', th: 'มาดริด' },
  { zone: 'Europe/Rome', en: 'Rome', th: 'โรม' },
  { zone: 'Europe/Stockholm', en: 'Stockholm', th: 'สตอกโฮล์ม' },
  { zone: 'Europe/London', en: 'London', th: 'ลอนดอน' },
  { zone: 'Europe/Lisbon', en: 'Lisbon', th: 'ลิสบอน' },
  { zone: 'Africa/Cairo', en: 'Cairo', th: 'ไคโร' },
  { zone: 'Africa/Nairobi', en: 'Nairobi', th: 'ไนโรบี' },
  { zone: 'Africa/Lagos', en: 'Lagos', th: 'ลากอส' },
  { zone: 'Africa/Johannesburg', en: 'Johannesburg', th: 'โจฮันเนสเบิร์ก' },
  { zone: 'America/Sao_Paulo', en: 'São Paulo', th: 'เซาเปาลู' },
  { zone: 'America/Argentina/Buenos_Aires', en: 'Buenos Aires', th: 'บัวโนสไอเรส' },
  { zone: 'America/Bogota', en: 'Bogotá', th: 'โบโกตา' },
  { zone: 'America/Mexico_City', en: 'Mexico City', th: 'เม็กซิโกซิตี' },
  { zone: 'America/New_York', en: 'New York', th: 'นิวยอร์ก' },
  { zone: 'America/Toronto', en: 'Toronto', th: 'โทรอนโต' },
  { zone: 'America/Chicago', en: 'Chicago', th: 'ชิคาโก' },
  { zone: 'America/Denver', en: 'Denver', th: 'เดนเวอร์' },
  { zone: 'America/Los_Angeles', en: 'Los Angeles', th: 'ลอสแอนเจลิส' },
  { zone: 'Pacific/Honolulu', en: 'Honolulu', th: 'โฮโนลูลู' },
  { zone: 'Australia/Perth', en: 'Perth', th: 'เพิร์ท' },
  { zone: 'Australia/Sydney', en: 'Sydney', th: 'ซิดนีย์' },
  { zone: 'Pacific/Auckland', en: 'Auckland', th: 'โอ๊คแลนด์' },
];

export function clockCityName(zone: string, language: Language): string {
  const city = CLOCK_CITIES.find((c) => c.zone === zone);
  return city ? city[language] : (zone.split('/').pop() ?? zone).replace(/_/g, ' ');
}
