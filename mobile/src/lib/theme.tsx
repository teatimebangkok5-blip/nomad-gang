import 'expo-sqlite/localStorage/install';
import { createContext, use, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { darkColors, lightColors, type ThemeColors } from '@/constants/theme';

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
// `const styles = useStyles()` in the component. Each theme's sheet is created once and reused.
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (colors: ThemeColors) => T) {
  const cache = new Map<ThemeName, T>();
  return function useStyles(): T {
    const { name, colors } = useTheme();
    let styles = cache.get(name);
    if (!styles) {
      styles = StyleSheet.create(factory(colors));
      cache.set(name, styles);
    }
    return styles;
  };
}
