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
	primary: '#4CAF50',
	primaryAlt: '#059669',
	primaryLight: '#e8f5e9',
	primaryDark: '#2e7d32',

	// Backgrounds
	background: '#f5f5f5',
	surface: '#ffffff',
	surfaceAlt: '#f8f9fa',

	// Text colors
	textPrimary: '#333333',
	textSecondary: '#666666',
	textTertiary: '#999999',
	textInverse: '#ffffff',

	// Clinical significance colors
	pathogenic: '#d32f2f',
	pathogenicBg: '#ffebee',
	likelyPathogenic: '#f57c00',
	likelyPathogenicBg: '#fff3e0',
	uncertain: '#fbc02d',
	uncertainBg: '#fffde7',
	conflicting: '#7b1fa2',
	conflictingBg: '#f3e5f5',
	benign: '#388e3c',
	benignBg: '#e8f5e9',

	// Status colors
	error: '#d32f2f',
	errorBg: '#ffebee',
	warning: '#f57c00',
	warningBg: '#fff3e0',
	success: '#4CAF50',
	successBg: '#e8f5e9',
	info: '#2196f3',
	infoBg: '#e3f2fd',

	// UI elements
	border: '#e0e0e0',
	borderLight: '#f0f0f0',
	divider: '#e0e0e0',
	shadow: '#000000',
	overlay: 'rgba(0, 0, 0, 0.6)',

	// Special elements
	inactive: '#cbd5e1',
	highlight: '#f0f8f0',

	// Onboarding slide backgrounds
	bgPrivacy: '#e3f2fd',
	bgAnalysis: '#f3e5f5',
	bgInsights: '#fff3e0',
	bgResearch: '#e8f5e9',
	bgControl: '#fce4ec',
}

// ts-prune-ignore-next
export const darkTheme: ColorTheme = {
	// Primary colors
	primary: '#66bb6a',
	primaryAlt: '#10b981',
	primaryLight: '#1b5e20',
	primaryDark: '#81c784',

	// Backgrounds
	background: '#121212',
	surface: '#1e1e1e',
	surfaceAlt: '#2a2a2a',

	// Text colors
	textPrimary: '#ffffff',
	textSecondary: '#b3b3b3',
	textTertiary: '#808080',
	textInverse: '#000000',

	// Clinical significance colors
	pathogenic: '#ef5350',
	pathogenicBg: '#311b1b',
	likelyPathogenic: '#ff9800',
	likelyPathogenicBg: '#332519',
	uncertain: '#fdd835',
	uncertainBg: '#333319',
	conflicting: '#ab47bc',
	conflictingBg: '#2a1b31',
	benign: '#66bb6a',
	benignBg: '#1b301c',

	// Status colors
	error: '#ef5350',
	errorBg: '#311b1b',
	warning: '#ff9800',
	warningBg: '#332519',
	success: '#66bb6a',
	successBg: '#1b301c',
	info: '#42a5f5',
	infoBg: '#1a2b3d',

	// UI elements
	border: '#333333',
	borderLight: '#2a2a2a',
	divider: '#333333',
	shadow: '#000000',
	overlay: 'rgba(0, 0, 0, 0.8)',

	// Special elements
	inactive: '#4a5568',
	highlight: '#1a3a1a',

	// Onboarding slide backgrounds
	bgPrivacy: '#1a2b3d',
	bgAnalysis: '#2a1b31',
	bgInsights: '#332519',
	bgResearch: '#1b301c',
	bgControl: '#3d1a2b',
}