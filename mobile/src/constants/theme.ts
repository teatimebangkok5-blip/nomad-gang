// Two themes from the app icon's colors; the user picks one in Settings (src/lib/theme.tsx).
// - Dark: the "night out" look: violet-black sky, orange → coral → pink pin, violet glow.
// - Light: white/lavender surfaces with the same brand colors.
// The admin panel uses the same brand colors (web/src/app/globals.css).
// Rules: text on orange/pink fills is `onBrand` (dark; white on them is unreadable). Orange or warm text/icons on
// plain backgrounds use `accent` / `glow`, which are darker in the light theme so they stay readable on white.

export type ThemeColors = {
  bg: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  borderStrong: string;
  // Translucent surface for UI floating over the map or photos.
  overlay: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  // Brand fills (buttons, selected chips, pins).
  orange: string;
  coral: string;
  pink: string;
  violet: string;
  // Orange for text and icons on plain backgrounds.
  accent: string;
  // Warm text on orangeTint (deal titles).
  glow: string;
  onBrand: string;
  orangeTint: string;
  pinkTint: string;
  violetTint: string;
  pressed: string;
  white: string;
  danger: string;
  dangerBg: string;
  // Top-of-map fade: opaque → transparent.
  fade: readonly [string, string, string];
};

export const darkColors: ThemeColors = {
  bg: '#0A0612',
  surface: '#160D24',
  surfaceRaised: '#211633',
  border: '#2F2247',
  borderStrong: '#4A3870',
  overlay: 'rgba(22, 13, 36, 0.95)',
  text: '#FFFFFF',
  textSecondary: '#CBC0DE',
  textMuted: '#968AAE',
  orange: '#FF9A1B',
  coral: '#FE593B',
  pink: '#FF1F78',
  violet: '#7B4DFF',
  accent: '#FF9A1B',
  glow: '#F6C98F',
  onBrand: '#0A0612',
  orangeTint: 'rgba(255, 154, 27, 0.14)',
  pinkTint: 'rgba(255, 31, 120, 0.16)',
  violetTint: 'rgba(123, 77, 255, 0.18)',
  pressed: 'rgba(255, 255, 255, 0.08)',
  white: '#FFFFFF',
  danger: '#FF6B7A',
  dangerBg: 'rgba(255, 77, 94, 0.14)',
  fade: ['rgba(10, 6, 18, 0.95)', 'rgba(10, 6, 18, 0.75)', 'rgba(10, 6, 18, 0)'],
};

export const lightColors: ThemeColors = {
  bg: '#FBF8FE',
  surface: '#FFFFFF',
  surfaceRaised: '#F3EEF9',
  border: '#E5DDF0',
  borderStrong: '#CFC3E2',
  overlay: 'rgba(255, 255, 255, 0.96)',
  text: '#1A1028',
  textSecondary: '#4E4361',
  textMuted: '#6B6080',
  orange: '#FF9A1B',
  coral: '#FE593B',
  pink: '#FF1F78',
  violet: '#6A3CE8',
  accent: '#B35400',
  glow: '#8A4300',
  onBrand: '#1A1028',
  orangeTint: 'rgba(255, 154, 27, 0.16)',
  pinkTint: 'rgba(255, 31, 120, 0.12)',
  violetTint: 'rgba(106, 60, 232, 0.10)',
  pressed: 'rgba(26, 16, 40, 0.06)',
  white: '#FFFFFF',
  danger: '#C4223A',
  dangerBg: 'rgba(196, 34, 58, 0.10)',
  fade: ['rgba(251, 248, 254, 0.96)', 'rgba(251, 248, 254, 0.8)', 'rgba(251, 248, 254, 0)'],
};

// The pin / "Meet" gradient, left to right. Used for the main button in both themes.
export const BrandGradient = ['#FF9A1B', '#FE593B', '#FF1F78'] as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const Type = {
  display: { fontSize: 30, lineHeight: 38, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 30, fontWeight: '700' },
  heading: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
} as const;
