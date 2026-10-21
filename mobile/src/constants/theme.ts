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
  // Violet / pink text and icons on plain backgrounds or on their tints (Hangout labels, "Host").
  violetText: string;
  pinkText: string;
  // Success text: "Checked in ✓", "Open now", "Free entry".
  ok: string;
  // Pit-stops ("⚡ Heading there in 15 min"): fill, tint behind text, and text on plain backgrounds / the tint.
  amber: string;
  amberTint: string;
  amberText: string;
  // Text field background.
  field: string;
  // Top-of-map fade: opaque → transparent.
  fade: readonly [string, string, string];
  // Glossy 3D style: surfaces go light (top) → base (bottom), with a shine over the top half.
  surfaceGradient: readonly [string, string];
  shine: readonly [string, string];
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
  orangeTint: 'rgba(255, 154, 27, 0.15)',
  pinkTint: 'rgba(255, 31, 120, 0.15)',
  violetTint: 'rgba(123, 77, 255, 0.16)',
  pressed: 'rgba(255, 255, 255, 0.08)',
  white: '#FFFFFF',
  danger: '#FF6B7A',
  dangerBg: 'rgba(255, 107, 122, 0.14)',
  violetText: '#B9A2FF',
  pinkText: '#FF6FA3',
  ok: '#5FD39A',
  amber: '#FFB800',
  amberTint: 'rgba(255, 184, 0, 0.16)',
  amberText: '#FFCF5C',
  field: '#120A1E',
  fade: ['rgba(10, 6, 18, 0.94)', 'rgba(10, 6, 18, 0.7)', 'rgba(10, 6, 18, 0)'],
  surfaceGradient: ['#2A1D40', '#160D24'],
  shine: ['rgba(255, 255, 255, 0.09)', 'rgba(255, 255, 255, 0.03)'],
};

export const lightColors: ThemeColors = {
  bg: '#FBF8FE',
  surface: '#FFFFFF',
  surfaceRaised: '#F3EEF9',
  border: '#E5DDF0',
  borderStrong: '#CFC3E2',
  overlay: 'rgba(255, 255, 255, 0.95)',
  text: '#1A1028',
  textSecondary: '#4A3D5E',
  textMuted: '#6B5F82',
  orange: '#FF9A1B',
  coral: '#FE593B',
  pink: '#FF1F78',
  violet: '#7B4DFF',
  accent: '#A85300',
  glow: '#8A4300',
  onBrand: '#0A0612',
  orangeTint: 'rgba(255, 154, 27, 0.15)',
  pinkTint: 'rgba(255, 31, 120, 0.15)',
  violetTint: 'rgba(123, 77, 255, 0.16)',
  pressed: 'rgba(26, 16, 40, 0.06)',
  white: '#FFFFFF',
  danger: '#C8283B',
  dangerBg: 'rgba(200, 40, 59, 0.10)',
  violetText: '#5A2FE0',
  pinkText: '#C2004C',
  ok: '#1E7F4F',
  amber: '#FFB800',
  amberTint: 'rgba(255, 184, 0, 0.18)',
  amberText: '#8A5300',
  field: '#FFFFFF',
  fade: ['rgba(251, 248, 254, 0.95)', 'rgba(251, 248, 254, 0.75)', 'rgba(251, 248, 254, 0)'],
  surfaceGradient: ['#FFFFFF', '#F3EEF9'],
  shine: ['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.55)'],
};

// The pin / "Meet" gradient, left to right: badges ("Partner", "−15%"), progress bars, the avatar ring.
export const BrandGradient = ['#FF9A1B', '#FE593B', '#FF1F78'] as const;

// Button fills, the same in both themes (top → bottom, except Plan my day which runs left → right). Text on orange
// and plan is `onBrand`, on violet white. Draw them with <ToneFill /> (src/components/glossy.tsx).
export const Tones = {
  orange: { colors: ['#FFB547', '#FF9A1B', '#FE593B'], locations: [0, 0.45, 1], horizontal: false },
  violet: { colors: ['#8F6BFF', '#7B4DFF', '#6236F0'], locations: [0, 0.5, 1], horizontal: false },
  lilac: { colors: ['#BBA3FF', '#9C7AFF', '#8E66FF'], locations: [0, 0.5, 1], horizontal: false },
  plan: { colors: ['#A88BFF', '#D86BD0', '#FF4F93'], locations: [0, 0.5, 1], horizontal: true },
  brand: { colors: BrandGradient, locations: [0, 0.5, 1], horizontal: true },
} as const;
export type Tone = keyof typeof Tones;

// Colored glow under brand buttons (Android draws elevation shadows in shadowColor from Android 9).
export const ToneShadow = {
  orange: { elevation: 6, shadowColor: '#FE593B', shadowOpacity: 0.35, shadowRadius: 9, shadowOffset: { width: 0, height: 6 } },
  violet: { elevation: 6, shadowColor: '#7B4DFF', shadowOpacity: 0.38, shadowRadius: 9, shadowOffset: { width: 0, height: 6 } },
  plan: { elevation: 6, shadowColor: '#D86BD0', shadowOpacity: 0.35, shadowRadius: 9, shadowOffset: { width: 0, height: 6 } },
} as const;

// Avatar colors for people without a photo (picked from their id, so a person keeps their color).
export const AvatarColors = ['#FFB547', '#FF6FA3', '#A98BFF', '#6FD3B0', '#7FB8FF', '#FFD36E'] as const;
export function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AvatarColors[Math.abs(hash) % AvatarColors.length];
}

// Fonts (assets/fonts, embedded by the expo-font plugin in app.json, so a new native build is needed after
// changing them): Bricolage Grotesque for headings, Figtree for everything else. In Thai both are swapped for
// Anuphan by makeStyles (src/lib/theme.tsx), which also gives Figtree to any text style without a font.
export const Fonts = {
  heading: 'Bricolage Grotesque',
  body: 'Figtree',
  thai: 'Anuphan',
} as const;

// Raised (3D) shadows: elevation on Android, shadow* on iOS.
export const Raised = {
  elevation: 6,
  shadowColor: '#000',
  shadowOpacity: 0.25,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 4 },
} as const;

export const RaisedSmall = {
  elevation: 3,
  shadowColor: '#000',
  shadowOpacity: 0.18,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 2 },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// sm: notes and small tags; md: text fields, tiles, time slots; lg: cards and boxes; sheet: panels sliding up.
export const Radius = {
  sm: 10,
  md: 18,
  lg: 22,
  sheet: 30,
  pill: 999,
} as const;

export const Type = {
  display: { fontFamily: Fonts.heading, fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.5 },
  title: { fontFamily: Fonts.heading, fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -0.2 },
  heading: { fontFamily: Fonts.heading, fontSize: 17, lineHeight: 23, fontWeight: '700' },
  body: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22, fontWeight: '500' },
  small: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  label: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 19, fontWeight: '700' },
} as const;
