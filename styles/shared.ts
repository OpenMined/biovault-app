import { StyleSheet } from 'react-native'
import { lightTheme } from './colors'

// Default to light theme for static styles
// Components should use useTheme() hook for dynamic theming
// ts-prune-ignore-next
export const colors = lightTheme

// ts-prune-ignore-next
export const typography = StyleSheet.create({
	largeTitle: {
		fontSize: 32,
		fontWeight: '800' as const,
		color: colors.textPrimary,
	},
	title: {
		fontSize: 28,
		fontWeight: '700' as const,
		color: colors.textPrimary,
	},
	sectionTitle: {
		fontSize: 22,
		fontWeight: '700' as const,
		color: colors.textPrimary,
	},
	cardTitle: {
		fontSize: 18,
		fontWeight: '600' as const,
		color: colors.textPrimary,
	},
	subtitle: {
		fontSize: 16,
		color: colors.textSecondary,
		lineHeight: 22,
	},
	bodyText: {
		fontSize: 14,
		color: colors.textSecondary,
		lineHeight: 20,
	},
	caption: {
		fontSize: 12,
		color: colors.textTertiary,
		lineHeight: 16,
	},
	buttonText: {
		fontSize: 16,
		fontWeight: '600' as const,
		color: colors.surface,
	},
	buttonTextSmall: {
		fontSize: 14,
		fontWeight: '600' as const,
		color: colors.surface,
	},
})

// ts-prune-ignore-next
export const layout = StyleSheet.create({
	screenContainer: {
		flex: 1,
		backgroundColor: colors.background,
	},
	contentContainer: {
		flex: 1,
		padding: 20,
	},
	scrollContent: {
		flexGrow: 1,
		paddingBottom: 100,
	},
	headerSection: {
		padding: 20,
		paddingBottom: 16,
	},
	centeredContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 20,
	},
	row: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	spacedRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
})

// ts-prune-ignore-next
export const cards = StyleSheet.create({
	standard: {
		backgroundColor: colors.surface,
		padding: 20,
		borderRadius: 16,
		marginBottom: 12,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
	},
	compact: {
		backgroundColor: colors.surface,
		padding: 16,
		borderRadius: 12,
		marginBottom: 8,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.06,
		shadowRadius: 8,
		elevation: 3,
	},
	premium: {
		backgroundColor: colors.surface,
		padding: 24,
		borderRadius: 20,
		marginBottom: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 8 },
		shadowOpacity: 0.12,
		shadowRadius: 16,
		elevation: 8,
	},
	stats: {
		backgroundColor: '#f8f9fa',
		padding: 12,
		borderRadius: 8,
		alignItems: 'center' as const,
		flex: 1,
	},
})

// ts-prune-ignore-next
export const buttons = StyleSheet.create({
	primary: {
		backgroundColor: colors.primary,
		paddingVertical: 16,
		borderRadius: 12,
		alignItems: 'center' as const,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 8,
		elevation: 4,
	},
	primarySmall: {
		backgroundColor: colors.primary,
		paddingVertical: 12,
		paddingHorizontal: 16,
		borderRadius: 8,
		alignItems: 'center' as const,
	},
	secondary: {
		backgroundColor: colors.background,
		paddingVertical: 12,
		paddingHorizontal: 16,
		borderRadius: 8,
		alignItems: 'center' as const,
	},
	outline: {
		borderWidth: 1,
		borderColor: colors.primary,
		paddingVertical: 12,
		paddingHorizontal: 16,
		borderRadius: 8,
		alignItems: 'center' as const,
	},
	destructive: {
		backgroundColor: colors.error,
		paddingVertical: 12,
		paddingHorizontal: 16,
		borderRadius: 8,
		alignItems: 'center' as const,
	},
})

// ts-prune-ignore-next
export const forms = StyleSheet.create({
	searchContainer: {
		backgroundColor: colors.surface,
		borderRadius: 12,
		flexDirection: 'row',
		alignItems: 'center' as const,
		paddingHorizontal: 16,
		marginBottom: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.06,
		shadowRadius: 4,
		elevation: 2,
	},
	searchInput: {
		flex: 1,
		paddingVertical: 12,
		fontSize: 16,
		color: colors.textPrimary,
	},
	input: {
		backgroundColor: colors.surface,
		borderRadius: 8,
		paddingVertical: 12,
		paddingHorizontal: 16,
		fontSize: 16,
		color: colors.textPrimary,
		borderWidth: 1,
		borderColor: '#e0e0e0',
	},
})

// ts-prune-ignore-next
export const badges = StyleSheet.create({
	base: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 16,
		flexDirection: 'row',
		alignItems: 'center' as const,
		alignSelf: 'flex-start' as const,
	},
	success: {
		backgroundColor: '#e8f5e9',
	},
	error: {
		backgroundColor: '#ffebee',
	},
	warning: {
		backgroundColor: '#fff3e0',
	},
	info: {
		backgroundColor: '#e3f2fd',
	},
	neutral: {
		backgroundColor: colors.background,
	},
})

// ts-prune-ignore-next
export const modals = StyleSheet.create({
	overlay: {
		flex: 1,
		backgroundColor: 'rgba(0, 0, 0, 0.6)',
		justifyContent: 'center' as const,
		alignItems: 'center' as const,
	},
	container: {
		backgroundColor: colors.surface,
		borderRadius: 20,
		padding: 24,
		width: '90%',
		maxWidth: 400,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 10 },
		shadowOpacity: 0.3,
		shadowRadius: 20,
		elevation: 10,
	},
	title: {
		fontSize: 24,
		fontWeight: '700' as const,
		color: colors.textPrimary,
		marginBottom: 8,
		textAlign: 'center' as const,
	},
	content: {
		marginVertical: 20,
	},
	footer: {
		flexDirection: 'row',
		justifyContent: 'space-between' as const,
		marginTop: 20,
	},
})

// ts-prune-ignore-next
export const spacing = {
	xs: 4,
	sm: 8,
	md: 12,
	lg: 16,
	xl: 20,
	xxl: 24,
	xxxl: 32,
}

// ts-prune-ignore-next
export const borderRadius = {
	sm: 4,
	md: 8,
	lg: 12,
	xl: 16,
	xxl: 20,
	round: 9999,
}