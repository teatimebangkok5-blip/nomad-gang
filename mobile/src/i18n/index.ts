import 'expo-sqlite/localStorage/install';
import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

import en from './en';
import th from './th';

export type Language = 'en' | 'th';
const STORAGE_KEY = 'language';

// A language the user picked wins; otherwise Thai for Thai phones and English for everyone else.
function initialLanguage(): Language {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'en' || saved === 'th') return saved;
  return getLocales()[0]?.languageCode === 'th' ? 'th' : 'en';
}

const i18n = createInstance();

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, th: { translation: th } },
  lng: initialLanguage(),
  fallbackLng: 'en',
  initAsync: false,
  interpolation: { escapeValue: false },
});

// Outside components only (callbacks, plain functions). Components use useLanguage(): the React Compiler caches a
// plain call like this one, so the screen would keep showing the old language.
export function currentLanguage(): Language {
  return i18n.language === 'th' ? 'th' : 'en';
}

// The current language; re-renders the component when it changes.
export function useLanguage(): Language {
  const { i18n: instance } = useTranslation();
  return instance.language === 'th' ? 'th' : 'en';
}

export function setLanguage(language: Language) {
  localStorage.setItem(STORAGE_KEY, language);
  i18n.changeLanguage(language);
}

// Picks the Thai or English column of a database row, e.g. localized(venue, 'name').
export function localized<K extends string>(row: Record<`${K}_en` | `${K}_th`, string>, key: K, language: Language): string {
  const value = row[`${key}_${language}`];
  return value || row[`${key}_en`];
}

export default i18n;
