import { BrandFonts } from '@/lib/brand-typography'

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
	textHeadline: omColors.grayscale850,
	textBody: omColors.grayscale750,
	textMuted: omColors.grayscale600,
	textLight: omColors.grayscale400,
	primary: omColors.grayscale850,
	primaryText: omColors.grayscale00,
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
	green: '#78E89E',
	softGreen: '#B1E375',
	softTeal: '#DDF3EE',
	warmWhite: '#fcfcfd',
	fog: '#eef0f6',
	mist: '#f4f3f6',
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
