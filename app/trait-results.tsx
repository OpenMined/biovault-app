/**
 * Trait Analysis Results Screen
 * Displays detailed trait analysis results with sleek UI
 */

import { useAnalytics } from '@/hooks/useAnalytics'
import type { TraitAnalysisResult, TraitSNP } from '@/lib/trait-analysis'
import { router, useLocalSearchParams } from 'expo-router'
import React from 'react'
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function TraitResultsScreen() {
	const params = useLocalSearchParams<{
		result: string
	}>()

	console.log('TraitResultsScreen mounted')
	console.log('Params:', params)

	const { trackEvent } = useAnalytics({
		trackScreenView: true,
		screenProperties: { screen: 'TraitResults' },
	})

	const result: TraitAnalysisResult | null = params.result
		? JSON.parse(params.result as string)
		: null

	console.log('Parsed result:', result ? result.trait_name : 'null')

	if (!result) {
		return (
			<SafeAreaView style={styles.container}>
				<View style={styles.errorContainer}>
					<Text style={styles.errorText}>No results to display</Text>
					<TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
						<Text style={styles.backButtonText}>Go Back</Text>
					</TouchableOpacity>
				</View>
			</SafeAreaView>
		)
	}

	const getConfidenceBadge = () => {
		const badges = {
			high: { text: 'High Confidence', color: '#10b981', emoji: '✓' },
			medium: { text: 'Medium Confidence', color: '#f59e0b', emoji: '~' },
			low: { text: 'Low Confidence', color: '#ef4444', emoji: '!' },
		}
		return badges[result.confidence]
	}

	const confidenceBadge = getConfidenceBadge()

	// Group SNPs by importance
	const primarySnps = result.matched_snps.filter((s) => s.importance === 'primary')
	const secondarySnps = result.matched_snps.filter((s) => s.importance === 'secondary')
	const tertiarySnps = result.matched_snps.filter((s) => s.importance === 'tertiary')

	const renderSnpTable = (snps: TraitSNP[], title: string) => {
		if (snps.length === 0) return null

		return (
			<Animated.View entering={FadeInUp.duration(300)} style={styles.tableSection}>
				<Text style={styles.tableSectionTitle}>{title}</Text>

				<View style={styles.table}>
					{/* Table Header */}
					<View style={styles.tableHeader}>
						<Text style={[styles.tableHeaderCell, styles.rsidColumn]}>SNP</Text>
						<Text style={[styles.tableHeaderCell, styles.geneColumn]}>Gene</Text>
						<Text style={[styles.tableHeaderCell, styles.genotypeColumn]}>Your DNA</Text>
						<Text style={[styles.tableHeaderCell, styles.effectColumn]}>Effect</Text>
					</View>

					{/* Table Rows */}
					{snps.map((snp, index) => (
						<Animated.View
							key={snp.rsid}
							entering={FadeInUp.duration(250).delay(index * 50)}
							style={[styles.tableRow, index % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd]}
						>
							<TouchableOpacity
								style={[styles.tableCell, styles.rsidColumn]}
								onPress={() => {
									trackEvent('snp_clicked', { rsid: snp.rsid })
									Linking.openURL(`https://www.snpedia.com/index.php/${snp.rsid}`)
								}}
							>
								<Text style={styles.rsidText}>{snp.rsid}</Text>
							</TouchableOpacity>

							<Text style={[styles.tableCell, styles.geneColumn, styles.geneText]}>
								{snp.gene || '-'}
							</Text>

							<View style={[styles.tableCell, styles.genotypeColumn]}>
								<View
									style={[
										styles.genotypeBadge,
										snp.user_has_risk_allele && styles.genotypeBadgeHighlight,
									]}
								>
									<Text style={styles.genotypeText}>{snp.user_genotype || '-'}</Text>
								</View>
							</View>

							<Text
								style={[styles.tableCell, styles.effectColumn, styles.effectText]}
								numberOfLines={2}
							>
								{snp.description}
							</Text>
						</Animated.View>
					))}
				</View>
			</Animated.View>
		)
	}

	return (
		<View style={styles.container}>
			<SafeAreaView style={styles.safeArea}>
				<ScrollView
					style={styles.scrollView}
					contentContainerStyle={styles.scrollContent}
					showsVerticalScrollIndicator={false}
				>
					{/* Header with Back Button */}
					<Animated.View entering={FadeInDown.duration(300)} style={styles.headerContainer}>
						<TouchableOpacity style={styles.headerBackButton} onPress={() => router.back()}>
							<Text style={styles.backButtonIcon}>‹</Text>
						</TouchableOpacity>
						<View style={styles.header}>
							<Text style={styles.categoryBadge}>{result.category}</Text>
							<Text style={styles.title}>{result.trait_name}</Text>
						</View>
					</Animated.View>

					{/* Result Summary Card */}
					<Animated.View
						entering={FadeInUp.duration(350).delay(100)}
						style={[styles.summaryCard, { borderColor: result.interpretation.color }]}
					>
						<View style={styles.summaryHeader}>
							<Text style={styles.summaryEmoji}>{result.interpretation.emoji}</Text>
							<View style={styles.summaryTitleContainer}>
								<Text style={styles.summaryTitle}>{result.interpretation.title}</Text>
								<View style={[styles.confidenceBadge, { backgroundColor: confidenceBadge.color }]}>
									<Text style={styles.confidenceBadgeText}>
										{confidenceBadge.emoji} {confidenceBadge.text}
									</Text>
								</View>
							</View>
						</View>

						<Text style={styles.summaryDescription}>{result.interpretation.description}</Text>

						{result.result_details.length > 0 && (
							<View style={styles.detailsList}>
								{result.result_details.map((detail, index) => (
									<View key={index} style={styles.detailItem}>
										<Text style={styles.detailBullet}>•</Text>
										<Text style={styles.detailText}>{detail}</Text>
									</View>
								))}
							</View>
						)}

						<View style={styles.summaryStats}>
							<View style={styles.statItem}>
								<Text style={styles.statValue}>{result.snps_found}</Text>
								<Text style={styles.statLabel}>SNPs Found</Text>
							</View>
							<View style={styles.statDivider} />
							<View style={styles.statItem}>
								<Text style={styles.statValue}>{result.primary_snps_found}</Text>
								<Text style={styles.statLabel}>Key Markers</Text>
							</View>
							<View style={styles.statDivider} />
							<View style={styles.statItem}>
								<Text style={styles.statValue}>{result.snps_tested}</Text>
								<Text style={styles.statLabel}>Total Tested</Text>
							</View>
						</View>
					</Animated.View>

					{/* SNP Tables */}
					{renderSnpTable(primarySnps, '🎯 Key Genetic Markers')}
					{renderSnpTable(secondarySnps, '📊 Supporting Markers')}
					{renderSnpTable(tertiarySnps, '📝 Additional Markers')}

					{/* About This Trait */}
					<Animated.View entering={FadeInUp.duration(300).delay(200)} style={styles.aboutCard}>
						<Text style={styles.aboutTitle}>About This Trait</Text>
						<Text style={styles.aboutText}>{result.description}</Text>
					</Animated.View>

					{/* Disclaimer */}
					<Animated.View entering={FadeInUp.duration(300).delay(250)} style={styles.disclaimerCard}>
						<Text style={styles.disclaimerIcon}>⚠️</Text>
						<View style={styles.disclaimerContent}>
							<Text style={styles.disclaimerTitle}>Educational Purposes Only</Text>
							<Text style={styles.disclaimerText}>
								This analysis is for educational and entertainment purposes. Genetic traits are
								complex and influenced by many factors. Results should not be used for medical
								decisions.
							</Text>
						</View>
					</Animated.View>
				</ScrollView>
			</SafeAreaView>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#e0f2e7',
	},
	safeArea: {
		flex: 1,
	},
	scrollView: {
		flex: 1,
	},
	scrollContent: {
		flexGrow: 1,
		paddingBottom: 100,
	},
	errorContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 40,
	},
	errorText: {
		fontSize: 18,
		color: '#666',
		marginBottom: 20,
	},
	backButton: {
		backgroundColor: '#059669',
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 12,
	},
	backButtonText: {
		color: 'white',
		fontSize: 16,
		fontWeight: '700',
	},
	headerContainer: {
		paddingHorizontal: 28,
		paddingTop: 20,
		paddingBottom: 28,
		position: 'relative',
	},
	headerBackButton: {
		position: 'absolute',
		left: 28,
		top: 20,
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: 'rgba(255, 255, 255, 0.95)',
		justifyContent: 'center',
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 4,
		zIndex: 10,
	},
	backButtonIcon: {
		fontSize: 32,
		color: '#059669',
		fontWeight: '600',
		marginTop: -2,
		marginLeft: -2,
	},
	header: {
		alignItems: 'center',
	},
	categoryBadge: {
		fontSize: 13,
		color: '#059669',
		fontWeight: '800',
		textTransform: 'uppercase',
		letterSpacing: 1.2,
		marginBottom: 8,
	},
	title: {
		fontSize: 32,
		fontWeight: '900',
		color: '#0f172a',
		textAlign: 'center',
		letterSpacing: -0.8,
	},
	summaryCard: {
		backgroundColor: 'rgba(255, 255, 255, 0.95)',
		marginHorizontal: 28,
		padding: 28,
		borderRadius: 28,
		marginBottom: 24,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
		borderWidth: 3,
	},
	summaryHeader: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		marginBottom: 20,
	},
	summaryEmoji: {
		fontSize: 48,
		marginRight: 16,
	},
	summaryTitleContainer: {
		flex: 1,
	},
	summaryTitle: {
		fontSize: 26,
		fontWeight: '900',
		color: '#0f172a',
		marginBottom: 10,
		letterSpacing: -0.5,
	},
	confidenceBadge: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 12,
		alignSelf: 'flex-start',
	},
	confidenceBadgeText: {
		fontSize: 12,
		color: 'white',
		fontWeight: '800',
		letterSpacing: 0.5,
	},
	summaryDescription: {
		fontSize: 17,
		color: '#475569',
		lineHeight: 26,
		marginBottom: 20,
		fontWeight: '500',
	},
	detailsList: {
		marginBottom: 24,
		backgroundColor: 'rgba(241, 254, 248, 0.6)',
		padding: 16,
		borderRadius: 16,
	},
	detailItem: {
		flexDirection: 'row',
		marginBottom: 8,
	},
	detailBullet: {
		fontSize: 16,
		color: '#059669',
		fontWeight: '900',
		marginRight: 8,
		marginTop: 2,
	},
	detailText: {
		flex: 1,
		fontSize: 15,
		color: '#475569',
		lineHeight: 22,
		fontWeight: '600',
	},
	summaryStats: {
		flexDirection: 'row',
		justifyContent: 'space-around',
		paddingTop: 20,
		borderTopWidth: 1,
		borderTopColor: '#e2e8f0',
	},
	statItem: {
		alignItems: 'center',
		flex: 1,
	},
	statValue: {
		fontSize: 28,
		fontWeight: '900',
		color: '#059669',
		marginBottom: 4,
	},
	statLabel: {
		fontSize: 12,
		color: '#64748b',
		fontWeight: '600',
		textAlign: 'center',
	},
	statDivider: {
		width: 1,
		backgroundColor: '#e2e8f0',
	},
	tableSection: {
		marginHorizontal: 28,
		marginBottom: 24,
	},
	tableSectionTitle: {
		fontSize: 20,
		fontWeight: '900',
		color: '#0f172a',
		marginBottom: 16,
		letterSpacing: -0.5,
	},
	table: {
		backgroundColor: 'rgba(255, 255, 255, 0.95)',
		borderRadius: 20,
		overflow: 'hidden',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
	},
	tableHeader: {
		flexDirection: 'row',
		backgroundColor: '#059669',
		paddingVertical: 14,
		paddingHorizontal: 16,
	},
	tableHeaderCell: {
		fontSize: 12,
		fontWeight: '800',
		color: 'white',
		textTransform: 'uppercase',
		letterSpacing: 0.5,
	},
	tableRow: {
		flexDirection: 'row',
		paddingVertical: 14,
		paddingHorizontal: 16,
		borderBottomWidth: 1,
		borderBottomColor: '#f1f5f9',
	},
	tableRowEven: {
		backgroundColor: 'white',
	},
	tableRowOdd: {
		backgroundColor: 'rgba(241, 254, 248, 0.3)',
	},
	tableCell: {
		fontSize: 14,
		color: '#334155',
		fontWeight: '600',
		justifyContent: 'center',
	},
	rsidColumn: {
		width: '22%',
	},
	geneColumn: {
		width: '18%',
	},
	genotypeColumn: {
		width: '20%',
	},
	effectColumn: {
		width: '40%',
	},
	rsidText: {
		color: '#059669',
		fontWeight: '800',
		fontSize: 13,
	},
	geneText: {
		color: '#6366f1',
		fontWeight: '700',
	},
	genotypeBadge: {
		backgroundColor: '#e2e8f0',
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 8,
		alignSelf: 'flex-start',
	},
	genotypeBadgeHighlight: {
		backgroundColor: '#fef3c7',
		borderWidth: 1,
		borderColor: '#fbbf24',
	},
	genotypeText: {
		fontSize: 13,
		fontWeight: '900',
		color: '#0f172a',
		letterSpacing: 0.5,
	},
	effectText: {
		fontSize: 13,
		lineHeight: 18,
		color: '#64748b',
	},
	aboutCard: {
		backgroundColor: 'rgba(255, 255, 255, 0.95)',
		marginHorizontal: 28,
		padding: 24,
		borderRadius: 24,
		marginBottom: 20,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
	},
	aboutTitle: {
		fontSize: 20,
		fontWeight: '900',
		color: '#0f172a',
		marginBottom: 12,
		letterSpacing: -0.5,
	},
	aboutText: {
		fontSize: 15,
		color: '#475569',
		lineHeight: 24,
		fontWeight: '500',
	},
	disclaimerCard: {
		backgroundColor: 'rgba(255, 243, 205, 0.8)',
		marginHorizontal: 28,
		padding: 20,
		borderRadius: 20,
		flexDirection: 'row',
		marginBottom: 20,
		borderLeftWidth: 4,
		borderLeftColor: '#f59e0b',
	},
	disclaimerIcon: {
		fontSize: 24,
		marginRight: 12,
	},
	disclaimerContent: {
		flex: 1,
	},
	disclaimerTitle: {
		fontSize: 16,
		fontWeight: '800',
		color: '#92400e',
		marginBottom: 6,
	},
	disclaimerText: {
		fontSize: 14,
		color: '#92400e',
		lineHeight: 20,
		fontWeight: '600',
	},
})
