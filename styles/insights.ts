import { StyleSheet } from 'react-native'
import { colors } from './shared'

export const insightsStyles = StyleSheet.create({
	geneCard: {
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
	geneHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
		marginBottom: 16,
	},
	geneName: {
		fontSize: 20,
		fontWeight: '700',
		color: colors.textPrimary,
	},
	significanceTag: {
		paddingHorizontal: 12,
		paddingVertical: 4,
		borderRadius: 12,
		backgroundColor: colors.background,
	},
	significanceText: {
		fontSize: 12,
		fontWeight: '600',
		color: colors.textPrimary,
	},
	variantCount: {
		fontSize: 14,
		color: colors.textSecondary,
		marginTop: 8,
	},
	categorySection: {
		marginBottom: 24,
	},
	categoryTitle: {
		fontSize: 18,
		fontWeight: '700',
		color: colors.textPrimary,
		marginBottom: 12,
		paddingHorizontal: 20,
	},
	emptyState: {
		padding: 20,
		alignItems: 'center',
	},
	emptyText: {
		fontSize: 14,
		color: colors.textTertiary,
	},
	loadingContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 20,
	},
	loadingText: {
		marginTop: 12,
		fontSize: 16,
		color: colors.textSecondary,
	},
	progressBar: {
		height: 4,
		backgroundColor: colors.background,
		borderRadius: 2,
		overflow: 'hidden',
		marginTop: 8,
	},
	progressFill: {
		height: '100%',
		backgroundColor: colors.primary,
	},
	analysisCompleteCard: {
		backgroundColor: '#e8f5e9',
		marginHorizontal: 20,
		marginBottom: 20,
		padding: 20,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: colors.primary,
	},
	analysisCompleteTitle: {
		fontSize: 18,
		fontWeight: '700',
		color: colors.primary,
		marginBottom: 8,
	},
	statsRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginTop: 12,
	},
	statItem: {
		alignItems: 'center',
	},
	statValue: {
		fontSize: 24,
		fontWeight: '800',
		color: colors.textPrimary,
	},
	statLabel: {
		fontSize: 12,
		color: colors.textSecondary,
		marginTop: 4,
	},
})