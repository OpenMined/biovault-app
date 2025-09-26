/**
 * Gene detail screen showing all variants for a specific gene with tabs
 */

import { useAnalytics } from '@/hooks/useAnalytics'
import { router, useLocalSearchParams } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import React, { useState, useEffect } from 'react'
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '@/contexts/ThemeContext'

// Types and UI helpers moved from deleted files
interface ClinVarVariant {
	rsid: string
	chrom: string
	pos: number
	ref: string
	alt: string
	gene: string
	clnsig: string
	clnrevstat: string
	condition: string
	user_genotype?: string
}

interface UserVariant {
	rsid: string
	chromosome: string
	position: string
	genotype: string
}

type MostSignificant =
	| 'Pathogenic'
	| 'Likely_pathogenic'
	| 'Uncertain_significance'
	| 'Conflicting'
	| 'Benign'

function getSignificanceColor(significance: MostSignificant): string {
	switch (significance) {
		case 'Pathogenic':
			return '#d32f2f'
		case 'Likely_pathogenic':
			return '#f57c00'
		case 'Uncertain_significance':
			return '#fbc02d'
		case 'Conflicting':
			return '#7b1fa2'
		case 'Benign':
			return '#388e3c'
		default:
			return '#757575'
	}
}

function getSignificanceDisplayText(significance: MostSignificant): string {
	switch (significance) {
		case 'Pathogenic':
			return 'Pathogenic'
		case 'Likely_pathogenic':
			return 'Likely Pathogenic'
		case 'Uncertain_significance':
			return 'Uncertain'
		case 'Conflicting':
			return 'Conflicting'
		case 'Benign':
			return 'Benign'
		default:
			return 'Unknown'
	}
}

// Check if user has the risk variant
function hasRiskAllele(genotype: string, altAllele: string): boolean {
	// If genotype contains the alternative allele, user has the risk variant
	return genotype.includes(altAllele)
}

