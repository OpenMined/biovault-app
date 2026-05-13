// ts-prune-ignore-next
export interface ColorTheme {
	// Primary colors
	primary: string
	primaryAlt: string
	primaryLight: string
	primaryDark: string

	// Backgrounds
	background: string
	surface: string
	surfaceAlt: string

	// Text colors
	textPrimary: string
	textSecondary: string
	textTertiary: string
	textInverse: string

	// Clinical significance colors
	pathogenic: string
	pathogenicBg: string
	likelyPathogenic: string
	likelyPathogenicBg: string
	uncertain: string
	uncertainBg: string
	conflicting: string
	conflictingBg: string
	benign: string
	benignBg: string

	// Status colors
	error: string
	errorBg: string
	warning: string
	warningBg: string
	success: string
	successBg: string
	info: string
	infoBg: string

	// UI elements
	border: string
	borderLight: string
	divider: string
	shadow: string
	overlay: string

	// Special elements
	inactive: string
	highlight: string

	// Onboarding slide backgrounds
	bgPrivacy: string
	bgAnalysis: string
	bgInsights: string
	bgResearch: string
	bgControl: string
}

// ts-prune-ignore-next
export const lightTheme: ColorTheme = {
	// Primary colors
	primary: '#007559',
	primaryAlt: '#00bc7d',
	primaryLight: '#dff5e7',
	primaryDark: '#003419',

	// Backgrounds
	background: '#fdfdfd',
	surface: '#ffffff',
	surfaceAlt: '#f0f2f4',

	// Text colors
	textPrimary: '#0a0b0d',
	textSecondary: '#52555b',
	textTertiary: '#1f2227',
	textInverse: '#ffffff',

	// Clinical significance colors
	pathogenic: '#c53030',
	pathogenicBg: '#fee',
	likelyPathogenic: '#d69e2e',
	likelyPathogenicBg: '#fffbf0',
	uncertain: '#d69e2e',
	uncertainBg: '#fffbf0',
	conflicting: '#7b1fa2',
	conflictingBg: '#f3e5f5',
	benign: '#22543d',
	benignBg: '#f0fff4',

	// Status colors
	error: '#cc272e',
	errorBg: '#fee',
	warning: '#d69e2e',
	warningBg: '#fffbf0',
	success: '#007d33',
	successBg: '#dff5e7',
	info: '#002635',
	infoBg: '#deeef6',

	// UI elements
	border: '#dddee0',
	borderLight: '#e3e4e6',
	divider: '#dddee0',
	shadow: '#0a0b0d',
	overlay: 'rgba(0, 0, 0, 0.5)',

	// Special elements
	inactive: '#deeef6',
	highlight: '#dff5e7',

	// Onboarding slide backgrounds
	bgPrivacy: '#dff5e7',
	bgAnalysis: '#eff0f2',
	bgInsights: '#deeef6',
	bgResearch: '#dff5e7',
	bgControl: '#fdfdfd',
}

// ts-prune-ignore-next
export const darkTheme: ColorTheme = {
	// Primary colors
	primary: '#62d79b',
	primaryAlt: '#54c891',
	primaryLight: '#202423',
	primaryDark: '#b8bfba',

	// Backgrounds
	background: '#111312',
	surface: '#181b1a',
	surfaceAlt: '#202423',

	// Text colors
	textPrimary: '#f3f4f1',
	textSecondary: '#b8bfba',
	textTertiary: '#7f8982',
	textInverse: '#07100b',

	// Clinical significance colors
	pathogenic: '#fc8181',
	pathogenicBg: 'rgba(197, 48, 48, 0.2)',
	likelyPathogenic: '#f6e05e',
	likelyPathogenicBg: 'rgba(214, 158, 46, 0.2)',
	uncertain: '#f6e05e',
	uncertainBg: 'rgba(214, 158, 46, 0.2)',
	conflicting: '#b794f4',
	conflictingBg: 'rgba(128, 90, 213, 0.2)',
	benign: '#68d391',
	benignBg: 'rgba(34, 84, 61, 0.2)',

	// Status colors
	error: '#cc272e',
	errorBg: 'rgba(204, 39, 46, 0.2)',
	warning: '#f6e05e',
	warningBg: 'rgba(214, 158, 46, 0.2)',
	success: '#62d79b',
	successBg: 'rgba(98, 215, 155, 0.12)',
	info: '#7cc7d6',
	infoBg: 'rgba(124, 199, 214, 0.14)',

	// UI elements
	border: '#303633',
	borderLight: '#3d4541',
	divider: '#303633',
	shadow: '#000000',
	overlay: 'rgba(0, 0, 0, 0.7)',

	// Special elements
	inactive: '#3d4541',
	highlight: '#202423',

	// Onboarding slide backgrounds
	bgPrivacy: '#111312',
	bgAnalysis: '#181b1a',
	bgInsights: '#202423',
	bgResearch: '#111312',
	bgControl: '#0d0f0e',
}
