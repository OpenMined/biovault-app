/**
 * Analyze tab - ClinVar analysis and gene matching
 */

import React, { useState, useEffect } from 'react'
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	ActivityIndicator,
	Alert,
	TextInput,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { useSQLiteContext } from 'expo-sqlite'
import { useFocusEffect } from '@react-navigation/native'
import { Link } from 'expo-router'
import { lookupVariantsByRsid, type ClinVarVariant } from '@/lib/database'
import {
	listUserGenomeDatabases,
	getRsidsFromUserDatabase,
	type UserGenomeDatabase,
} from '@/lib/fast-genome-storage'
import {
	groupVariantsByGene,
	getSignificanceColor,
	getSignificanceDisplayText,
	type GeneGroup,
} from '@/lib/gene-grouping'

interface AnalyzeState {
	isLoading: boolean
	loadingMessage: string
	userDatabases: UserGenomeDatabase[]
	selectedDatabase: UserGenomeDatabase | null
	matches: ClinVarVariant[]
	geneGroups: GeneGroup[]
	filteredGeneGroups: GeneGroup[]
	hasSearched: boolean
	searchQuery: string
}

export default function AnalyzeScreen() {
	const [state, setState] = useState<AnalyzeState>({
		isLoading: false,
		loadingMessage: '',
		userDatabases: [],
		selectedDatabase: null,
		matches: [],
		geneGroups: [],
		filteredGeneGroups: [],
		hasSearched: false,
		searchQuery: '',
	})

	const db = useSQLiteContext()

	useEffect(() => {
		loadUserDatabases()
	}, [])

	useFocusEffect(
		React.useCallback(() => {
			loadUserDatabases()
		}, [])
	)

	const loadUserDatabases = async () => {
		try {
			const databases = await listUserGenomeDatabases()
			setState((prev) => {
				const stillExists = prev.selectedDatabase
					? databases.find((d) => d.dbName === prev.selectedDatabase!.dbName)
					: null
				return {
					...prev,
					userDatabases: databases,
					selectedDatabase: prev.selectedDatabase && !stillExists ? null : prev.selectedDatabase,
				}
			})
		} catch (error) {
			console.error('Failed to load user databases:', error)
		}
	}

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
							styles.databaseOption,
							state.selectedDatabase?.dbName === database.dbName && styles.selectedDatabase,
						]}
						onPress={() => selectDatabaseForAnalysis(database)}
					>
						<View style={styles.databaseOptionHeader}>
							<Text style={styles.databaseOptionName}>{database.fileName}</Text>
							{state.selectedDatabase?.dbName === database.dbName && (
								<View style={styles.selectedBadge}>
									<Text style={styles.selectedBadgeText}>Selected</Text>
								</View>
							)}
						</View>
						<Text style={styles.databaseOptionStats}>
							{database.totalVariants.toLocaleString()} variants •{' '}
							{database.rsidCount.toLocaleString()} rsIDs
						</Text>
					</TouchableOpacity>
				))}

				{state.selectedDatabase && (
					<TouchableOpacity style={styles.analyzeButton} onPress={runClinVarAnalysis}>
						<Text style={styles.analyzeButtonText}>🔬 Run ClinVar Analysis</Text>
					</TouchableOpacity>
				)}
			</View>
		)
	}

	const renderSearchBar = () => {
		if (!state.hasSearched || state.geneGroups.length === 0) return null

		return (
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
		)
	}

	const renderResults = () => {
		if (!state.hasSearched) return null

		return (
			<View style={styles.resultsCard}>
				<Text style={styles.resultsTitle}>Analysis Results</Text>

				{state.geneGroups.length === 0 ? (
					<View style={styles.noMatches}>
						<Text style={styles.noMatchesText}>No matches found</Text>
						<Text style={styles.noMatchesHint}>
							This could mean your variants don&apos;t have known clinical significance, or
							they&apos;re not in the ClinVar subset we&apos;re using.
						</Text>
					</View>
				) : (
					<View>
						<Text style={styles.matchesSummary}>
							Found {state.matches.length} matches in {state.geneGroups.length} genes
						</Text>

						<KeyboardAwareScrollView style={styles.resultsList} nestedScrollEnabled>
							{state.filteredGeneGroups.slice(0, 20).map((geneGroup, index) => (
								<Link key={index} href={`/gene/${encodeURIComponent(geneGroup.gene)}`} asChild>
									<TouchableOpacity style={styles.geneGroupCard}>
										<View style={styles.geneGroupHeader}>
											<Text style={styles.geneNameText}>{geneGroup.gene}</Text>
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

										<View style={styles.geneGroupStats}>
											<Text style={styles.variantCountText}>
												{geneGroup.uniqueRsids} variants • {geneGroup.totalVariants} records
											</Text>
											{geneGroup.pathogenicCount > 0 && (
												<Text style={styles.pathogenicCountText}>
													{geneGroup.pathogenicCount} pathogenic
												</Text>
											)}
										</View>

										{geneGroup.alleles.length > 0 && (
											<View style={styles.allelesContainer}>
												<Text style={styles.allelesLabel}>Alleles:</Text>
												{geneGroup.alleles.map((allele, idx) => (
													<Text key={idx} style={styles.alleleText}>
														{allele.ref}→{allele.alt} ({allele.count}×)
													</Text>
												))}
											</View>
										)}

										{geneGroup.conditions.length > 0 && (
											<View style={styles.conditionsPreview}>
												<Text style={styles.conditionText} numberOfLines={2}>
													{geneGroup.conditions.slice(0, 2).join(', ')}
													{geneGroup.conditions.length > 2 && '...'}
												</Text>
											</View>
										)}

										<Text style={styles.tapHint}>Tap to view all variants →</Text>
									</TouchableOpacity>
								</Link>
							))}

							{state.filteredGeneGroups.length > 20 && (
								<Text style={styles.moreMatches}>
									... and {state.filteredGeneGroups.length - 20} more genes
								</Text>
							)}
						</KeyboardAwareScrollView>
					</View>
				)}
			</View>
		)
	}

	if (state.isLoading) {
		return (
			<SafeAreaView style={styles.container}>
				<View style={styles.loadingContainer}>
					<ActivityIndicator size="large" color="#4CAF50" />
					<Text style={styles.loadingText}>{state.loadingMessage}</Text>
				</View>
			</SafeAreaView>
		)
	}

	if (state.userDatabases.length === 0) {
		return (
			<SafeAreaView style={styles.container}>
				<View style={styles.emptyContainer}>
					<Text style={styles.emptyTitle}>No DNA Data to Analyze</Text>
					<Text style={styles.emptyText}>
						Upload your genetic data file first to run ClinVar analysis
					</Text>
					<Link href="/" asChild>
						<TouchableOpacity style={styles.uploadButton}>
							<Text style={styles.uploadButtonText}>Go to My DNA</Text>
						</TouchableOpacity>
					</Link>
				</View>
			</SafeAreaView>
		)
	}

	return (
		<SafeAreaView style={styles.container}>
			<KeyboardAwareScrollView
				style={styles.scrollView}
				contentContainerStyle={styles.scrollContent}
			>
				<View style={styles.header}>
					<Text style={styles.title}>Analyze</Text>
					<Text style={styles.subtitle}>Run ClinVar analysis on your genetic data</Text>
				</View>

				{renderDatabaseSelector()}
				{renderSearchBar()}
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
	emptyTitle: {
		fontSize: 24,
		fontWeight: '600',
		color: '#333',
		marginBottom: 8,
		textAlign: 'center',
	},
	emptyText: {
		fontSize: 16,
		color: '#666',
		textAlign: 'center',
		marginBottom: 24,
		lineHeight: 24,
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
	selectorSection: {
		marginHorizontal: 20,
		marginBottom: 20,
	},
	selectorTitle: {
		fontSize: 18,
		fontWeight: '600',
		color: '#333',
		marginBottom: 12,
	},
	databaseOption: {
		backgroundColor: 'white',
		padding: 16,
		borderRadius: 12,
		marginBottom: 8,
		borderWidth: 2,
		borderColor: '#e0e0e0',
	},
	selectedDatabase: {
		borderColor: '#4CAF50',
		backgroundColor: '#f8fff8',
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
		marginHorizontal: 20,
		marginVertical: 10,
		padding: 16,
		borderRadius: 12,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
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
	resultsCard: {
		backgroundColor: 'white',
		marginHorizontal: 20,
		marginVertical: 10,
		padding: 16,
		borderRadius: 12,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	resultsTitle: {
		fontSize: 18,
		fontWeight: '600',
		color: '#333',
		marginBottom: 12,
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
		backgroundColor: '#f8f9fa',
		padding: 14,
		borderRadius: 12,
		marginBottom: 10,
		borderWidth: 1,
		borderColor: '#e0e0e0',
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
})
