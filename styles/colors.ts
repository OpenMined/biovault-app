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
	primary: '#059669',
	primaryAlt: '#6b9080',
	primaryLight: '#e0f2e7',
	primaryDark: '#2d5a4f',

	// Backgrounds
	background: '#f8fffe',
	surface: '#ffffff',
	surfaceAlt: '#f8fffe',

	// Text colors
	textPrimary: '#2d5a4f',
	textSecondary: '#666666',
	textTertiary: '#4a5568',
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
	error: '#c53030',
	errorBg: '#fee',
	warning: '#d69e2e',
	warningBg: '#fffbf0',
	success: '#22543d',
	successBg: '#f0fff4',
	info: '#2196f3',
	infoBg: '#e3f2fd',

	// UI elements
	border: '#e0f2e7',
	borderLight: '#e0f2e7',
	divider: '#e0f2e7',
	shadow: '#2d5a4f',
	overlay: 'rgba(0, 0, 0, 0.5)',

	// Special elements
	inactive: '#a4c3b2',
	highlight: '#f0f9f6',

	// Onboarding slide backgrounds
	bgPrivacy: '#e0f2e7',
	bgAnalysis: '#f0f9f6',
	bgInsights: '#e8f5f0',
	bgResearch: '#e0f2e7',
	bgControl: '#f8fffe',
}

// ts-prune-ignore-next
export const darkTheme: ColorTheme = {
	// Primary colors
	primary: '#059669',
	primaryAlt: '#7ea995',
	primaryLight: '#2d5a4f',
	primaryDark: '#a4c3b2',

	// Backgrounds
	background: '#1a2f2a',
	surface: '#1e3a32',
	surfaceAlt: '#243f37',

	// Text colors
	textPrimary: '#e8f5f0',
	textSecondary: '#a4c3b2',
	textTertiary: '#9db5a8',
	textInverse: '#1a2f2a',

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
	error: '#fc8181',
	errorBg: 'rgba(197, 48, 48, 0.2)',
	warning: '#f6e05e',
	warningBg: 'rgba(214, 158, 46, 0.2)',
	success: '#68d391',
	successBg: 'rgba(34, 84, 61, 0.2)',
	info: '#63b3ed',
	infoBg: 'rgba(66, 153, 225, 0.2)',

	// UI elements
	border: '#2d5a4f',
	borderLight: '#3a6d5f',
	divider: '#2d5a4f',
	shadow: '#000000',
	overlay: 'rgba(0, 0, 0, 0.7)',

	// Special elements
	inactive: '#3a6d5f',
	highlight: '#2a4d43',

	// Onboarding slide backgrounds
	bgPrivacy: '#1a2f2a',
	bgAnalysis: '#243f37',
	bgInsights: '#2d5a4f',
	bgResearch: '#1a2f2a',
	bgControl: '#0f1f1a',
}