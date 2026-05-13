import { BrandFonts } from '@/lib/brand-typography'

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
	h1: {
		fontFamily: BrandFonts.heading,
		fontSize: 61,
		lineHeight: 73,
		fontWeight: '400' as const,
	},
	h3: {
		fontFamily: BrandFonts.heading,
		fontSize: 36,
		lineHeight: 43,
		fontWeight: '400' as const,
	},
	h4: {
		fontFamily: BrandFonts.heading,
		fontSize: 27,
		lineHeight: 32,
		fontWeight: '400' as const,
	},
	headline: {
		fontFamily: BrandFonts.body,
		fontSize: 21,
		lineHeight: 25,
		fontWeight: '500' as const,
	},
	body: {
		fontFamily: BrandFonts.body,
		fontSize: 16,
		lineHeight: 24,
		fontWeight: '400' as const,
	},
	subtitle: {
		fontFamily: BrandFonts.body,
		fontSize: 12,
		lineHeight: 17,
		fontWeight: '700' as const,
	},
	caption: {
		fontFamily: BrandFonts.body,
		fontSize: 11,
		lineHeight: 16,
		fontWeight: '500' as const,
	},
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
	warningSurface: omColors.yellow200,
	warningText: omColors.yellow800,
	dangerSurface: omColors.red50,
	dangerBorder: omColors.red300,
	dangerText: omColors.red700,
} as const

export const omGradients = {
	goldOrange: ['#F8C073', '#F79763'],
	orangeRed: ['#F79763', '#CC677B'],
	redViolet: ['#CC677B', '#6976AE'],
	violetBlue: ['#6976AE', '#52A8C5'],
	tealGreen: ['#52A8C5', '#53BEA9'],
	greenLime: ['#53BEA9', '#96D195'],
	limeYellow: ['#96D195', '#F2D98C'],
} as const

export const omGradientAnchors = {
	magenta: '#CC389D',
	coral: '#F77D5A',
	gold: '#FFB64E',
	warmYellow: '#D8D070',
	lime: '#B0F882',
	teal: '#51DAC0',
	blue: '#589ED0',
	deepViolet: '#6B40E0',
} as const

export const bioVaultGradientAnchors = {
	teal: omGradientAnchors.teal,
	lime: omGradientAnchors.lime,
	green: '#00bc7d',
	softGreen: '#00cc91',
	softTeal: '#dff5e7',
	warmWhite: '#fdfdfd',
	fog: '#deeef6',
	mist: '#eff0f2',
} as const

export const omSurfaces = {
	glassStrong: 'rgba(255,255,255,0.84)',
	glass: 'rgba(255,255,255,0.8)',
	glassBorder: 'rgba(255,255,255,0.48)',
	glassBorderSoft: 'rgba(255,255,255,0.34)',
	glassInput: 'rgba(255,255,255,0.62)',
	warningGlass: 'rgba(250,240,209,0.76)',
	warningGlassSoft: 'rgba(250,240,209,0.74)',
} as const
