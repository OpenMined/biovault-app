import type { ColorScheme } from '@/lib/color-theme'

export type LabPalette = {
	pageBg: string
	surface: string
	surfaceRaised: string
	surfaceSunken: string
	surfaceSolid: string
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
	pageBg: '#f6f5f9',          // soft cool gray — lets white cards pop
	surface: '#ffffff',         // cards sit above pageBg with real contrast
	surfaceRaised: '#ffffff',
	surfaceSunken: '#eeedf3',   // deeper inset for code/result preBlocks
	surfaceSolid: '#ffffff',
	border: '#e4e2eb',          // soft but visible separator
	borderStrong: '#c6c3d2',
	text: '#17161d',
	textMuted: '#4e4c60',       // darker than before for cleaner secondary
	textFaint: '#7a7790',       // still subtle but now passes 3:1
	accent: '#53bea9',          // brand green — buttons, borders, fills
	accentStrong: '#1f7360',    // deep green for text/links on white (5:1)
	accentSoft: 'rgba(83,190,169,0.16)',
	accentBorder: 'rgba(83,190,169,0.5)',
	accentTint: 'rgba(83,190,169,0.1)',
	warningBg: '#fdf4d6',
	warningText: '#6f540a',
	warningBorder: '#e5cf83',
	dangerBg: '#fbeaed',
	dangerText: '#7d2638',
	dangerBorder: '#dda0ad',
	overlayBg: 'rgba(246,245,249,0.92)',
	overlayCardBg: 'rgba(83,190,169,0.14)',
	invertText: '#17161d',      // dark text on green button
	iconNeutral: '#4e4c60',
	shadow: 'rgba(23,22,29,0.06)',
}

// ---------------------------------------------------------------------------
// Dark — deeper warm-slate page, OPAQUE surfaces (not rgba overlays) so cards
// feel like real material rather than frosted glass. Slightly softer white
// for body text (easier on the eyes). Accent brighter on dark for pop.
// ---------------------------------------------------------------------------
const dark: LabPalette = {
	pageBg: '#0e1018',           // deep slate — warmer than near-black
	surface: '#1a1d26',          // opaque card — no rgba overlay muddiness
	surfaceRaised: '#21242f',    // for nested cards (observation inside run)
	surfaceSunken: '#07080d',    // code/result preBlocks, darker than page
	surfaceSolid: '#1a1d26',     // matches surface; onboarding info card
	border: 'rgba(255,255,255,0.08)',
	borderStrong: 'rgba(255,255,255,0.16)',
	text: '#f4f5f8',             // soft white — not pure #fff
	textMuted: '#c4c2d0',        // clearly secondary, still legible
	textFaint: '#8e8ca3',        // tertiary, passes 3:1 against pageBg
	accent: '#53bea9',           // same brand green as light
	accentStrong: '#6dd5c0',     // brighter on dark for readable text/icons
	accentSoft: 'rgba(83,190,169,0.12)',
	accentBorder: 'rgba(83,190,169,0.4)',
	accentTint: 'rgba(83,190,169,0.08)',
	warningBg: 'rgba(255,200,80,0.1)',
	warningText: '#ffd87a',
	warningBorder: 'rgba(255,200,80,0.3)',
	dangerBg: 'rgba(255,107,107,0.12)',
	dangerText: '#ff9a9a',
	dangerBorder: 'rgba(255,107,107,0.35)',
	overlayBg: 'rgba(10,12,19,0.88)',
	overlayCardBg: 'rgba(83,190,169,0.14)',
	invertText: '#0e1018',       // dark text on green CTA button
	iconNeutral: '#c4c2d0',
	shadow: 'rgba(0,0,0,0.4)',
}

export const labPalettes: Record<ColorScheme, LabPalette> = { light, dark }
