// Source of truth for design tokens. Mirrors styles/brand.ts (mobile).
// Plain TypeScript — no RN or DOM dependencies — so every platform imports identically.

export const omColors = {
  grayscale00: '#ffffff',
  grayscale50: '#fcfcfd',
  grayscale150: '#f4f3f6',
  grayscale300: '#ecebef',
  grayscale400: '#cfcdd6',
  grayscale500: '#b4b0bf',
  grayscale550: '#868394',
  grayscale600: '#5e5a72',
  grayscale700: '#464257',
  grayscale750: '#353243',
  grayscale850: '#272532',
  grayscale950: '#17161d',
  teal500: '#52a8c5',
  teal600: '#388ca8',
  green500: '#53bea9',
  green600: '#3c9f8b',
  yellow200: '#faf0d1',
  yellow800: '#896b10',
  red50: '#faf0f2',
  red300: '#e0a3b0',
  red700: '#8a2e40',
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
  textHeadline: omColors.grayscale850,
  textBody: omColors.grayscale750,
  textMuted: omColors.grayscale600,
  textLight: omColors.grayscale400,
  primary: omColors.grayscale850,
  primaryText: omColors.grayscale00,
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
