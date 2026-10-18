import 'expo-sqlite/localStorage/install';
import { createContext, use, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { darkColors, Fonts, lightColors, type ThemeColors } from '@/constants/theme';

export type ThemeName = 'light' | 'dark';

const STORAGE_KEY = 'theme';

// Dark is the default (the brand's "night out" look); the choice is saved on the phone.
function savedTheme(): ThemeName {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

type ThemeState = {
  name: ThemeName;
  colors: ThemeColors;
  setTheme: (name: ThemeName) => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<ThemeName>(savedTheme);

  function setTheme(next: ThemeName) {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not saved; the choice still applies until the app restarts.
    }
    setName(next);
  }

  return (
    <ThemeContext value={{ name, colors: name === 'light' ? lightColors : darkColors, setTheme }}>
      {children}
    </ThemeContext>
  );
}

export function useTheme(): ThemeState {
  const theme = use(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
}

export function useColors(): ThemeColors {
  return useTheme().colors;
}

// Theme-aware StyleSheet: write `const useStyles = makeStyles((Colors) => ({ ... }))` at module level and call
// `const styles = useStyles()` in the component. Each theme's (and language's) sheet is created once and reused.
// Fonts are applied here: a text style without a fontFamily gets Figtree, and in Thai, Bricolage Grotesque and
// Figtree become Anuphan (they have no Thai letters), with room for Thai vowel and tone marks.
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (colors: ThemeColors) => T) {
  const cache = new Map<string, T>();
  return function useStyles(): T {
    const { name, colors } = useTheme();
    const { i18n } = useTranslation();
    const thai = i18n.language === 'th';
    const key = `${name}:${thai ? 'th' : 'en'}`;
    let styles = cache.get(key);
    if (!styles) {
      styles = StyleSheet.create(withFonts(factory(colors), thai));
      cache.set(key, styles);
    }
    return styles;
  };
}

type TextLike = { fontSize?: number; fontFamily?: string; lineHeight?: number; letterSpacing?: number };

function withFonts<T extends object>(sheet: T, thai: boolean): T {
  const out: Record<string, unknown> = {};
  for (const [name, style] of Object.entries(sheet)) {
    const text = style as TextLike;
    if (!style || typeof style !== 'object' || (text.fontSize === undefined && text.fontFamily === undefined)) {
      out[name] = style;
      continue;
    }
    const family = text.fontFamily ?? Fonts.body;
    if (!thai || (family !== Fonts.body && family !== Fonts.heading)) {
      out[name] = { ...text, fontFamily: family };
      continue;
    }
    const size = text.fontSize ?? 15;
    out[name] = {
      ...text,
      fontFamily: Fonts.thai,
      letterSpacing: text.letterSpacing && text.letterSpacing < 0 ? 0 : text.letterSpacing,
      lineHeight: text.lineHeight === undefined ? undefined : Math.max(text.lineHeight, Math.round(size * 1.45)),
    };
  }
  return out as T;
}
