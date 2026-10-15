// Same palette as the admin panel (web/src/app/globals.css): warm terracotta brand on stone neutrals.
export const Colors = {
  brand50: '#FDF4EF',
  brand100: '#FBE4D6',
  brand200: '#F6C4A8',
  brand300: '#EF9C72',
  brand500: '#E0612F',
  brand600: '#C94D1F',
  brand700: '#A73C1A',

  ink50: '#FAFAF9',
  ink100: '#F4F3F1',
  ink200: '#E7E5E2',
  ink300: '#D6D3CF',
  ink400: '#A8A29C',
  ink500: '#78726C',
  ink600: '#57524D',
  ink700: '#44403C',
  ink900: '#1C1917',

  white: '#FFFFFF',
  danger: '#B42318',
  dangerBg: '#FEF3F2',
  success: '#067647',
} as const;

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
