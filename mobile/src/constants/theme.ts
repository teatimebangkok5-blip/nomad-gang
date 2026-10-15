// Dark "night out" theme taken from the app icon: a violet-black night sky, the orange → coral → pink of the
// location pin and the "Meet" lettering, and a violet glow. The admin panel uses the same brand colors
// (web/src/app/globals.css).
// Text on orange/pink fills is dark (`onBrand`); white on pink or orange is too low-contrast to read.
export const Colors = {
  // Surfaces
  bg: '#0A0612',
  surface: '#160D24',
  surfaceRaised: '#211633',
  border: '#2F2247',
  borderStrong: '#4A3870',

  // Text
  text: '#FFFFFF',
  textSecondary: '#CBC0DE',
  textMuted: '#968AAE',

  // Brand
  orange: '#FF9A1B',
  coral: '#FE593B',
  pink: '#FF1F78',
  violet: '#7B4DFF',
  glow: '#F6C98F',
  onBrand: '#0A0612',

  // Soft tints on the dark background
  orangeTint: 'rgba(255, 154, 27, 0.14)',
  pinkTint: 'rgba(255, 31, 120, 0.16)',
  violetTint: 'rgba(123, 77, 255, 0.18)',
  pressed: 'rgba(255, 255, 255, 0.08)',

  white: '#FFFFFF',
  danger: '#FF6B7A',
  dangerBg: 'rgba(255, 77, 94, 0.14)',
} as const;

// The pin / "Meet" gradient, left to right. Used for the main button.
export const BrandGradient = [Colors.orange, Colors.coral, Colors.pink] as const;

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
