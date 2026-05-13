// Source of truth for design tokens. Mirrors styles/brand.ts (mobile).
// Plain TypeScript — no RN or DOM dependencies — so every platform imports identically.

export const omColors = {
  grayscale00: '#ffffff',
  grayscale50: '#fdfdfd',
  grayscale150: '#f0f2f4',
  grayscale300: '#dddee0',
  grayscale400: '#b8bfba',
  grayscale500: '#7f8982',
  grayscale550: '#52555b',
  grayscale600: '#1f2227',
  grayscale700: '#303633',
  grayscale750: '#202423',
  grayscale850: '#111312',
  grayscale950: '#07100b',
  teal500: '#009a7b',
  teal600: '#007559',
  green500: '#62d79b',
  green600: '#007559',
  yellow200: '#faf0d1',
  yellow800: '#896b10',
  red50: '#faf0f2',
  red300: '#e0a3b0',
  red700: '#cc272e',
} as const

export const omSpacing = {
  xs: 6,
  s: 8,
  m: 12,
  l: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxxl: 40,
} as const

export const omRadius = {
  s: 6,
  m: 8,
  l: 16,
  xl: 32,
  full: 999,
} as const

export const omTypography = {
  h1: { fontSize: 61, lineHeight: 73, fontWeight: 400 },
  h3: { fontSize: 36, lineHeight: 43, fontWeight: 400 },
  h4: { fontSize: 27, lineHeight: 32, fontWeight: 400 },
  headline: { fontSize: 21, lineHeight: 25, fontWeight: 500 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: 400 },
  subtitle: { fontSize: 12, lineHeight: 17, fontWeight: 700 },
  caption: { fontSize: 11, lineHeight: 16, fontWeight: 500 },
} as const

export const omTheme = {
  background: omColors.grayscale50,
  surface: omColors.grayscale00,
  surfaceDim: omColors.grayscale150,
  border: omColors.grayscale300,
  textHeadline: omColors.grayscale950,
  textBody: omColors.grayscale600,
  textMuted: omColors.grayscale550,
  textLight: omColors.grayscale400,
  primary: omColors.green500,
  primaryText: omColors.grayscale00,
  actionText: omColors.grayscale950,
  accent: omColors.green500,
  accentDeep: omColors.green600,
  link: omColors.teal600,
} as const

export const omGradients = {
  orangeRed: ['#F79763', '#CC677B'],
  redViolet: ['#CC677B', '#6976AE'],
  violetBlue: ['#6976AE', '#52A8C5'],
  tealGreen: ['#52A8C5', '#53BEA9'],
  greenLime: ['#53BEA9', '#96D195'],
} as const
