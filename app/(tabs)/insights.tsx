/**
 * Analyze tab - ClinVar analysis and gene matching
 */

import { lookupVariantsByRsid, type ClinVarVariant } from '@/lib/database'
import {
	getRsidsFromUserDatabase,
	listUserGenomeDatabases,
	type UserGenomeDatabase,
} from '@/lib/fast-genome-storage'
import {
	getSignificanceColor,
	getSignificanceDisplayText,
	groupVariantsByGene,
	type GeneGroup,
} from '@/lib/gene-grouping'
import { useFocusEffect } from '@react-navigation/native'
import { Link, useLocalSearchParams } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import React, { useEffect, useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	Linking,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { SafeAreaView } from 'react-native-safe-area-context'

interface ReferenceDatabase {
	id: string
	name: string
	description: string
	enabled: boolean
	recordCount: number
}

interface AnalyzeState {
	isLoading: boolean
	loadingMessage: string
	userDatabases: UserGenomeDatabase[]
	selectedDatabase: UserGenomeDatabase | null
	referenceDatabases: ReferenceDatabase[]
	matches: ClinVarVariant[]
	geneGroups: GeneGroup[]
	filteredGeneGroups: GeneGroup[]
	hasSearched: boolean
	searchQuery: string
}

export default function DiscoverScreen() {
	const { selectedDb } = useLocalSearchParams<{ selectedDb?: string }>()
	const db = useSQLiteContext()

	const [state, setState] = useState<AnalyzeState>({
		isLoading: false,
		loadingMessage: '',
		userDatabases: [],
		selectedDatabase: null,
		referenceDatabases: [
			{
				id: 'clinvar',
				name: 'ClinVar',
				description: 'Clinical significance of human genetic variants',
				enabled: true,
				recordCount: 0, // Will be loaded from actual database
			},
			// Future reference databases can be added here
		],
		matches: [],
		geneGroups: [],
		filteredGeneGroups: [],
		hasSearched: false,
		searchQuery: '',
	})

	const loadUserDatabases = React.useCallback(async () => {
		try {
			const databases = await listUserGenomeDatabases()
			setState((prev) => {
				// Auto-select database if passed via URL parameter
				let selectedDatabase = prev.selectedDatabase
				if (selectedDb && !selectedDatabase) {
					selectedDatabase = databases.find((db) => db.dbName === selectedDb) || null
				}

				return {
					...prev,
					userDatabases: databases,
					selectedDatabase,
				}
			})
		} catch (error) {
			console.error('Failed to load user databases:', error)
		}
	}, [selectedDb])

	const loadClinVarRecordCount = React.useCallback(async () => {
		try {
			// Get the actual record count from the ClinVar SQLite database
			const result = await db.getFirstAsync<{ count: number }>(
				'SELECT COUNT(*) as count FROM variants'
			)
			const recordCount = result?.count || 0

			setState((prev) => ({
				...prev,
				referenceDatabases: prev.referenceDatabases.map((db) =>
					db.id === 'clinvar' ? { ...db, recordCount } : db
				),
			}))

			console.log(`ClinVar database contains ${recordCount.toLocaleString()} records`)
		} catch (error) {
			console.error('Failed to load ClinVar record count:', error)
			// Keep default value of 0 if query fails
		}
	}, [db])

	useEffect(() => {
		loadUserDatabases()
		loadClinVarRecordCount()
	}, [loadUserDatabases, loadClinVarRecordCount])

	useFocusEffect(
		React.useCallback(() => {
			loadUserDatabases()
		}, [loadUserDatabases])
	)

	const selectDatabaseForAnalysis = (database: UserGenomeDatabase) => {
		setState((prev) => ({
			...prev,
			selectedDatabase: database,
			matches: [],
			geneGroups: [],
			filteredGeneGroups: [],
			hasSearched: false,
			searchQuery: '',
		}))
	}

	const runClinVarAnalysis = async () => {
		if (!state.selectedDatabase) return

		setState((prev) => ({
			...prev,
			isLoading: true,
			loadingMessage: 'Searching for ClinVar matches...',
			geneGroups: [],
		}))

		try {
			// Get all rsIDs from user database
			const rsids = await getRsidsFromUserDatabase(state.selectedDatabase.dbName)

			console.log(`Searching ${rsids.length} rsIDs against ClinVar database...`)

			// Query database for matches
			const matches = await lookupVariantsByRsid(db, rsids)

			console.log(`Found ${matches.length} matches`)

			// Group matches by gene
			const geneGroups = groupVariantsByGene(matches)

			setState((prev) => ({
				...prev,
				matches,
				geneGroups,
				filteredGeneGroups: geneGroups,
				hasSearched: true,
				isLoading: false,
			}))
		} catch (error) {
			console.error('Analysis error:', error)
			setState((prev) => ({ ...prev, isLoading: false }))
			Alert.alert('Analysis Error', `Failed to analyze data: ${error}`)
		}
	}

	const handleSearch = (query: string) => {
		setState((prev) => ({ ...prev, searchQuery: query }))

		if (!query.trim()) {
			setState((prev) => ({ ...prev, filteredGeneGroups: prev.geneGroups }))
			return
		}

		const filtered = state.geneGroups.filter((geneGroup) => {
			const searchLower = query.toLowerCase()
			return (
				geneGroup.gene.toLowerCase().includes(searchLower) ||
				geneGroup.conditions.some((condition) => condition.toLowerCase().includes(searchLower)) ||
				geneGroup.mostSignificant.toLowerCase().includes(searchLower) ||
				geneGroup.variants.some((variant) => variant.rsid.toLowerCase().includes(searchLower))
			)
		})

		setState((prev) => ({ ...prev, filteredGeneGroups: filtered }))
	}

	const renderDatabaseSelector = () => {
		if (state.userDatabases.length === 0) return null

		return (
			<View style={styles.selectorSection}>
				<Text style={styles.selectorTitle}>Select DNA File to Analyze</Text>

				{state.userDatabases.map((database, index) => (
					<TouchableOpacity
						key={index}
						style={[
							styles.premiumDatabaseOption,
							state.selectedDatabase?.dbName === database.dbName && styles.selectedDatabase,
						]}
						onPress={() => selectDatabaseForAnalysis(database)}
					>
						<View style={styles.databaseCardHeader}>
							<View style={styles.databaseIconContainer}>
								<Text style={styles.databaseIcon}>🧬</Text>
							</View>
							<View style={styles.databaseInfo}>
								<Text style={styles.databaseName}>{database.fileName}</Text>
								<Text style={styles.databaseStats}>
									{database.totalVariants.toLocaleString()} variants •{' '}
									{database.rsidCount.toLocaleString()} rsIDs
								</Text>
							</View>
							{state.selectedDatabase?.dbName === database.dbName && (
								<View style={styles.selectedIndicator}>
									<Text style={styles.selectedIndicatorText}>✓</Text>
								</View>
							)}
						</View>
					</TouchableOpacity>
				))}

				{state.selectedDatabase && (
					<TouchableOpacity
						style={[styles.premiumAnalyzeButton, state.isLoading && styles.analyzeButtonDisabled]}
						onPress={runClinVarAnalysis}
						disabled={state.isLoading}
					>
						<Text
							style={[
								styles.premiumAnalyzeButtonText,
								state.isLoading && styles.analyzeButtonTextDisabled,
							]}
						>
							{state.isLoading ? '🔄 Analyzing...' : '🔬 Run ClinVar Analysis'}
						</Text>
					</TouchableOpacity>
				)}

				{renderAnalysisProgress()}
			</View>
		)
	}

	const renderResults = () => {
		if (!state.hasSearched) return null

		if (state.geneGroups.length === 0) {
			return (
				<View style={styles.noResultsCard}>
					<View style={styles.noResultsIllustration}>
						<Text style={styles.noResultsIcon}>🔍</Text>
					</View>
					<Text style={styles.noResultsTitle}>No Clinical Variants Found</Text>
					<Text style={styles.noResultsText}>
						Your genetic variants don&apos;t have known clinical significance in ClinVar, which is
						actually good news! This suggests your variants are likely benign.
					</Text>
				</View>
			)
		}

		// Group genes by significance for better organization
		const pathogenicGenes = state.filteredGeneGroups.filter((g) => g.pathogenicCount > 0)
		const uncertainGenes = state.filteredGeneGroups.filter(
			(g) => g.mostSignificant.includes('Uncertain') && g.pathogenicCount === 0
		)
		const otherGenes = state.filteredGeneGroups.filter(
			(g) => !g.mostSignificant.includes('Uncertain') && g.pathogenicCount === 0
		)

		return (
			<View style={styles.resultsSection}>
				<View style={styles.resultsHeader}>
					<Text style={styles.resultsTitle}>🧬 Your Genetic Analysis</Text>
					<Text style={styles.resultsSummary}>
						Found {state.matches.length} matches in {state.geneGroups.length} genes
					</Text>
				</View>

				<View style={styles.searchContainer}>
					<TextInput
						style={styles.searchInput}
						placeholder="Search genes, conditions, or rsIDs..."
						value={state.searchQuery}
						onChangeText={handleSearch}
						clearButtonMode="while-editing"
						returnKeyType="search"
					/>
					{state.searchQuery && (
						<Text style={styles.searchResults}>
							Showing {state.filteredGeneGroups.length} of {state.geneGroups.length} genes
						</Text>
					)}
				</View>

				{pathogenicGenes.length > 0 && (
					<View style={styles.categorySection}>
						<Text style={styles.categoryTitle}>⚠️ Clinically Significant Variants</Text>
						<Text style={styles.categoryDescription}>
							These genes have variants with known clinical significance
						</Text>
						{pathogenicGenes
							.slice(0, 10)
							.map((geneGroup, index) => renderGeneCard(geneGroup, index))}
					</View>
				)}

				{uncertainGenes.length > 0 && (
					<View style={styles.categorySection}>
						<Text style={styles.categoryTitle}>❓ Variants of Uncertain Significance</Text>
						<Text style={styles.categoryDescription}>
							These variants have unclear clinical impact
						</Text>
						{uncertainGenes
							.slice(0, 10)
							.map((geneGroup, index) => renderGeneCard(geneGroup, index + pathogenicGenes.length))}
					</View>
				)}

				{otherGenes.length > 0 && (
					<View style={styles.categorySection}>
						<Text style={styles.categoryTitle}>📊 Other Genetic Variants</Text>
						<Text style={styles.categoryDescription}>
							Additional variants found in your genetic data
						</Text>
						{otherGenes
							.slice(0, 10)
							.map((geneGroup, index) =>
								renderGeneCard(geneGroup, index + pathogenicGenes.length + uncertainGenes.length)
							)}
					</View>
				)}

				{state.filteredGeneGroups.length > 30 && (
					<View style={styles.moreResultsCard}>
						<Text style={styles.moreResultsText}>
							... and {state.filteredGeneGroups.length - 30} more genes
						</Text>
						<Text style={styles.moreResultsHint}>Use search to find specific genes</Text>
					</View>
				)}
			</View>
		)
	}

	const renderGeneCard = (geneGroup: any, index: number) => (
		<View key={index} style={styles.geneCard}>
			<View style={styles.geneCardHeader}>
				<View style={styles.geneInfo}>
					<Text style={styles.geneName}>{geneGroup.gene}</Text>
					<View
						style={[
							styles.significanceTag,
							{ backgroundColor: getSignificanceColor(geneGroup.mostSignificant) },
						]}
					>
						<Text style={styles.significanceText}>
							{getSignificanceDisplayText(geneGroup.mostSignificant)}
						</Text>
					</View>
				</View>
				<TouchableOpacity
					style={styles.genopediaButton}
					onPress={() => Linking.openURL(`https://genopedia.com/gene/${geneGroup.gene}`)}
				>
					<Text style={styles.genopediaButtonText}>Learn More</Text>
				</TouchableOpacity>
			</View>

			<View style={styles.geneStats}>
				<Text style={styles.variantCount}>
					{geneGroup.uniqueRsids} variants • {geneGroup.totalVariants} records
				</Text>
				{geneGroup.pathogenicCount > 0 && (
					<Text style={styles.pathogenicCount}>
						{geneGroup.pathogenicCount} pathogenic variants
					</Text>
				)}
			</View>

			{geneGroup.conditions.length > 0 && (
				<View style={styles.conditionsContainer}>
					<Text style={styles.conditionsLabel}>Associated conditions:</Text>
					<Text style={styles.conditionsText} numberOfLines={3}>
						{geneGroup.conditions.slice(0, 3).join(', ')}
						{geneGroup.conditions.length > 3 && '...'}
					</Text>
				</View>
			)}

			<View style={styles.geneCardFooter}>
				<Link href={`/gene/${encodeURIComponent(geneGroup.gene)}`} asChild>
					<TouchableOpacity style={styles.viewDetailsButton}>
						<Text style={styles.viewDetailsButtonText}>View All Variants →</Text>
					</TouchableOpacity>
				</Link>
			</View>
		</View>
	)

	const renderAnalysisProgress = () => {
		if (!state.isLoading) return null

		return (
			<View style={styles.analysisProgressCard}>
				<View style={styles.analysisProgressHeader}>
					<Text style={styles.analysisProgressTitle}>🔬 Running Analysis</Text>
					<ActivityIndicator size="small" color="#4CAF50" />
				</View>
				<Text style={styles.analysisProgressMessage}>{state.loadingMessage}</Text>
				<View style={styles.analysisProgressBar}>
					<View style={styles.analysisProgressFill} />
				</View>
			</View>
		)
	}

	if (state.userDatabases.length === 0) {
		return (
			<SafeAreaView style={styles.container}>
				<View style={styles.emptyContainer}>
					<View style={styles.emptyIllustration}>
						<View style={styles.dnaHelix}>
							<Text style={styles.helixText}>🧬</Text>
						</View>
						<View style={styles.emptyIconContainer}>
							<Text style={styles.emptyIcon}>📊</Text>
						</View>
					</View>

					<Text style={styles.emptyTitle}>Ready to Discover Your Genetics?</Text>
					<Text style={styles.emptyText}>
						Upload your genetic data to unlock personalized insights and comprehensive analysis
					</Text>

					<View style={styles.emptyFeatures}>
						<View style={styles.emptyFeature}>
							<Text style={styles.featureIcon}>🔬</Text>
							<Text style={styles.featureText}>ClinVar Analysis</Text>
						</View>
						<View style={styles.emptyFeature}>
							<Text style={styles.featureIcon}>🧬</Text>
							<Text style={styles.featureText}>Gene Insights</Text>
						</View>
						<View style={styles.emptyFeature}>
							<Text style={styles.featureIcon}>📈</Text>
							<Text style={styles.featureText}>Variant Reports</Text>
						</View>
					</View>

					<Link href="/" asChild>
						<TouchableOpacity style={styles.premiumUploadButton}>
							<Text style={styles.premiumUploadButtonText}>🚀 Upload Your DNA Data</Text>
						</TouchableOpacity>
					</Link>

					<View style={styles.supportedFormatsPreview}>
						<Text style={styles.supportedText}>
							Supports: 23andMe, AncestryDNA, MyHeritage & more
						</Text>
					</View>
				</View>
			</SafeAreaView>
		)
	}

	return (
		<SafeAreaView style={styles.container}>
			<KeyboardAwareScrollView
				style={styles.scrollView}
				contentContainerStyle={styles.scrollContent}
				showsVerticalScrollIndicator={false}
			>
				<View style={styles.header}>
					<View style={styles.headerContent}>
						<Text style={styles.title}>Insights</Text>
						<Text style={styles.subtitle}>Discover what your genetic data reveals</Text>
					</View>
				</View>

				{renderDatabaseSelector()}
				{renderResults()}

				<View style={styles.disclaimer}>
					<Text style={styles.disclaimerTitle}>⚠️ Important Notice</Text>
					<Text style={styles.disclaimerText}>
						This tool is for educational and research purposes only. Results are not medical advice.
						All data processing happens locally on your device - no genetic information is uploaded
						to servers.
					</Text>
				</View>
			</KeyboardAwareScrollView>
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
	scrollContent: {
		flexGrow: 1,
		paddingBottom: 100, // Increased padding for Android tab bar
	},
	loadingContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
	},
	loadingText: {
		marginTop: 12,
		fontSize: 16,
		color: '#666',
		textAlign: 'center',
	},
	emptyContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 40,
	},
	emptyIllustration: {
		alignItems: 'center',
		marginBottom: 32,
	},
	dnaHelix: {
		width: 80,
		height: 80,
		borderRadius: 40,
		backgroundColor: '#e8f5e8',
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 16,
		shadowColor: '#4CAF50',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 8,
		elevation: 4,
	},
	helixText: {
		fontSize: 40,
	},
	emptyIconContainer: {
		width: 60,
		height: 60,
		borderRadius: 30,
		backgroundColor: 'white',
		justifyContent: 'center',
		alignItems: 'center',
		position: 'absolute',
		bottom: -8,
		right: -8,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	emptyIcon: {
		fontSize: 24,
	},
	emptyTitle: {
		fontSize: 28,
		fontWeight: '700',
		color: '#333',
		marginBottom: 12,
		textAlign: 'center',
	},
	emptyText: {
		fontSize: 16,
		color: '#666',
		textAlign: 'center',
		marginBottom: 32,
		lineHeight: 24,
		maxWidth: 280,
	},
	emptyFeatures: {
		flexDirection: 'row',
		justifyContent: 'space-around',
		width: '100%',
		marginBottom: 32,
	},
	emptyFeature: {
		alignItems: 'center',
		flex: 1,
	},
	featureIcon: {
		fontSize: 24,
		marginBottom: 8,
	},
	featureText: {
		fontSize: 12,
		color: '#666',
		fontWeight: '600',
		textAlign: 'center',
	},
	premiumUploadButton: {
		backgroundColor: '#4CAF50',
		paddingHorizontal: 32,
		paddingVertical: 16,
		borderRadius: 16,
		shadowColor: '#4CAF50',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.3,
		shadowRadius: 8,
		elevation: 6,
		marginBottom: 16,
	},
	premiumUploadButtonText: {
		color: 'white',
		fontSize: 18,
		fontWeight: '700',
	},
	supportedFormatsPreview: {
		opacity: 0.7,
	},
	supportedText: {
		fontSize: 12,
		color: '#999',
		textAlign: 'center',
	},
	uploadButton: {
		backgroundColor: '#4CAF50',
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 8,
	},
	uploadButtonText: {
		color: 'white',
		fontSize: 16,
		fontWeight: '600',
	},
	header: {
		padding: 20,
		paddingBottom: 16,
	},
	headerContent: {
		alignItems: 'flex-start',
	},
	title: {
		fontSize: 32,
		fontWeight: '800',
		color: '#333',
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 16,
		color: '#666',
		lineHeight: 22,
	},
	selectorSection: {
		marginHorizontal: 20,
		marginBottom: 24,
	},
	selectorTitle: {
		fontSize: 22,
		fontWeight: '700',
		color: '#333',
		marginBottom: 16,
	},
	premiumDatabaseOption: {
		backgroundColor: 'white',
		padding: 20,
		borderRadius: 16,
		marginBottom: 12,
		borderWidth: 2,
		borderColor: '#e0e0e0',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.05,
		shadowRadius: 8,
		elevation: 3,
	},
	selectedDatabase: {
		borderColor: '#4CAF50',
		backgroundColor: '#f8fff8',
		shadowColor: '#4CAF50',
		shadowOpacity: 0.15,
	},
	databaseCardHeader: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	databaseIconContainer: {
		width: 48,
		height: 48,
		borderRadius: 24,
		backgroundColor: '#e8f5e8',
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 16,
	},
	databaseIcon: {
		fontSize: 24,
	},
	databaseInfo: {
		flex: 1,
	},
	databaseName: {
		fontSize: 18,
		fontWeight: '700',
		color: '#333',
		marginBottom: 4,
	},
	databaseStats: {
		fontSize: 14,
		color: '#666',
	},
	selectedIndicator: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: '#4CAF50',
		justifyContent: 'center',
		alignItems: 'center',
	},
	selectedIndicatorText: {
		fontSize: 16,
		color: 'white',
		fontWeight: '700',
	},
	premiumAnalyzeButton: {
		backgroundColor: '#4CAF50',
		paddingVertical: 16,
		borderRadius: 16,
		alignItems: 'center',
		marginTop: 16,
		shadowColor: '#4CAF50',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.3,
		shadowRadius: 8,
		elevation: 6,
	},
	premiumAnalyzeButtonText: {
		color: 'white',
		fontSize: 18,
		fontWeight: '700',
	},
	analyzeButtonDisabled: {
		backgroundColor: '#f5f5f5',
		shadowOpacity: 0,
	},
	analyzeButtonTextDisabled: {
		color: '#999',
	},
	analysisProgressCard: {
		backgroundColor: 'white',
		marginTop: 16,
		padding: 20,
		borderRadius: 16,
		borderWidth: 2,
		borderColor: '#4CAF50',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 3,
	},
	analysisProgressHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 12,
	},
	analysisProgressTitle: {
		fontSize: 18,
		fontWeight: '700',
		color: '#333',
		flex: 1,
	},
	analysisProgressMessage: {
		fontSize: 14,
		color: '#4CAF50',
		marginBottom: 16,
		lineHeight: 18,
	},
	analysisProgressBar: {
		height: 6,
		backgroundColor: '#e8f5e8',
		borderRadius: 3,
		overflow: 'hidden',
	},
	analysisProgressFill: {
		height: '100%',
		backgroundColor: '#4CAF50',
		width: '100%',
		borderRadius: 3,
	},
	databaseOption: {
		backgroundColor: 'white',
		padding: 16,
		borderRadius: 12,
		marginBottom: 8,
		borderWidth: 2,
		borderColor: '#e0e0e0',
	},
	databaseOptionHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 4,
	},
	databaseOptionName: {
		fontSize: 16,
		fontWeight: '600',
		color: '#333',
		flex: 1,
	},
	selectedBadge: {
		backgroundColor: '#4CAF50',
		paddingHorizontal: 8,
		paddingVertical: 2,
		borderRadius: 12,
	},
	selectedBadgeText: {
		fontSize: 10,
		fontWeight: '600',
		color: 'white',
	},
	databaseOptionStats: {
		fontSize: 14,
		color: '#666',
	},
	analyzeButton: {
		backgroundColor: '#4CAF50',
		paddingHorizontal: 20,
		paddingVertical: 12,
		borderRadius: 8,
		alignItems: 'center',
		marginTop: 12,
	},
	analyzeButtonText: {
		color: 'white',
		fontSize: 16,
		fontWeight: '600',
	},
	searchContainer: {
		backgroundColor: 'white',
		padding: 16,
		borderRadius: 12,
		marginBottom: 24,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 3,
	},
	searchInput: {
		height: 44,
		borderWidth: 1,
		borderColor: '#e0e0e0',
		borderRadius: 8,
		paddingHorizontal: 12,
		fontSize: 16,
		backgroundColor: '#f8f9fa',
	},
	searchResults: {
		fontSize: 12,
		color: '#666',
		marginTop: 8,
		textAlign: 'center',
	},
	resultsSection: {
		marginHorizontal: 20,
		marginTop: 20,
	},
	resultsHeader: {
		marginBottom: 20,
	},
	resultsTitle: {
		fontSize: 24,
		fontWeight: '800',
		color: '#333',
		marginBottom: 8,
	},
	resultsSummary: {
		fontSize: 16,
		color: '#666',
		lineHeight: 22,
	},
	categorySection: {
		marginBottom: 32,
	},
	categoryTitle: {
		fontSize: 20,
		fontWeight: '700',
		color: '#333',
		marginBottom: 8,
	},
	categoryDescription: {
		fontSize: 14,
		color: '#666',
		marginBottom: 16,
		lineHeight: 20,
	},
	geneCard: {
		backgroundColor: 'white',
		padding: 20,
		borderRadius: 16,
		marginBottom: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
		borderWidth: 1,
		borderColor: '#f0f0f0',
	},
	geneCardHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
		marginBottom: 12,
	},
	geneInfo: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
	},
	geneName: {
		fontSize: 20,
		fontWeight: '700',
		color: '#333',
		marginRight: 12,
	},
	genopediaButton: {
		backgroundColor: '#e3f2fd',
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 12,
	},
	genopediaButtonText: {
		fontSize: 12,
		color: '#1976d2',
		fontWeight: '600',
	},
	geneStats: {
		marginBottom: 12,
	},
	variantCount: {
		fontSize: 14,
		color: '#666',
		marginBottom: 4,
	},
	pathogenicCount: {
		fontSize: 12,
		color: '#f44336',
		fontWeight: '600',
	},
	conditionsContainer: {
		marginBottom: 16,
	},
	conditionsLabel: {
		fontSize: 12,
		color: '#666',
		fontWeight: '600',
		marginBottom: 6,
	},
	conditionsText: {
		fontSize: 14,
		color: '#333',
		lineHeight: 20,
	},
	geneCardFooter: {
		borderTopWidth: 1,
		borderTopColor: '#f0f0f0',
		paddingTop: 16,
	},
	viewDetailsButton: {
		backgroundColor: '#f8f9fa',
		paddingVertical: 10,
		paddingHorizontal: 16,
		borderRadius: 8,
		alignItems: 'center',
	},
	viewDetailsButtonText: {
		fontSize: 14,
		color: '#4CAF50',
		fontWeight: '600',
	},
	noResultsCard: {
		backgroundColor: 'white',
		marginHorizontal: 20,
		marginTop: 20,
		padding: 32,
		borderRadius: 20,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.1,
		shadowRadius: 12,
		elevation: 6,
	},
	noResultsIllustration: {
		width: 80,
		height: 80,
		borderRadius: 40,
		backgroundColor: '#e8f5e8',
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 20,
	},
	noResultsIcon: {
		fontSize: 36,
	},
	noResultsTitle: {
		fontSize: 20,
		fontWeight: '700',
		color: '#333',
		marginBottom: 12,
		textAlign: 'center',
	},
	noResultsText: {
		fontSize: 16,
		color: '#666',
		textAlign: 'center',
		lineHeight: 22,
		maxWidth: 280,
	},
	moreResultsCard: {
		backgroundColor: '#f8f9fa',
		padding: 16,
		borderRadius: 12,
		alignItems: 'center',
		marginTop: 16,
	},
	moreResultsText: {
		fontSize: 14,
		color: '#4CAF50',
		fontWeight: '600',
		marginBottom: 4,
	},
	moreResultsHint: {
		fontSize: 12,
		color: '#999',
	},
	matchesSummary: {
		fontSize: 14,
		color: '#666',
		marginBottom: 12,
	},
	noMatches: {
		alignItems: 'center',
		paddingVertical: 20,
	},
	noMatchesText: {
		fontSize: 16,
		fontWeight: '600',
		color: '#666',
		marginBottom: 8,
	},
	noMatchesHint: {
		fontSize: 14,
		color: '#999',
		textAlign: 'center',
		lineHeight: 20,
	},
	resultsList: {
		maxHeight: 400,
	},
	geneGroupCard: {
		backgroundColor: 'white',
		padding: 18,
		borderRadius: 16,
		marginBottom: 12,
		borderWidth: 1,
		borderColor: '#e0e0e0',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.05,
		shadowRadius: 8,
		elevation: 3,
	},
	geneGroupHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 8,
	},
	geneNameText: {
		fontSize: 18,
		fontWeight: '700',
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
	geneGroupStats: {
		marginBottom: 8,
	},
	variantCountText: {
		fontSize: 14,
		color: '#666',
		marginBottom: 2,
	},
	pathogenicCountText: {
		fontSize: 12,
		color: '#f44336',
		fontWeight: '600',
	},
	allelesContainer: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		alignItems: 'center',
		marginBottom: 8,
	},
	allelesLabel: {
		fontSize: 12,
		color: '#666',
		marginRight: 6,
	},
	alleleText: {
		fontSize: 12,
		color: '#4CAF50',
		backgroundColor: '#e8f5e8',
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
		marginRight: 4,
		marginBottom: 2,
	},
	conditionsPreview: {
		marginBottom: 8,
	},
	conditionText: {
		fontSize: 14,
		color: '#666',
	},
	tapHint: {
		fontSize: 12,
		color: '#4CAF50',
		fontWeight: '600',
		textAlign: 'right',
	},
	moreMatches: {
		fontSize: 14,
		color: '#4CAF50',
		textAlign: 'center',
		marginTop: 8,
		fontWeight: '600',
	},
	disclaimer: {
		backgroundColor: '#fff3cd',
		marginHorizontal: 20,
		marginVertical: 10,
		padding: 16,
		borderRadius: 12,
		borderLeftWidth: 4,
		borderLeftColor: '#ffc107',
	},
	disclaimerTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#856404',
		marginBottom: 8,
	},
	disclaimerText: {
		fontSize: 14,
		color: '#856404',
		lineHeight: 20,
	},
	// Enhanced UI Styles
	selectorHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 12,
	},
	quickActions: {
		flexDirection: 'row',
		gap: 8,
	},
	quickActionButton: {
		backgroundColor: '#e3f2fd',
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 6,
	},
	quickActionText: {
		fontSize: 12,
		color: '#1976d2',
		fontWeight: '600',
	},
	databaseOptionLeft: {
		flexDirection: 'row',
		alignItems: 'center',
		flex: 1,
	},
	checkbox: {
		width: 20,
		height: 20,
		borderRadius: 4,
		borderWidth: 2,
		borderColor: '#e0e0e0',
		marginRight: 12,
		alignItems: 'center',
		justifyContent: 'center',
	},
	checkboxSelected: {
		backgroundColor: '#4CAF50',
		borderColor: '#4CAF50',
	},
	checkboxText: {
		color: 'white',
		fontSize: 12,
		fontWeight: '700',
	},
	analysisActions: {
		marginTop: 16,
		paddingTop: 16,
		borderTopWidth: 1,
		borderTopColor: '#f0f0f0',
	},
	selectionSummary: {
		marginBottom: 12,
	},
	selectionSummaryText: {
		fontSize: 14,
		color: '#666',
		textAlign: 'center',
	},
	// Modal Styles
	modalOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0, 0, 0, 0.5)',
		justifyContent: 'flex-end',
	},
	analysisModalContainer: {
		backgroundColor: 'white',
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		padding: 24,
		maxHeight: '80%',
	},
	analysisModalTitle: {
		fontSize: 22,
		fontWeight: '700',
		color: '#333',
		textAlign: 'center',
		marginBottom: 24,
	},
	analysisSection: {
		marginBottom: 24,
	},
	analysisSectionTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#333',
		marginBottom: 12,
	},
	selectedFileItem: {
		backgroundColor: '#f8f9fa',
		padding: 12,
		borderRadius: 8,
		marginBottom: 8,
	},
	selectedFileName: {
		fontSize: 14,
		fontWeight: '600',
		color: '#333',
		marginBottom: 4,
	},
	selectedFileStats: {
		fontSize: 12,
		color: '#666',
	},
	referenceDatabaseItem: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		padding: 12,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: '#e0e0e0',
		marginBottom: 8,
	},
	referenceDatabaseLeft: {
		flexDirection: 'row',
		alignItems: 'center',
		flex: 1,
	},
	referenceDatabaseInfo: {
		flex: 1,
	},
	referenceDatabaseName: {
		fontSize: 14,
		fontWeight: '600',
		color: '#333',
		marginBottom: 2,
	},
	referenceDatabaseDesc: {
		fontSize: 12,
		color: '#666',
	},
	referenceDatabaseCount: {
		fontSize: 12,
		color: '#4CAF50',
		fontWeight: '600',
	},
	analysisModalButtons: {
		flexDirection: 'row',
		gap: 12,
		marginTop: 12,
	},
	analysisModalCancelButton: {
		flex: 1,
		backgroundColor: '#f5f5f5',
		paddingVertical: 14,
		borderRadius: 8,
		alignItems: 'center',
	},
	analysisModalCancelText: {
		fontSize: 16,
		fontWeight: '600',
		color: '#666',
	},
	analysisModalRunButton: {
		flex: 1,
		backgroundColor: '#4CAF50',
		paddingVertical: 14,
		borderRadius: 8,
		alignItems: 'center',
	},
	analysisModalRunText: {
		fontSize: 16,
		fontWeight: '600',
		color: 'white',
	},
})
