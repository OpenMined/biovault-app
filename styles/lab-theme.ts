import type { ColorScheme } from '@/lib/color-theme'

export type LabPalette = {
	pageBg: string
	surface: string
	surfaceRaised: string
	surfaceSunken: string
	border: string
	borderStrong: string
	text: string
	textMuted: string
	textFaint: string
	accent: string
	accentStrong: string
	accentSoft: string
	accentBorder: string
	accentTint: string
	warningBg: string
	warningText: string
	warningBorder: string
	dangerBg: string
	dangerText: string
	dangerBorder: string
	overlayBg: string
	overlayCardBg: string
	invertText: string
	iconNeutral: string
	shadow: string
}

export const labPalettes: Record<ColorScheme, LabPalette> = {
	light: {
		pageBg: '#ffffff',
		surface: '#fafafb',
		surfaceRaised: '#ffffff',
		surfaceSunken: '#f4f3f6',
		border: '#ecebef',
		borderStrong: '#cfcdd6',
		text: '#17161d',
		textMuted: '#5e5a72',
		textFaint: '#868394',
		accent: '#53bea9',
		accentStrong: '#2e7a68',
		accentSoft: 'rgba(83,190,169,0.14)',
		accentBorder: 'rgba(83,190,169,0.45)',
		accentTint: 'rgba(83,190,169,0.08)',
		warningBg: '#fdf6e1',
		warningText: '#886b10',
		warningBorder: '#ecdc9e',
		dangerBg: '#fbf0f2',
		dangerText: '#8a2e40',
		dangerBorder: '#e0a3b0',
		overlayBg: 'rgba(255,255,255,0.88)',
		overlayCardBg: 'rgba(83,190,169,0.12)',
		invertText: '#17161d',
		iconNeutral: '#5e5a72',
		shadow: 'rgba(23,22,29,0.04)',
	},
	dark: {
		pageBg: '#17161d',
		surface: 'rgba(255,255,255,0.035)',
		surfaceRaised: 'rgba(255,255,255,0.06)',
		surfaceSunken: '#0e0d12',
		border: 'rgba(255,255,255,0.08)',
		borderStrong: 'rgba(255,255,255,0.14)',
		text: '#ffffff',
		textMuted: '#b4b0bf',
		textFaint: '#868394',
		accent: '#53bea9',
		accentStrong: '#53bea9',
		accentSoft: 'rgba(83,190,169,0.1)',
		accentBorder: 'rgba(83,190,169,0.32)',
		accentTint: 'rgba(83,190,169,0.08)',
		warningBg: 'rgba(255,200,80,0.08)',
		warningText: '#ffd36b',
		warningBorder: 'rgba(255,200,80,0.22)',
		dangerBg: 'rgba(255,107,107,0.08)',
		dangerText: '#ff8a8a',
		dangerBorder: 'rgba(255,107,107,0.3)',
		overlayBg: 'rgba(5, 15, 20, 0.82)',
		overlayCardBg: 'rgba(83,190,169,0.12)',
		invertText: '#17161d',
		iconNeutral: '#b4b0bf',
		shadow: 'rgba(0,0,0,0)',
	},
}
