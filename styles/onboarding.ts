import { StyleSheet, Dimensions } from 'react-native'
import { colors } from './shared'

const { width } = Dimensions.get('window')

// ts-prune-ignore-next
export const onboardingStyles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.surface,
	},
	skipContainer: {
		alignItems: 'flex-end',
		paddingHorizontal: 20,
		paddingTop: 10,
	},
	skipText: {
		fontSize: 16,
		color: '#64748b',
		fontWeight: '500',
	},
	slideContainer: {
		width,
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		paddingHorizontal: 40,
		paddingBottom: 120,
	},
	illustrationContainer: {
		width: 280,
		height: 280,
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 48,
		borderRadius: 140,
		overflow: 'hidden',
	},
	iconGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		width: 240,
		justifyContent: 'center',
		alignItems: 'center',
	},
	iconWrapper: {
		margin: 8,
	},
	slideTitle: {
		fontSize: 28,
		fontWeight: '800',
		textAlign: 'center',
		marginBottom: 16,
		lineHeight: 36,
		color: colors.textPrimary,
	},
	slideDescription: {
		fontSize: 16,
		textAlign: 'center',
		color: colors.textSecondary,
		lineHeight: 24,
		paddingHorizontal: 20,
	},
	bottomContainer: {
		paddingHorizontal: 20,
		paddingBottom: 40,
	},
	indicatorContainer: {
		flexDirection: 'row',
		justifyContent: 'center',
		marginBottom: 30,
	},
	indicator: {
		width: 8,
		height: 8,
		borderRadius: 4,
		marginHorizontal: 4,
	},
	activeIndicator: {
		backgroundColor: colors.primaryAlt,
		width: 24,
	},
	inactiveIndicator: {
		backgroundColor: '#cbd5e1',
	},
	nextButton: {
		backgroundColor: colors.primaryAlt,
		paddingVertical: 16,
		borderRadius: 16,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.15,
		shadowRadius: 8,
		elevation: 4,
	},
	nextButtonText: {
		color: colors.surface,
		fontSize: 18,
		fontWeight: '700',
	},
	// Slide-specific background colors
	bgPrivacy: {
		backgroundColor: '#e3f2fd',
	},
	bgAnalysis: {
		backgroundColor: '#f3e5f5',
	},
	bgInsights: {
		backgroundColor: '#fff3e0',
	},
	bgResearch: {
		backgroundColor: '#e8f5e9',
	},
	bgControl: {
		backgroundColor: '#fce4ec',
	},
})