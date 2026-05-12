import type { ColorScheme } from '@/lib/color-theme'

/** Matches BioVault landing `:root`/body fill (prepare-cloudflare-web-assets `index.html`). */
export const LAB_LANDING_PAGE_FILL = '#272532'

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
// Dark — aligned with BioVault landing (prepare-cloudflare-web-assets /
// index.html): #272532 base, teal radial veil, warm off-white headline text,
// #d8d3df secondary, soft borders like rgba(255,255,255,0.08-0.14).
// ---------------------------------------------------------------------------
const dark: LabPalette = {
	pageBg: LAB_LANDING_PAGE_FILL, // landing :root / body tint stack
	surface: '#353243', // grayscale750 — inset panels / lists (home screens)
	surfaceRaised: '#3a364c', // one step elevated from surface
	surfaceSunken: '#1f1d29', // code wells, dipped regions
	surfaceSolid: '#353243', // explorer column, grouped panels
	border: 'rgba(255,255,255,0.1)', // landing .platforms / footer separators
	borderStrong: 'rgba(255,255,255,0.14)',
	text: '#f7f4ef', // landing :root foreground
	textMuted: '#d8d3df', // landing hero <p>
	textFaint: 'rgba(247,244,239,0.52)', // landing .footer-note
	accent: '#53bea9', // landing .brand / CTA fill
	accentStrong: '#53bea9', // BIOVAULT kicker / links — matches landing teal
	accentSoft: 'rgba(83,190,169,0.14)',
	accentBorder: 'rgba(83,190,169,0.32)',
	accentTint: 'rgba(83,190,169,0.1)',
	warningBg: 'rgba(255,200,80,0.1)',
	warningText: '#ffd87a',
	warningBorder: 'rgba(255,200,80,0.3)',
	dangerBg: 'rgba(255,107,107,0.12)',
	dangerText: '#ff9a9a',
	dangerBorder: 'rgba(255,107,107,0.35)',
	overlayBg: 'rgba(39,37,50,0.92)',
	overlayCardBg: 'rgba(83,190,169,0.14)',
	invertText: '#17161d', // landing .primary-action strong (on teal)
	iconNeutral: '#cfcdd6',
	shadow: 'rgba(83,190,169,0.24)',
}

export const labPalettes: Record<ColorScheme, LabPalette> = { light, dark }