// ts-prune-ignore-next
export default function GeneDetailScreen() {
	const { geneName, variants: variantsParam } = useLocalSearchParams<{
		geneName: string
		userDb?: string
		variants?: string
	}>()
	const [variants, setVariants] = useState<ClinVarVariant[]>([])
	const [userMatches, setUserMatches] = useState<(ClinVarVariant & UserVariant)[]>([])
	const [loading, setLoading] = useState(true)
	const [activeTab, setActiveTab] = useState<'matches' | 'news'>('matches')
	const [newsContent, setNewsContent] = useState<string>('')
	const [loadingNews, setLoadingNews] = useState(false)
	const db = useSQLiteContext()
	const { theme } = useTheme()

	// Track gene page view with the actual gene name
	const { trackScreen, trackEvent } = useAnalytics({
		trackScreenView: false, // We'll manually track with gene name
	})

	useEffect(() => {
		if (geneName) {
			// Track the page view with the gene name in the URL
			trackScreen(`gene/${geneName}`, {
				geneName: geneName,
			})
			// Also track as an event
			trackEvent('gene_viewed', {
				geneName: geneName,
			})
		}
	}, [geneName, trackScreen, trackEvent])

	const loadGeneVariants = React.useCallback(async () => {
		if (!geneName) return

		try {
			// If variants were passed from the Insights page, use those
			if (variantsParam) {
				try {
					const passedVariants = JSON.parse(variantsParam) as ClinVarVariant[]
					setVariants(passedVariants)
					// These ARE the user matches since they came from the analysis
					setUserMatches(passedVariants.map(v => ({
						...v,
						chromosome: v.chrom,
						position: v.pos.toString(),
						genotype: v.user_genotype || 'N/A'
					})))
					setLoading(false)
					return
				} catch (e) {
					console.error('Failed to parse passed variants:', e)
				}
			}

			// Fallback: Query all variants for this gene from ClinVar
			const geneVariants = await db.getAllAsync<ClinVarVariant>(
				`SELECT rsid, chrom, pos, ref, alt, gene, clnsig, clnrevstat, condition
				 FROM variants
				 WHERE gene = ?
				 ORDER BY
				   CASE
				     WHEN clnsig LIKE '%Pathogenic%' AND clnsig NOT LIKE '%Likely_pathogenic%' THEN 1
				     WHEN clnsig LIKE '%Likely_pathogenic%' THEN 2
				     WHEN clnsig LIKE '%Conflicting%' THEN 3
				     WHEN clnsig LIKE '%Uncertain%' THEN 4
				     ELSE 5
				   END,
				   rsid`,
				[geneName]
			)

			setVariants(geneVariants)
			// Without a user database, we can't determine matches
			setUserMatches([])
		} catch (error) {
			console.error('Failed to load gene variants:', error)
			setVariants([])
			setUserMatches([])
		} finally {
			setLoading(false)
		}
	}, [geneName, db, variantsParam])

	const loadNewsContent = React.useCallback(async () => {
		if (!geneName || newsContent) return // Don't reload if we already have content

		setLoadingNews(true)
		try {
			const response = await fetch(`https://biovault.net/genes/${geneName.toLowerCase()}`)
			if (response.ok) {
				const html = await response.text()
				// Simple extraction of main content from HTML
				// In production, you'd want to properly parse this
				const contentMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
				if (contentMatch && contentMatch[1]) {
					setNewsContent(contentMatch[1])
				} else {
					setNewsContent('<p>No news content available for this gene yet.</p>')
				}
			} else {
				setNewsContent('<p>Unable to load news content at this time.</p>')
			}
		} catch (error) {
			console.error('Failed to load news:', error)
			setNewsContent('<p>Unable to load news content at this time.</p>')
		} finally {
			setLoadingNews(false)
		}
	}, [geneName, newsContent])

	useEffect(() => {
		loadGeneVariants()
	}, [loadGeneVariants])

	useEffect(() => {
		if (activeTab === 'news') {
			loadNewsContent()
		}
	}, [activeTab, loadNewsContent])

	const renderVariant = (variant: ClinVarVariant, index: number) => {
		const significanceKey =
			variant.clnsig.toLowerCase().includes('pathogenic') &&
			!variant.clnsig.toLowerCase().includes('likely')
				? ('Pathogenic' as const)
				: variant.clnsig.toLowerCase().includes('likely_pathogenic')
				? ('Likely_pathogenic' as const)
				: variant.clnsig.toLowerCase().includes('conflicting')
				? ('Conflicting' as const)
				: variant.clnsig.toLowerCase().includes('uncertain')
				? ('Uncertain_significance' as const)
				: ('Benign' as const)

		const significance = getSignificanceDisplayText(significanceKey)

		return (
			<View key={index} style={[styles.variantCard, { backgroundColor: theme.surface }]}>
				<View style={styles.variantHeader}>
					<Text style={[styles.rsidText, { color: theme.textPrimary }]}>{variant.rsid}</Text>
					<View
						style={[
							styles.significanceTag,
							{ backgroundColor: getSignificanceColor(significanceKey) },
						]}
					>
						<Text style={styles.significanceText}>{significance}</Text>
					</View>
				</View>

				<View style={styles.variantDetails}>
					<Text style={[styles.positionText, { color: theme.textSecondary }]}>
						Position: {variant.chrom}:{variant.pos}
					</Text>
					<Text style={[styles.alleleText, { color: theme.textSecondary }]}>
						Alleles: {variant.ref} → {variant.alt}
					</Text>
					<Text style={[styles.reviewText, { color: theme.textSecondary }]}>
						Review Status: {variant.clnrevstat?.replace(/_/g, ' ') || 'Not specified'}
					</Text>
				</View>

				{variant.condition &&
					variant.condition !== 'not_provided' &&
					variant.condition !== 'not_specified' && (
						<View style={styles.conditionsContainer}>
							<Text style={[styles.conditionsTitle, { color: theme.textPrimary }]}>Associated Conditions:</Text>
							{variant.condition.split('|').map((condition, idx) => (
								<Text key={idx} style={[styles.conditionText, { color: theme.textSecondary }]}>
									• {condition.trim().replace(/_/g, ' ')}
								</Text>
							))}
						</View>
					)}

				<TouchableOpacity
					style={[styles.geneInfoLink, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}
					onPress={() => Linking.openURL(`https://genopedia.com/gene/${geneName}`)}
				>
					<View style={styles.linkContent}>
						<View style={[styles.linkIconContainer, { backgroundColor: theme.primary }]}>
							<Text style={styles.linkIcon}>🔗</Text>
						</View>
						<View style={styles.linkTextContainer}>
							<Text style={[styles.linkTitle, { color: theme.primary }]}>Learn about {geneName}</Text>
							<Text style={[styles.linkSubtitle, { color: theme.textSecondary }]}>View detailed gene information on Genopedia</Text>
						</View>
						<View style={[styles.externalIcon, { backgroundColor: theme.primary }]}>
							<Text style={styles.externalIconText}>↗</Text>
						</View>
					</View>
				</TouchableOpacity>
			</View>
		)
	}

	const renderMatchesTable = () => {
		if (userMatches.length === 0) {
			return (
				<View style={[styles.noMatchesCard, { backgroundColor: theme.warning }]}>
					<Text style={[styles.noMatchesTitle, { color: theme.textPrimary }]}>No Variant Matches Found</Text>
					<Text style={[styles.noMatchesText, { color: theme.textSecondary }]}>
						Many sequencing kits like 23andMe only check for several hundred thousand variants, so your file might be missing these variants.
					</Text>
				</View>
			)
		}

		return (
			<View style={[styles.matchesTableCard, { backgroundColor: theme.surface }]}>
				<Text style={[styles.matchesTitle, { color: theme.textPrimary }]}>Your Variant Matches</Text>
				<View style={styles.tableHeader}>
					<Text style={[styles.tableHeaderText, { flex: 1.2, color: theme.textPrimary }]}>rsID</Text>
					<Text style={[styles.tableHeaderText, { flex: 0.8, color: theme.textPrimary }]}>Your DNA</Text>
					<Text style={[styles.tableHeaderText, { flex: 1, color: theme.textPrimary }]}>Risk Variant</Text>
					<Text style={[styles.tableHeaderText, { flex: 1.2, color: theme.textPrimary }]}>You Have?</Text>
					<Text style={[styles.tableHeaderText, { flex: 1.4, color: theme.textPrimary }]}>Impact</Text>
				</View>
				{userMatches.map((match, index) => {
					const significanceKey =
						match.clnsig.toLowerCase().includes('pathogenic') &&
						!match.clnsig.toLowerCase().includes('likely')
							? ('Pathogenic' as const)
							: match.clnsig.toLowerCase().includes('likely_pathogenic')
							? ('Likely_pathogenic' as const)
							: match.clnsig.toLowerCase().includes('conflicting')
							? ('Conflicting' as const)
							: match.clnsig.toLowerCase().includes('uncertain')
							? ('Uncertain_significance' as const)
							: ('Benign' as const)

					const hasRisk = hasRiskAllele(match.genotype || '', match.alt || '')
					const isPathogenic = significanceKey === 'Pathogenic' || significanceKey === 'Likely_pathogenic'

					return (
						<View key={index} style={[styles.tableRow, { borderBottomColor: theme.border }]}>
							<Text style={[styles.tableCell, { flex: 1.2, color: theme.textPrimary, fontSize: 12 }]}>{match.rsid}</Text>
							<Text style={[styles.tableCell, { flex: 0.8, color: theme.textPrimary, fontWeight: '600' }]}>{match.genotype}</Text>
							<Text style={[styles.tableCell, { flex: 1, color: theme.textSecondary, fontSize: 13 }]}>
								{match.ref}→{match.alt}
							</Text>
							<View style={{ flex: 1.2, alignItems: 'center' }}>
								<View style={{
									backgroundColor: hasRisk
										? (isPathogenic ? '#ffebee' : '#fff3e0')
										: '#e8f5e9',
									paddingHorizontal: 8,
									paddingVertical: 4,
									borderRadius: 6,
								}}>
									<Text style={{
										fontSize: 12,
										fontWeight: '600',
										color: hasRisk
											? (isPathogenic ? '#d32f2f' : '#f57c00')
											: '#2e7d32'
									}}>
										{hasRisk ? '⚠️ YES' : '✅ NO'}
									</Text>
								</View>
							</View>
							<View style={{ flex: 1.4 }}>
								<View
									style={[
										styles.tableSignificanceTag,
										{ backgroundColor: getSignificanceColor(significanceKey) },
									]}
								>
									<Text style={styles.tableSignificanceText}>
										{getSignificanceDisplayText(significanceKey)}
									</Text>
								</View>
							</View>
						</View>
					)
				})}
			</View>
		)
	}

	const getGeneStats = () => {
		const pathogenic = variants.filter(
			(v) =>
				v.clnsig.toLowerCase().includes('pathogenic') && !v.clnsig.toLowerCase().includes('likely')
		).length

		const likelyPathogenic = variants.filter((v) =>
			v.clnsig.toLowerCase().includes('likely_pathogenic')
		).length

		const conflicting = variants.filter((v) =>
			v.clnsig.toLowerCase().includes('conflicting')
		).length

		const uniqueRsids = new Set(variants.map((v) => v.rsid)).size
		const uniqueConditions = new Set(
			variants
				.flatMap((v) => v.condition?.split('|') || [])
				.map((c) => c.trim().replace(/_/g, ' '))
				.filter((c) => c && c !== 'not provided' && c !== 'not specified')
		).size

		// YOUR actual risk counts
		const yourPathogenic = userMatches.filter((v) => {
			const isPath = v.clnsig.toLowerCase().includes('pathogenic') &&
				!v.clnsig.toLowerCase().includes('likely')
			return isPath && hasRiskAllele(v.genotype || '', v.alt || '')
		}).length

		const yourLikelyPathogenic = userMatches.filter((v) => {
			const isLikelyPath = v.clnsig.toLowerCase().includes('likely_pathogenic')
			return isLikelyPath && hasRiskAllele(v.genotype || '', v.alt || '')
		}).length

		const yourBenign = userMatches.filter((v) => {
			const isBenign = v.clnsig.toLowerCase().includes('benign')
			return isBenign
		}).length

		return {
			pathogenic,
			likelyPathogenic,
			conflicting,
			uniqueRsids,
			uniqueConditions,
			totalRecords: variants.length,
			yourPathogenic,
			yourLikelyPathogenic,
			yourBenign,
			yourTotal: userMatches.length,
		}
	}

	if (loading) {
		return (
			<SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
				<View style={styles.loadingContainer}>
					<ActivityIndicator size="large" color={theme.primary} />
					<Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading gene details...</Text>
				</View>
			</SafeAreaView>
		)
	}

	const stats = getGeneStats()

	return (
		<SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
			<View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
				<TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
					<Text style={[styles.backButtonText, { color: theme.primary }]}>← Back</Text>
				</TouchableOpacity>

				<View style={styles.geneHeaderContent}>
					<View style={styles.geneTitleContainer}>
						<Text style={[styles.geneTitle, { color: theme.textPrimary }]}>{geneName}</Text>
						<TouchableOpacity
							style={[styles.genopediaHeaderButton, { backgroundColor: theme.primary }]}
							onPress={() => Linking.openURL(`https://genopedia.com/gene/${geneName}`)}
						>
							<Text style={styles.genopediaHeaderButtonText}>📚 Learn More</Text>
						</TouchableOpacity>
					</View>
					<Text style={[styles.subtitle, { color: theme.textSecondary }]}>
						{stats.totalRecords} ClinVar records • {stats.uniqueRsids} unique variants
					</Text>
				</View>
			</View>

			{/* Tabs */}
			<View style={[styles.tabContainer, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
				<TouchableOpacity
					style={[
						styles.tabButton,
						activeTab === 'matches' && styles.tabButtonActive,
						activeTab === 'matches' && { borderBottomColor: theme.primary }
					]}
					onPress={() => setActiveTab('matches')}
				>
					<Text style={[
						styles.tabText,
						{ color: activeTab === 'matches' ? theme.primary : theme.textSecondary }
					]}>
						Matches
					</Text>
				</TouchableOpacity>
				<TouchableOpacity
					style={[
						styles.tabButton,
						activeTab === 'news' && styles.tabButtonActive,
						activeTab === 'news' && { borderBottomColor: theme.primary }
					]}
					onPress={() => {
						setActiveTab('news')
						trackEvent('gene_news_viewed', { geneName })
					}}
				>
					<Text style={[
						styles.tabText,
						{ color: activeTab === 'news' ? theme.primary : theme.textSecondary }
					]}>
						News
					</Text>
				</TouchableOpacity>
			</View>

			{/* Tab Content */}
			<ScrollView style={styles.scrollView}>
				{activeTab === 'matches' ? (
					<>
						{/* Matches Table at the top */}
						<View style={styles.matchesSection}>
							{renderMatchesTable()}
						</View>

						<View style={[styles.statsCard, { backgroundColor: theme.surface }]}>
							<Text style={[styles.statsTitle, { color: theme.textPrimary }]}>Summary</Text>
							<View style={styles.statsGrid}>
								{stats.pathogenic > 0 && (
									<View style={[styles.statItem, { backgroundColor: '#ffebee' }]}>
										<Text style={[styles.statNumber, { color: '#f44336' }]}>{stats.pathogenic}</Text>
										<Text style={styles.statLabel}>Pathogenic</Text>
									</View>
								)}
								{stats.likelyPathogenic > 0 && (
									<View style={[styles.statItem, { backgroundColor: '#fff3e0' }]}>
										<Text style={[styles.statNumber, { color: '#ff9800' }]}>
											{stats.likelyPathogenic}
										</Text>
										<Text style={styles.statLabel}>Likely Pathogenic</Text>
									</View>
								)}
								{stats.conflicting > 0 && (
									<View style={[styles.statItem, { backgroundColor: '#fce4ec' }]}>
										<Text style={[styles.statNumber, { color: '#e91e63' }]}>{stats.conflicting}</Text>
										<Text style={styles.statLabel}>Conflicting</Text>
									</View>
								)}
								<View style={[styles.statItem, { backgroundColor: '#f3e5f5' }]}>
									<Text style={[styles.statNumber, { color: '#9c27b0' }]}>
										{stats.uniqueConditions}
									</Text>
									<Text style={styles.statLabel}>Conditions</Text>
								</View>
							</View>
						</View>

						<View style={styles.variantsContainer}>
							<Text style={[styles.variantsTitle, { color: theme.textPrimary }]}>All Variants</Text>
							{variants.map((variant, index) => renderVariant(variant, index))}
						</View>
					</>
				) : (
					<View style={styles.newsContainer}>
						{loadingNews ? (
							<View style={styles.newsLoadingContainer}>
								<ActivityIndicator size="large" color={theme.primary} />
								<Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading news...</Text>
							</View>
						) : (
							<View style={[styles.newsCard, { backgroundColor: theme.surface }]}>
								<View style={styles.newsHeader}>
									<Text style={[styles.newsTitle, { color: theme.textPrimary }]}>
										Latest Research & News for {geneName}
									</Text>
									<TouchableOpacity
										onPress={() => Linking.openURL(`https://biovault.net/genes/${geneName.toLowerCase()}`)}
										style={[styles.viewOnWebButton, { borderColor: theme.primary }]}
									>
										<Text style={[styles.viewOnWebText, { color: theme.primary }]}>View on Web ↗</Text>
									</TouchableOpacity>
								</View>
								<View style={styles.newsContent}>
									<Text style={[styles.newsContentText, { color: theme.textSecondary }]}>
										{newsContent ?
											newsContent.replace(/<[^>]*>/g, '').substring(0, 500) + '...' :
											'Loading news content...'
										}
									</Text>
									<TouchableOpacity
										style={[styles.readMoreButton, { backgroundColor: theme.primary }]}
										onPress={() => Linking.openURL(`https://biovault.net/genes/${geneName.toLowerCase()}`)}
									>
										<Text style={styles.readMoreText}>Read Full Article</Text>
									</TouchableOpacity>
								</View>
							</View>
						)}
					</View>
				)}
			</ScrollView>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	scrollView: {
		flex: 1,
	},
	loadingContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
	},
	loadingText: {
		fontSize: 16,
		marginTop: 12,
	},
	header: {
		padding: 20,
		borderBottomWidth: 1,
	},
	backButton: {
		marginBottom: 12,
	},
	backButtonText: {
		fontSize: 16,
		fontWeight: '600',
	},
	geneTitle: {
		fontSize: 28,
		fontWeight: '700',
		marginBottom: 4,
	},
	subtitle: {
		fontSize: 16,
	},
	tabContainer: {
		flexDirection: 'row',
		borderBottomWidth: 1,
	},
	tabButton: {
		flex: 1,
		paddingVertical: 16,
		alignItems: 'center',
		borderBottomWidth: 3,
		borderBottomColor: 'transparent',
	},
	tabButtonActive: {
		borderBottomWidth: 3,
	},
	tabText: {
		fontSize: 16,
		fontWeight: '600',
	},
	matchesSection: {
		paddingHorizontal: 20,
		paddingTop: 20,
	},
	matchesTableCard: {
		borderRadius: 12,
		padding: 16,
		marginBottom: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	matchesTitle: {
		fontSize: 18,
		fontWeight: '600',
		marginBottom: 12,
	},
	tableHeader: {
		flexDirection: 'row',
		paddingBottom: 8,
		borderBottomWidth: 1,
		borderBottomColor: '#e0e0e0',
		marginBottom: 8,
	},
	tableHeaderText: {
		fontSize: 14,
		fontWeight: '600',
	},
	tableRow: {
		flexDirection: 'row',
		paddingVertical: 8,
		borderBottomWidth: 1,
		alignItems: 'center',
	},
	tableCell: {
		fontSize: 14,
	},
	tableSignificanceTag: {
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 12,
		alignSelf: 'flex-start',
	},
	tableSignificanceText: {
		fontSize: 12,
		fontWeight: '600',
		color: 'white',
	},
	noMatchesCard: {
		borderRadius: 12,
		padding: 16,
		marginBottom: 16,
	},
	noMatchesTitle: {
		fontSize: 18,
		fontWeight: '600',
		marginBottom: 8,
	},
	noMatchesText: {
		fontSize: 14,
		lineHeight: 20,
	},
	newsContainer: {
		padding: 20,
	},
	newsLoadingContainer: {
		paddingVertical: 40,
		alignItems: 'center',
	},
	newsCard: {
		borderRadius: 12,
		padding: 20,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	newsHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 16,
	},
	newsTitle: {
		fontSize: 20,
		fontWeight: '700',
		flex: 1,
		marginRight: 12,
	},
	viewOnWebButton: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 8,
		borderWidth: 1,
	},
	viewOnWebText: {
		fontSize: 14,
		fontWeight: '600',
	},
	newsContent: {
		marginTop: 12,
	},
	newsContentText: {
		fontSize: 16,
		lineHeight: 24,
		marginBottom: 20,
	},
	readMoreButton: {
		paddingVertical: 12,
		paddingHorizontal: 20,
		borderRadius: 8,
		alignItems: 'center',
	},
	readMoreText: {
		color: 'white',
		fontSize: 16,
		fontWeight: '600',
	},
	statsCard: {
		marginHorizontal: 20,
		marginVertical: 16,
		padding: 16,
		borderRadius: 12,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	statsTitle: {
		fontSize: 18,
		fontWeight: '600',
		marginBottom: 12,
	},
	statsGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'space-between',
	},
	statItem: {
		width: '48%',
		padding: 12,
		borderRadius: 8,
		alignItems: 'center',
		marginBottom: 8,
	},
	statNumber: {
		fontSize: 18,
		fontWeight: '700',
	},
	statLabel: {
		fontSize: 12,
		color: '#666',
		textAlign: 'center',
		marginTop: 4,
	},
	variantsContainer: {
		paddingHorizontal: 20,
	},
	variantsTitle: {
		fontSize: 20,
		fontWeight: '600',
		marginBottom: 12,
	},
	variantCard: {
		padding: 16,
		borderRadius: 12,
		marginBottom: 12,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 2,
		elevation: 2,
	},
	variantHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 12,
	},
	rsidText: {
		fontSize: 18,
		fontWeight: '600',
	},
	significanceTag: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 16,
	},
	significanceText: {
		fontSize: 12,
		fontWeight: '600',
		color: 'white',
	},
	variantDetails: {
		marginBottom: 12,
	},
	positionText: {
		fontSize: 14,
		marginBottom: 4,
	},
	alleleText: {
		fontSize: 14,
		marginBottom: 4,
	},
	reviewText: {
		fontSize: 14,
	},
	conditionsContainer: {
		marginBottom: 12,
	},
	conditionsTitle: {
		fontSize: 14,
		fontWeight: '600',
		marginBottom: 4,
	},
	conditionText: {
		fontSize: 14,
		marginLeft: 8,
	},
	geneHeaderContent: {
		flex: 1,
	},
	geneTitleContainer: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 8,
	},
	genopediaHeaderButton: {
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 12,
	},
	genopediaHeaderButtonText: {
		color: 'white',
		fontSize: 14,
		fontWeight: '600',
	},
	geneInfoLink: {
		marginTop: 16,
		padding: 16,
		borderRadius: 12,
		borderWidth: 1,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	linkContent: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	linkIconContainer: {
		width: 40,
		height: 40,
		borderRadius: 20,
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 12,
	},
	linkIcon: {
		fontSize: 18,
		color: 'white',
	},
	linkTextContainer: {
		flex: 1,
	},
	linkTitle: {
		fontSize: 16,
		fontWeight: '700',
		marginBottom: 2,
	},
	linkSubtitle: {
		fontSize: 12,
		lineHeight: 16,
	},
	externalIcon: {
		width: 24,
		height: 24,
		borderRadius: 12,
		justifyContent: 'center',
		alignItems: 'center',
	},
	externalIconText: {
		fontSize: 12,
		color: 'white',
		fontWeight: '700',
	},
})