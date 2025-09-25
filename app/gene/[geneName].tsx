/**
 * Gene detail screen showing all variants for a specific gene
 */

import { useAnalytics } from '@/hooks/useAnalytics'
import { router, useLocalSearchParams } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import React from 'react'
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

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

// ts-prune-ignore-next
export default function GeneDetailScreen() {
	const { geneName } = useLocalSearchParams<{ geneName: string }>()
	const [variants, setVariants] = React.useState<ClinVarVariant[]>([])
	const [loading, setLoading] = React.useState(true)
	const db = useSQLiteContext()

	// Track gene page view with the actual gene name
	const { trackScreen, trackEvent } = useAnalytics({
		trackScreenView: false, // We'll manually track with gene name
	})

	React.useEffect(() => {
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
			// Query all variants for this gene
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
		} catch (error) {
			console.error('Failed to load gene variants:', error)
		} finally {
			setLoading(false)
		}
	}, [geneName, db])

	React.useEffect(() => {
		loadGeneVariants()
	}, [loadGeneVariants])

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
			<View key={index} style={styles.variantCard}>
				<View style={styles.variantHeader}>
					<Text style={styles.rsidText}>{variant.rsid}</Text>
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
					<Text style={styles.positionText}>
						Position: {variant.chrom}:{variant.pos}
					</Text>
					<Text style={styles.alleleText}>
						Alleles: {variant.ref} → {variant.alt}
					</Text>
					<Text style={styles.reviewText}>
						Review Status: {variant.clnrevstat?.replace(/_/g, ' ') || 'Not specified'}
					</Text>
				</View>

				{variant.condition &&
					variant.condition !== 'not_provided' &&
					variant.condition !== 'not_specified' && (
						<View style={styles.conditionsContainer}>
							<Text style={styles.conditionsTitle}>Associated Conditions:</Text>
							{variant.condition.split('|').map((condition, idx) => (
								<Text key={idx} style={styles.conditionText}>
									• {condition.trim().replace(/_/g, ' ')}
								</Text>
							))}
						</View>
					)}

				<TouchableOpacity
					style={styles.geneInfoLink}
					onPress={() => Linking.openURL(`https://genopedia.com/gene/${geneName}`)}
				>
					<View style={styles.linkContent}>
						<View style={styles.linkIconContainer}>
							<Text style={styles.linkIcon}>🔗</Text>
						</View>
						<View style={styles.linkTextContainer}>
							<Text style={styles.linkTitle}>Learn about {geneName}</Text>
							<Text style={styles.linkSubtitle}>View detailed gene information on Genopedia</Text>
						</View>
						<View style={styles.externalIcon}>
							<Text style={styles.externalIconText}>↗</Text>
						</View>
					</View>
				</TouchableOpacity>
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

		return {
			pathogenic,
			likelyPathogenic,
			conflicting,
			uniqueRsids,
			uniqueConditions,
			totalRecords: variants.length,
		}
	}

	if (loading) {
		return (
			<SafeAreaView style={styles.container}>
				<View style={styles.loadingContainer}>
					<Text style={styles.loadingText}>Loading gene details...</Text>
				</View>
			</SafeAreaView>
		)
	}

	const stats = getGeneStats()

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView style={styles.scrollView}>
				<View style={styles.header}>
					<TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
						<Text style={styles.backButtonText}>← Back</Text>
					</TouchableOpacity>

					<View style={styles.geneHeaderContent}>
						<View style={styles.geneTitleContainer}>
							<Text style={styles.geneTitle}>{geneName}</Text>
							<TouchableOpacity
								style={styles.genopediaHeaderButton}
								onPress={() => Linking.openURL(`https://genopedia.com/gene/${geneName}`)}
							>
								<Text style={styles.genopediaHeaderButtonText}>📚 Learn More</Text>
							</TouchableOpacity>
						</View>
						<Text style={styles.subtitle}>
							{stats.totalRecords} ClinVar records • {stats.uniqueRsids} unique variants
						</Text>
					</View>
				</View>

				<View style={styles.statsCard}>
					<Text style={styles.statsTitle}>Summary</Text>
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
					<Text style={styles.variantsTitle}>All Variants</Text>
					{variants.map((variant, index) => renderVariant(variant, index))}
				</View>
			</ScrollView>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#f5f5f5',
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
		color: '#666',
	},
	header: {
		padding: 20,
		backgroundColor: 'white',
		borderBottomWidth: 1,
		borderBottomColor: '#e0e0e0',
	},
	backButton: {
		marginBottom: 12,
	},
	backButtonText: {
		fontSize: 16,
		color: '#4CAF50',
		fontWeight: '600',
	},
	geneTitle: {
		fontSize: 28,
		fontWeight: '700',
		color: '#333',
		marginBottom: 4,
	},
	subtitle: {
		fontSize: 16,
		color: '#666',
	},
	statsCard: {
		backgroundColor: 'white',
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
		color: '#333',
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
		color: '#333',
		marginBottom: 12,
	},
	variantCard: {
		backgroundColor: 'white',
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
		color: '#333',
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
		color: '#666',
		marginBottom: 4,
	},
	alleleText: {
		fontSize: 14,
		color: '#666',
		marginBottom: 4,
	},
	reviewText: {
		fontSize: 14,
		color: '#666',
	},
	conditionsContainer: {
		marginBottom: 12,
	},
	conditionsTitle: {
		fontSize: 14,
		fontWeight: '600',
		color: '#333',
		marginBottom: 4,
	},
	conditionText: {
		fontSize: 14,
		color: '#666',
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
		backgroundColor: '#4CAF50',
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
		backgroundColor: '#f0f8ff',
		marginTop: 16,
		padding: 16,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: '#e3f2fd',
		shadowColor: '#2196f3',
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
		backgroundColor: '#2196f3',
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
		color: '#1976d2',
		marginBottom: 2,
	},
	linkSubtitle: {
		fontSize: 12,
		color: '#666',
		lineHeight: 16,
	},
	externalIcon: {
		width: 24,
		height: 24,
		borderRadius: 12,
		backgroundColor: '#2196f3',
		justifyContent: 'center',
		alignItems: 'center',
	},
	externalIconText: {
		fontSize: 12,
		color: 'white',
		fontWeight: '700',
	},
})
