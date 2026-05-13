import type { ColorScheme } from '@/lib/color-theme'

/** Dark neutral base with BioVault green reserved for accents. */
export const LAB_LANDING_PAGE_FILL = '#111312'

export type LabPalette = {
	pageBg: string
	surface: string
	surfaceRaised: string
	surfaceSunken: string
	surfaceSolid: string
	sidebar: string
	sidebarControl: string
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

// ---------------------------------------------------------------------------
// Light — warm near-white page, white cards that pop, deep green accent for
// readable text/icons. Surfaces are opaque so the hierarchy reads cleanly at
// a glance; accent tints gentle but present.
// ---------------------------------------------------------------------------
const light: LabPalette = {
	pageBg: '#fdfdfd',
	surface: '#ffffff',         // cards sit above pageBg with real contrast
	surfaceRaised: '#ffffff',
	surfaceSunken: '#eff0f2',   // deeper inset for code/result preBlocks
	surfaceSolid: '#ffffff',
	sidebar: '#f6f8f7',
	sidebarControl: '#ffffff',
	border: '#dddee0',
	borderStrong: '#c3d2c9',
	text: '#0a0b0d',
	textMuted: '#52555b',
	textFaint: '#809589',
	accent: '#007559',
	accentStrong: '#007559',
	accentSoft: 'rgba(0,117,89,0.14)',
	accentBorder: 'rgba(0,117,89,0.34)',
	accentTint: 'rgba(0,117,89,0.08)',
	warningBg: '#fdf4d6',
	warningText: '#6f540a',
	warningBorder: '#e5cf83',
	dangerBg: '#fbeaed',
	dangerText: '#7d2638',
	dangerBorder: '#dda0ad',
	overlayBg: 'rgba(253,253,253,0.92)',
	overlayCardBg: 'rgba(0,117,89,0.12)',
	invertText: '#ffffff',
	iconNeutral: '#52555b',
	shadow: 'rgba(10,11,13,0.06)',
}

// ---------------------------------------------------------------------------
// Dark — aligned with the shared BioVault green base and emerald accents.
// ---------------------------------------------------------------------------
const dark: LabPalette = {
	pageBg: LAB_LANDING_PAGE_FILL, // landing :root / body tint stack
	surface: '#181b1a',
	surfaceRaised: '#202423',
	surfaceSunken: '#0d0f0e',
	surfaceSolid: '#151817',
	sidebar: '#151817',
	sidebarControl: '#0d0f0e',
	border: 'rgba(219,226,221,0.12)',
	borderStrong: 'rgba(219,226,221,0.22)',
	text: '#f3f4f1',
	textMuted: '#b8bfba',
	textFaint: '#7f8982',
	accent: '#62d79b',
	accentStrong: '#8ee7b8',
	accentSoft: 'rgba(98,215,155,0.10)',
	accentBorder: 'rgba(98,215,155,0.24)',
	accentTint: 'rgba(98,215,155,0.07)',
	warningBg: 'rgba(255,200,80,0.1)',
	warningText: '#ffd87a',
	warningBorder: 'rgba(255,200,80,0.3)',
	dangerBg: 'rgba(255,107,107,0.12)',
	dangerText: '#ff9a9a',
	dangerBorder: 'rgba(255,107,107,0.35)',
	overlayBg: 'rgba(17,19,18,0.92)',
	overlayCardBg: 'rgba(98,215,155,0.10)',
	invertText: '#07100b',
	iconNeutral: '#aeb6b1',
	shadow: 'rgba(0,0,0,0.28)',
}

export const labPalettes: Record<ColorScheme, LabPalette> = { light, dark }
