/**
 * References tab - shows scientific databases used for variant comparison
 */

import React, { useState } from 'react'
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
	ActivityIndicator,
	Alert,
	Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useSQLiteContext } from 'expo-sqlite'
import { getDatabaseStats, type ClinVarVariant } from '@/lib/database'

interface PreviewData {
	stats: {
		totalVariants: number
		pathogenicCount: number
		likelyPathogenicCount: number
		uncertainCount: number
	}
	sampleRows: ClinVarVariant[]
}

export default function ReferencesScreen() {
	const [previewData, setPreviewData] = useState<PreviewData | null>(null)
	const [previewLoading, setPreviewLoading] = useState(false)
	const [showingPreview, setShowingPreview] = useState(false)
	const db = useSQLiteContext()

	const openLink = (url: string) => {
		Linking.openURL(url)
	}

	const showClinVarPreview = async () => {
		setPreviewLoading(true)
		setShowingPreview(true)

		try {
			// Get ClinVar stats
			const stats = await getDatabaseStats(db)

			// Get sample pathogenic rows
			const sampleRows = await db.getAllAsync<ClinVarVariant>(
				`SELECT rsid, chrom, pos, gene, clnsig, clnrevstat, condition
				 FROM variants
				 WHERE clnsig LIKE '%Pathogenic%'
				 ORDER BY gene
				 LIMIT 5`
			)

			setPreviewData({ stats, sampleRows })
		} catch (error) {
			console.error('Failed to preview ClinVar:', error)
			Alert.alert('Error', `Failed to preview database: ${error}`)
		} finally {
			setPreviewLoading(false)
		}
	}

	const renderSignificanceTag = (significance: string) => {
		let color = '#666'
		if (significance.toLowerCase().includes('pathogenic')) {
			color = significance.toLowerCase().includes('likely') ? '#ff9800' : '#f44336'
		} else if (significance.toLowerCase().includes('uncertain')) {
			color = '#9e9e9e'
		}

		return (
			<View style={[styles.significanceTag, { backgroundColor: color }]}>
				<Text style={styles.significanceText}>{significance}</Text>
			</View>
		)
	}

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView style={styles.scrollView}>
				<View style={styles.header}>
					<Text style={styles.title}>Reference Databases</Text>
					<Text style={styles.subtitle}>
						Scientific databases used to interpret your genetic variants
					</Text>
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Current Databases</Text>

					<View style={styles.databaseCard}>
						<View style={styles.databaseHeader}>
							<Text style={styles.databaseName}>ClinVar</Text>
							<View style={[styles.statusBadge, { backgroundColor: '#4CAF50' }]}>
								<Text style={styles.statusText}>Active</Text>
							</View>
						</View>

						<Text style={styles.databaseDescription}>
							Public archive of reports of human genetic variants and their relationships to
							phenotypes. Maintained by NCBI.
						</Text>

						<View style={styles.databaseDetails}>
							<Text style={styles.detailText}>• Clinical variant interpretations</Text>
							<Text style={styles.detailText}>• Filtered to consumer genetics positions</Text>
							<Text style={styles.detailText}>• Updated monthly from NCBI</Text>
							<Text style={styles.detailText}>• GRCh37/hg19 reference genome</Text>
						</View>

						<View style={styles.buttonRow}>
							<TouchableOpacity style={styles.previewButton} onPress={showClinVarPreview}>
								<Text style={styles.previewButtonText}>Preview Data</Text>
							</TouchableOpacity>

							<TouchableOpacity
								style={styles.learnMoreButton}
								onPress={() => openLink('https://www.ncbi.nlm.nih.gov/clinvar/')}
							>
								<Text style={styles.learnMoreText}>Learn More</Text>
							</TouchableOpacity>
						</View>
					</View>

					{/* Future databases */}
					<View style={styles.futureDatabaseCard}>
						<View style={styles.databaseHeader}>
							<Text style={styles.databaseName}>gnomAD</Text>
							<View style={[styles.statusBadge, { backgroundColor: '#FFC107' }]}>
								<Text style={styles.statusText}>Coming Soon</Text>
							</View>
						</View>

						<Text style={styles.databaseDescription}>
							Genome Aggregation Database with population frequency data for genetic variants.
						</Text>

						<TouchableOpacity
							style={styles.learnMoreButton}
							onPress={() => openLink('https://gnomad.broadinstitute.org/')}
						>
							<Text style={styles.learnMoreText}>Learn More</Text>
						</TouchableOpacity>
					</View>

					<View style={styles.futureDatabaseCard}>
						<View style={styles.databaseHeader}>
							<Text style={styles.databaseName}>COSMIC</Text>
							<View style={[styles.statusBadge, { backgroundColor: '#FFC107' }]}>
								<Text style={styles.statusText}>Coming Soon</Text>
							</View>
						</View>

						<Text style={styles.databaseDescription}>
							Catalogue of Somatic Mutations in Cancer for oncology-related variant interpretation.
						</Text>

						<TouchableOpacity
							style={styles.learnMoreButton}
							onPress={() => openLink('https://cancer.sanger.ac.uk/cosmic')}
						>
							<Text style={styles.learnMoreText}>Learn More</Text>
						</TouchableOpacity>
					</View>
				</View>

				{showingPreview && (
					<View style={styles.previewCard}>
						<Text style={styles.previewTitle}>ClinVar Database Preview</Text>

						{previewLoading ? (
							<View style={styles.previewLoading}>
								<ActivityIndicator color="#4CAF50" />
								<Text style={styles.previewLoadingText}>Loading preview...</Text>
							</View>
						) : (
							previewData && (
								<>
									<View style={styles.statsContainer}>
										<Text style={styles.statsTitle}>Database Statistics</Text>
										<View style={styles.statsGrid}>
											<View style={styles.statItem}>
												<Text style={styles.statNumber}>
													{previewData.stats.totalVariants.toLocaleString()}
												</Text>
												<Text style={styles.statLabel}>Total Variants</Text>
											</View>
											<View style={styles.statItem}>
												<Text style={styles.statNumber}>
													{previewData.stats.pathogenicCount.toLocaleString()}
												</Text>
												<Text style={styles.statLabel}>Pathogenic</Text>
											</View>
											<View style={styles.statItem}>
												<Text style={styles.statNumber}>
													{previewData.stats.likelyPathogenicCount.toLocaleString()}
												</Text>
												<Text style={styles.statLabel}>Likely Pathogenic</Text>
											</View>
											<View style={styles.statItem}>
												<Text style={styles.statNumber}>
													{previewData.stats.uncertainCount.toLocaleString()}
												</Text>
												<Text style={styles.statLabel}>Uncertain</Text>
											</View>
										</View>
									</View>

									<View style={styles.sampleContainer}>
										<Text style={styles.sampleTitle}>Sample Records</Text>
										{previewData.sampleRows.map((variant, idx) => (
											<View key={idx} style={styles.variantCard}>
												<View style={styles.variantHeader}>
													<Text style={styles.rsidText}>{variant.rsid}</Text>
													{renderSignificanceTag(variant.clnsig)}
												</View>
												<Text style={styles.geneText}>Gene: {variant.gene || 'Unknown'}</Text>
												<Text style={styles.positionText}>
													Position: {variant.chrom}:{variant.pos}
												</Text>
												<Text style={styles.conditionText} numberOfLines={2}>
													Condition: {variant.condition?.replace(/_/g, ' ') || 'Not specified'}
												</Text>
											</View>
										))}
									</View>

									<TouchableOpacity
										style={styles.closePreviewButton}
										onPress={() => setShowingPreview(false)}
									>
										<Text style={styles.closePreviewText}>Close Preview</Text>
									</TouchableOpacity>
								</>
							)
						)}
					</View>
				)}

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>About Reference Data</Text>

					<View style={styles.infoCard}>
						<Text style={styles.infoTitle}>Data Quality</Text>
						<Text style={styles.infoText}>
							All reference databases are curated from peer-reviewed research and clinical studies.
							Interpretations are regularly updated as new evidence emerges.
						</Text>
					</View>

					<View style={styles.infoCard}>
						<Text style={styles.infoTitle}>Coverage</Text>
						<Text style={styles.infoText}>
							Current databases focus on variants tested by consumer genetics companies like 23andMe
							and AncestryDNA. Clinical-grade sequencing coverage coming soon.
						</Text>
					</View>

					<View style={styles.infoCard}>
						<Text style={styles.infoTitle}>Updates</Text>
						<Text style={styles.infoText}>
							Reference databases are updated monthly to include the latest clinical interpretations
							and newly discovered variant-disease associations.
						</Text>
					</View>
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
	header: {
		padding: 20,
		paddingBottom: 10,
	},
	title: {
		fontSize: 28,
		fontWeight: '700',
		color: '#333',
		marginBottom: 4,
	},
	subtitle: {
		fontSize: 16,
		color: '#666',
	},
	section: {
		marginBottom: 24,
	},
	sectionTitle: {
		fontSize: 20,
		fontWeight: '600',
		color: '#333',
		marginBottom: 12,
		marginHorizontal: 20,
	},
	databaseCard: {
		backgroundColor: 'white',
		marginHorizontal: 20,
		marginVertical: 8,
		borderRadius: 12,
		padding: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	futureDatabaseCard: {
		backgroundColor: '#f8f9fa',
		marginHorizontal: 20,
		marginVertical: 8,
		borderRadius: 12,
		padding: 16,
		borderWidth: 1,
		borderColor: '#e0e0e0',
		opacity: 0.7,
	},
	databaseHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 12,
	},
	databaseName: {
		fontSize: 18,
		fontWeight: '600',
		color: '#333',
		flex: 1,
	},
	statusBadge: {
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 12,
	},
	statusText: {
		fontSize: 12,
		fontWeight: '600',
		color: 'white',
	},
	databaseDescription: {
		fontSize: 14,
		color: '#666',
		lineHeight: 20,
		marginBottom: 12,
	},
	databaseDetails: {
		marginBottom: 16,
	},
	detailText: {
		fontSize: 14,
		color: '#666',
		marginBottom: 4,
	},
	buttonRow: {
		flexDirection: 'row',
		gap: 8,
	},
	previewButton: {
		backgroundColor: '#4CAF50',
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 8,
		flex: 1,
		alignItems: 'center',
	},
	previewButtonText: {
		color: 'white',
		fontWeight: '600',
		fontSize: 14,
	},
	learnMoreButton: {
		backgroundColor: '#e3f2fd',
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 8,
		flex: 1,
		alignItems: 'center',
	},
	learnMoreText: {
		color: '#1976d2',
		fontWeight: '600',
		fontSize: 14,
	},
	previewCard: {
		backgroundColor: 'white',
		marginHorizontal: 20,
		marginVertical: 8,
		borderRadius: 12,
		padding: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	previewTitle: {
		fontSize: 20,
		fontWeight: '600',
		color: '#333',
		marginBottom: 16,
	},
	previewLoading: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 20,
	},
	previewLoadingText: {
		marginLeft: 8,
		color: '#666',
	},
	statsContainer: {
		marginBottom: 20,
	},
	statsTitle: {
		fontSize: 16,
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
		backgroundColor: '#f8f9fa',
		padding: 12,
		borderRadius: 8,
		marginBottom: 8,
		alignItems: 'center',
	},
	statNumber: {
		fontSize: 18,
		fontWeight: '700',
		color: '#4CAF50',
	},
	statLabel: {
		fontSize: 12,
		color: '#666',
		textAlign: 'center',
		marginTop: 4,
	},
	sampleContainer: {
		marginBottom: 20,
	},
	sampleTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#333',
		marginBottom: 12,
	},
	variantCard: {
		backgroundColor: '#f8f9fa',
		padding: 12,
		borderRadius: 8,
		marginBottom: 8,
	},
	variantHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 8,
	},
	rsidText: {
		fontSize: 16,
		fontWeight: '600',
		color: '#333',
	},
	significanceTag: {
		paddingHorizontal: 8,
		paddingVertical: 2,
		borderRadius: 12,
	},
	significanceText: {
		fontSize: 10,
		fontWeight: '600',
		color: 'white',
	},
	geneText: {
		fontSize: 14,
		color: '#666',
		marginBottom: 2,
	},
	positionText: {
		fontSize: 14,
		color: '#666',
		marginBottom: 2,
	},
	conditionText: {
		fontSize: 14,
		color: '#666',
	},
	closePreviewButton: {
		backgroundColor: '#666',
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 8,
		alignSelf: 'center',
	},
	closePreviewText: {
		color: 'white',
		fontWeight: '600',
		fontSize: 14,
	},
	infoCard: {
		backgroundColor: 'white',
		marginHorizontal: 20,
		marginVertical: 6,
		padding: 16,
		borderRadius: 12,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	infoTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#333',
		marginBottom: 8,
	},
	infoText: {
		fontSize: 14,
		color: '#666',
		lineHeight: 20,
	},
})
