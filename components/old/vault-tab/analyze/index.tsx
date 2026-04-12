import { useAnalytics } from '@/hooks/useAnalytics'
import { listUserGenomeDatabases, type UserGenomeDatabase } from '@/lib/genome-storage'
import { analyzeTrait } from '@/lib/trait-analysis'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	Modal,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated'

interface AnalysisState {
	loading: boolean
	databases: UserGenomeDatabase[]
	selectedDatabase: UserGenomeDatabase | null
	showCustomLinkModal: boolean
	customLink: string
	analyzingTrait: string | null
}

// Precanned wellness analyses
const PRECANNED_ANALYSES = [
	{
		id: 'eye_color',
		title: '👁️ Eye Color',
		description: 'Discover your genetic eye color traits',
		category: 'Physical Traits',
		status: 'available',
		fileTypes: ['23andme', 'ancestry'],
	},
	{
		id: 'circadian',
		title: '🌙 Morning vs Night Owl',
		description: 'Are you genetically wired to be an early bird or night owl?',
		category: 'Wellness',
		status: 'available',
		fileTypes: ['23andme', 'ancestry'],
	},
	{
		id: 'alcohol_tolerance',
		title: '🍷 Alcohol Tolerance',
		description: 'Your genetic alcohol metabolism traits',
		category: 'Wellness',
		status: 'available',
		fileTypes: ['23andme', 'ancestry'],
	},
	{
		id: 'caffeine',
		title: '☕ Caffeine Sensitivity',
		description: 'How your genes affect caffeine metabolism',
		category: 'Wellness',
		status: 'available',
		fileTypes: ['23andme', 'ancestry'],
	},
	{
		id: 'lactose',
		title: '🥛 Lactose Tolerance',
		description: 'Your genetic lactose digestion ability',
		category: 'Wellness',
		status: 'available',
		fileTypes: ['23andme', 'ancestry'],
	},
	{
		id: 'height',
		title: '📏 Height Prediction',
		description: 'Genetic factors influencing your height',
		category: 'Physical Traits',
		status: 'coming-soon',
		fileTypes: ['23andme', 'ancestry'],
	},
]

export default function AnalyzeScreen() {
	const { trackEvent } = useAnalytics({
		trackScreenView: true,
		screenProperties: { screen: 'Analyze' },
	})

	const [state, setState] = useState<AnalysisState>({
		loading: true,
		databases: [],
		selectedDatabase: null,
		showCustomLinkModal: false,
		customLink: '',
		analyzingTrait: null,
	})

	useEffect(() => {
		loadDatabases()
	}, [])

	const loadDatabases = async () => {
		try {
			const databases = await listUserGenomeDatabases()
			setState((prev) => ({
				...prev,
				databases,
				selectedDatabase: databases[0] || null,
				loading: false,
			}))
		} catch (error) {
			console.error('Failed to load databases:', error)
			setState((prev) => ({ ...prev, loading: false }))
		}
	}

	const handleRunAnalysis = async (analysisId: string) => {
		if (!state.selectedDatabase) {
			Alert.alert('No Data File', 'Please load a genetic data file first from the Vault tab.')
			return
		}

		const analysis = PRECANNED_ANALYSES.find((a) => a.id === analysisId)
		if (analysis?.status === 'coming-soon') {
			Alert.alert('Coming Soon', 'This analysis will be available in a future update!')
			return
		}

		trackEvent('analysis_started', {
			analysisId,
			databaseName: state.selectedDatabase.dbName,
		})

		// Set analyzing state
		setState((prev) => ({ ...prev, analyzingTrait: analysisId }))

		try {
			// Run the trait analysis
			const result = await analyzeTrait(analysisId, state.selectedDatabase.dbName)

			if (result) {
				trackEvent('analysis_completed', {
					analysisId,
					confidence: result.confidence,
					snpsFound: result.snps_found,
				})

				// Navigate to results screen at root level
				console.log('Navigating to trait-results screen...')
				router.push({
					pathname: '/trait-results',
					params: { result: JSON.stringify(result) },
				})
				console.log('Navigation called')
			} else {
				Alert.alert('Analysis Error', 'Could not complete analysis. Please try again.')
			}
		} catch (error) {
			console.error('Analysis error:', error)
			Alert.alert('Analysis Error', `Failed to analyze: ${error}`)
		} finally {
			setState((prev) => ({ ...prev, analyzingTrait: null }))
		}
	}

	const handleCustomLink = () => {
		setState((prev) => ({ ...prev, showCustomLinkModal: true }))
	}

	const handleSubmitCustomLink = () => {
		if (!state.customLink.trim()) {
			Alert.alert('Error', 'Please enter a valid analysis link')
			return
		}

		trackEvent('custom_analysis_submitted', {
			hasLink: !!state.customLink,
		})

		// TODO: Process custom analysis link
		Alert.alert(
			'Custom Analysis',
			'Custom analysis links will be supported soon! Community members will be able to create and share their own genetic analyses.'
		)
		setState((prev) => ({ ...prev, showCustomLinkModal: false, customLink: '' }))
	}

	if (state.loading) {
		return (
			<View style={styles.container}>
				<SafeAreaView style={styles.safeArea}>
					<View style={styles.loadingContainer}>
						<ActivityIndicator size="large" color="#059669" />
						<Text style={styles.loadingText}>Loading your data files...</Text>
					</View>
				</SafeAreaView>
			</View>
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
						<TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
							<Text style={styles.backButtonText}>‹</Text>
						</TouchableOpacity>
						<View style={styles.header}>
							<Text style={styles.title}>🧬 Analyze</Text>
							<Text style={styles.subtitle}>
								Run genetic analyses on your data with privacy-preserving workflows
							</Text>
						</View>
					</Animated.View>

					{/* No Data Warning */}
					{state.databases.length === 0 && (
						<Animated.View entering={FadeInUp.duration(350).delay(100)} style={styles.warningCard}>
							<Text style={styles.warningIcon}>📁</Text>
							<Text style={styles.warningTitle}>No Genetic Data Loaded</Text>
							<Text style={styles.warningText}>
								Load your genetic data file from the Vault tab to run analyses
							</Text>
							<TouchableOpacity
								style={styles.warningButton}
								onPress={() => router.push('/(tabs)/' as any)}
							>
								<Text style={styles.warningButtonText}>Go to Vault</Text>
							</TouchableOpacity>
						</Animated.View>
					)}

					{/* Data File Selector */}
					{state.databases.length > 0 && (
						<Animated.View entering={FadeIn.duration(300)} style={styles.selectorCard}>
							<Text style={styles.selectorLabel}>Analyzing Data From:</Text>
							<View style={styles.selectorChip}>
								<Text style={styles.selectorChipText}>
									🧬 {state.selectedDatabase?.fileName || 'Select File'}
								</Text>
							</View>
							{state.databases.length > 1 && (
								<Text style={styles.selectorHint}>
									{state.databases.length} files available • Switch in settings
								</Text>
							)}
						</Animated.View>
					)}

					{/* File Type Notice */}
					{state.databases.length > 0 && (
						<Animated.View entering={FadeInUp.duration(300).delay(50)} style={styles.noticeCard}>
							<Text style={styles.noticeIcon}>ℹ️</Text>
							<Text style={styles.noticeText}>
								Available analyses depend on your file type and data coverage
							</Text>
						</Animated.View>
					)}

					{/* Precanned Analyses */}
					{state.databases.length > 0 && (
						<Animated.View entering={FadeIn.duration(300).delay(100)} style={styles.section}>
							<View style={styles.sectionHeader}>
								<Text style={styles.sectionTitle}>Wellness & Fun Traits</Text>
								<Text style={styles.sectionSubtitle}>Safe, non-medical analyses</Text>
							</View>

							{PRECANNED_ANALYSES.map((analysis, index) => (
								<Animated.View
									key={analysis.id}
									entering={FadeInUp.duration(250).delay(150 + index * 40)}
								>
									<TouchableOpacity
										style={[
											styles.analysisCard,
											analysis.status === 'coming-soon' && styles.analysisCardDisabled,
											state.analyzingTrait === analysis.id && styles.analysisCardAnalyzing,
										]}
										onPress={() => handleRunAnalysis(analysis.id)}
										disabled={analysis.status === 'coming-soon' || state.analyzingTrait !== null}
									>
										<View style={styles.analysisHeader}>
											<Text style={styles.analysisTitle}>{analysis.title}</Text>
											{analysis.status === 'coming-soon' && (
												<View style={styles.comingSoonBadge}>
													<Text style={styles.comingSoonText}>Soon</Text>
												</View>
											)}
											{state.analyzingTrait === analysis.id && (
												<ActivityIndicator size="small" color="#059669" />
											)}
										</View>
										<Text style={styles.analysisDescription}>{analysis.description}</Text>
										<View style={styles.analysisFooter}>
											<View style={styles.categoryBadge}>
												<Text style={styles.categoryText}>{analysis.category}</Text>
											</View>
											{state.analyzingTrait === analysis.id ? (
												<Text style={styles.analyzingText}>Analyzing...</Text>
											) : (
												<Text style={styles.analysisArrow}>→</Text>
											)}
										</View>
									</TouchableOpacity>
								</Animated.View>
							))}
						</Animated.View>
					)}

					{/* Custom Analysis Section */}
					{state.databases.length > 0 && (
						<Animated.View entering={FadeInUp.duration(300).delay(200)} style={styles.section}>
							<View style={styles.sectionHeader}>
								<Text style={styles.sectionTitle}>Community Analyses</Text>
								<Text style={styles.sectionSubtitle}>
									Run custom workflows shared by the community
								</Text>
							</View>

							<TouchableOpacity style={styles.customCard} onPress={handleCustomLink}>
								<View style={styles.customIconContainer}>
									<Text style={styles.customIcon}>🔗</Text>
								</View>
								<View style={styles.customContent}>
									<Text style={styles.customTitle}>Add Custom Analysis</Text>
									<Text style={styles.customDescription}>
										Paste a link to run a community-created genetic analysis workflow
									</Text>
								</View>
							</TouchableOpacity>

							<View style={styles.infoBox}>
								<Text style={styles.infoIcon}>💡</Text>
								<Text style={styles.infoText}>
									Anyone can create and share custom analyses. You run them locally on your
									device—your data never leaves.
								</Text>
							</View>
						</Animated.View>
					)}

					{/* Privacy Card */}
					<Animated.View entering={FadeInUp.duration(300).delay(250)} style={styles.privacyCard}>
						<View style={styles.privacyHeader}>
							<View style={styles.privacyIconContainer}>
								<Text style={styles.privacyIcon}>🔒</Text>
							</View>
							<Text style={styles.privacyTitle}>Privacy-First Analysis</Text>
						</View>
						<View style={styles.privacyPoints}>
							<View style={styles.privacyPoint}>
								<Text style={styles.privacyPointIcon}>📱</Text>
								<Text style={styles.privacyPointText}>All analyses run locally on your device</Text>
							</View>
							<View style={styles.privacyPoint}>
								<Text style={styles.privacyPointIcon}>🚫</Text>
								<Text style={styles.privacyPointText}>Your genetic data is never uploaded</Text>
							</View>
							<View style={styles.privacyPoint}>
								<Text style={styles.privacyPointIcon}>🌐</Text>
								<Text style={styles.privacyPointText}>Community-driven, open-source workflows</Text>
							</View>
						</View>
					</Animated.View>

					{/* Coming Soon Section */}
					<Animated.View entering={FadeInUp.duration(300).delay(300)} style={styles.comingSoonCard}>
						<Text style={styles.comingSoonCardTitle}>🚀 Coming Soon</Text>
						<Text style={styles.comingSoonCardText}>
							• Share your own custom analyses{'\n'}• Download analysis databases (like ClinVar)
							{'\n'}• Encrypted multi-party computation{'\n'}• Contribute to research studies
						</Text>
					</Animated.View>
				</ScrollView>
			</SafeAreaView>

			{/* Custom Link Modal */}
			<Modal
				visible={state.showCustomLinkModal}
				transparent={true}
				animationType="fade"
				onRequestClose={() => setState((prev) => ({ ...prev, showCustomLinkModal: false }))}
			>
				<View style={styles.modalOverlay}>
					<View style={styles.modalContainer}>
						<Text style={styles.modalTitle}>Add Custom Analysis</Text>
						<Text style={styles.modalSubtitle}>
							Paste a link to a community-created genetic analysis workflow
						</Text>

						<TextInput
							style={styles.modalInput}
							value={state.customLink}
							onChangeText={(text) => setState((prev) => ({ ...prev, customLink: text }))}
							placeholder="https://example.com/my-analysis"
							autoFocus={true}
							autoCapitalize="none"
							keyboardType="url"
						/>

						<Text style={styles.modalHint}>
							Custom analyses run locally on your device. Your data stays private.
						</Text>

						<View style={styles.modalButtons}>
							<TouchableOpacity
								style={styles.modalCancelButton}
								onPress={() =>
									setState((prev) => ({ ...prev, showCustomLinkModal: false, customLink: '' }))
								}
							>
								<Text style={styles.modalCancelButtonText}>Cancel</Text>
							</TouchableOpacity>
							<TouchableOpacity style={styles.modalConfirmButton} onPress={handleSubmitCustomLink}>
								<Text style={styles.modalConfirmButtonText}>Add Analysis</Text>
							</TouchableOpacity>
						</View>
					</View>
				</View>
			</Modal>
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
	headerContainer: {
		paddingHorizontal: 28,
		paddingTop: 20,
		paddingBottom: 28,
		position: 'relative',
	},
	backButton: {
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
	backButtonText: {
		fontSize: 32,
		color: '#059669',
		fontWeight: '600',
		marginTop: -2,
		marginLeft: -2,
	},
	scrollView: {
		flex: 1,
	},
	scrollContent: {
		flexGrow: 1,
		paddingBottom: 100,
	},
	loadingContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
	},
	loadingText: {
		marginTop: 16,
		fontSize: 17,
		color: '#475569',
		textAlign: 'center',
		fontWeight: '600',
	},
	header: {
		alignItems: 'center',
	},
	title: {
		fontSize: 38,
		fontWeight: '900',
		color: '#059669',
		marginBottom: 8,
		letterSpacing: -0.8,
		textAlign: 'center',
	},
	subtitle: {
		fontSize: 17,
		color: '#475569',
		lineHeight: 24,
		fontWeight: '500',
		textAlign: 'center',
		opacity: 0.8,
		maxWidth: 340,
	},
	warningCard: {
		backgroundColor: 'rgba(255,255,255,0.95)',
		marginHorizontal: 28,
		padding: 40,
		borderRadius: 28,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
		marginBottom: 24,
	},
	warningIcon: {
		fontSize: 56,
		marginBottom: 20,
	},
	warningTitle: {
		fontSize: 24,
		fontWeight: '900',
		color: '#0f172a',
		marginBottom: 12,
		textAlign: 'center',
		letterSpacing: -0.5,
	},
	warningText: {
		fontSize: 16,
		color: '#475569',
		textAlign: 'center',
		lineHeight: 24,
		marginBottom: 24,
		fontWeight: '500',
	},
	warningButton: {
		backgroundColor: '#059669',
		paddingVertical: 16,
		paddingHorizontal: 32,
		borderRadius: 20,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 10,
		elevation: 6,
	},
	warningButtonText: {
		color: 'white',
		fontSize: 16,
		fontWeight: '900',
		letterSpacing: 0.5,
	},
	selectorCard: {
		backgroundColor: 'rgba(255,255,255,0.95)',
		marginHorizontal: 28,
		padding: 20,
		borderRadius: 24,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
		marginBottom: 16,
	},
	selectorLabel: {
		fontSize: 13,
		color: '#475569',
		fontWeight: '700',
		textTransform: 'uppercase',
		letterSpacing: 0.8,
		marginBottom: 12,
	},
	selectorChip: {
		backgroundColor: '#d1fae5',
		paddingHorizontal: 20,
		paddingVertical: 12,
		borderRadius: 20,
		marginBottom: 8,
	},
	selectorChipText: {
		fontSize: 16,
		color: '#059669',
		fontWeight: '800',
		letterSpacing: 0.3,
	},
	selectorHint: {
		fontSize: 12,
		color: '#94a3b8',
		fontWeight: '600',
	},
	noticeCard: {
		backgroundColor: 'rgba(241, 254, 248, 0.8)',
		marginHorizontal: 28,
		padding: 16,
		borderRadius: 20,
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 28,
	},
	noticeIcon: {
		fontSize: 20,
		marginRight: 12,
	},
	noticeText: {
		flex: 1,
		fontSize: 14,
		color: '#475569',
		fontWeight: '600',
		lineHeight: 20,
	},
	section: {
		paddingHorizontal: 28,
		marginBottom: 32,
	},
	sectionHeader: {
		marginBottom: 20,
	},
	sectionTitle: {
		fontSize: 24,
		fontWeight: '900',
		color: '#0f172a',
		letterSpacing: -0.5,
		marginBottom: 6,
	},
	sectionSubtitle: {
		fontSize: 15,
		color: '#64748b',
		fontWeight: '600',
	},
	analysisCard: {
		backgroundColor: 'rgba(255,255,255,0.95)',
		padding: 20,
		borderRadius: 24,
		marginBottom: 14,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
	},
	analysisCardDisabled: {
		opacity: 0.6,
	},
	analysisCardAnalyzing: {
		borderColor: '#059669',
		borderWidth: 2,
		backgroundColor: '#f0fdf4',
	},
	analysisHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: 8,
	},
	analysisTitle: {
		fontSize: 18,
		fontWeight: '800',
		color: '#0f172a',
		letterSpacing: -0.3,
		flex: 1,
	},
	comingSoonBadge: {
		backgroundColor: '#fef3c7',
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 12,
	},
	comingSoonText: {
		fontSize: 11,
		color: '#92400e',
		fontWeight: '800',
		letterSpacing: 0.5,
	},
	analysisDescription: {
		fontSize: 15,
		color: '#475569',
		lineHeight: 22,
		fontWeight: '500',
		marginBottom: 14,
	},
	analysisFooter: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	categoryBadge: {
		backgroundColor: 'rgba(209, 250, 229, 0.8)',
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 14,
	},
	categoryText: {
		fontSize: 12,
		color: '#059669',
		fontWeight: '700',
		letterSpacing: 0.3,
	},
	analysisArrow: {
		fontSize: 20,
		color: '#059669',
		fontWeight: '700',
	},
	analyzingText: {
		fontSize: 14,
		color: '#059669',
		fontWeight: '700',
	},
	customCard: {
		backgroundColor: 'rgba(255,255,255,0.95)',
		padding: 24,
		borderRadius: 24,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 16,
	},
	customIconContainer: {
		width: 56,
		height: 56,
		borderRadius: 28,
		backgroundColor: '#dbeafe',
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 16,
	},
	customIcon: {
		fontSize: 28,
	},
	customContent: {
		flex: 1,
	},
	customTitle: {
		fontSize: 18,
		fontWeight: '800',
		color: '#0f172a',
		marginBottom: 4,
		letterSpacing: -0.3,
	},
	customDescription: {
		fontSize: 14,
		color: '#475569',
		lineHeight: 20,
		fontWeight: '500',
	},
	infoBox: {
		backgroundColor: 'rgba(241, 254, 248, 0.6)',
		padding: 16,
		borderRadius: 18,
		flexDirection: 'row',
		alignItems: 'flex-start',
	},
	infoIcon: {
		fontSize: 18,
		marginRight: 12,
		marginTop: 2,
	},
	infoText: {
		flex: 1,
		fontSize: 14,
		color: '#475569',
		lineHeight: 20,
		fontWeight: '600',
	},
	privacyCard: {
		backgroundColor: 'rgba(255,255,255,0.95)',
		marginHorizontal: 28,
		padding: 28,
		borderRadius: 28,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
		marginBottom: 20,
	},
	privacyHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 24,
		justifyContent: 'center',
	},
	privacyIconContainer: {
		width: 52,
		height: 52,
		borderRadius: 26,
		backgroundColor: '#d1fae5',
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 14,
		shadowColor: '#059669',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.12,
		shadowRadius: 6,
		elevation: 2,
	},
	privacyIcon: {
		fontSize: 26,
	},
	privacyTitle: {
		fontSize: 22,
		fontWeight: '900',
		color: '#0f172a',
		letterSpacing: -0.5,
	},
	privacyPoints: {
		gap: 12,
	},
	privacyPoint: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: 'rgba(241, 254, 248, 0.5)',
		padding: 14,
		borderRadius: 16,
	},
	privacyPointIcon: {
		fontSize: 20,
		marginRight: 14,
		width: 24,
		textAlign: 'center',
	},
	privacyPointText: {
		fontSize: 15,
		color: '#475569',
		flex: 1,
		lineHeight: 22,
		fontWeight: '600',
	},
	comingSoonCard: {
		backgroundColor: 'rgba(241, 254, 248, 0.6)',
		marginHorizontal: 28,
		padding: 24,
		borderRadius: 24,
		marginBottom: 20,
	},
	comingSoonCardTitle: {
		fontSize: 20,
		fontWeight: '900',
		color: '#0f172a',
		marginBottom: 12,
		letterSpacing: -0.5,
	},
	comingSoonCardText: {
		fontSize: 15,
		color: '#475569',
		lineHeight: 26,
		fontWeight: '600',
	},
	// Modal styles
	modalOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0, 0, 0, 0.6)',
		justifyContent: 'center',
		alignItems: 'center',
		padding: 28,
	},
	modalContainer: {
		backgroundColor: 'rgba(255, 255, 255, 0.98)',
		borderRadius: 28,
		padding: 32,
		width: '100%',
		maxWidth: 400,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 10 },
		shadowOpacity: 0.25,
		shadowRadius: 20,
		elevation: 12,
	},
	modalTitle: {
		fontSize: 26,
		fontWeight: '900',
		color: '#0f172a',
		textAlign: 'center',
		marginBottom: 12,
		letterSpacing: -0.8,
	},
	modalSubtitle: {
		fontSize: 16,
		color: '#475569',
		textAlign: 'center',
		marginBottom: 28,
		lineHeight: 24,
		fontWeight: '500',
	},
	modalInput: {
		borderWidth: 0,
		borderRadius: 18,
		padding: 18,
		fontSize: 16,
		backgroundColor: 'rgba(248, 250, 251, 0.8)',
		marginBottom: 12,
		fontWeight: '600',
		color: '#0f172a',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.05,
		shadowRadius: 4,
		elevation: 2,
	},
	modalHint: {
		fontSize: 13,
		color: '#64748b',
		textAlign: 'center',
		marginBottom: 24,
		lineHeight: 18,
		fontWeight: '500',
	},
	modalButtons: {
		flexDirection: 'row',
		gap: 14,
	},
	modalCancelButton: {
		flex: 1,
		backgroundColor: 'rgba(241, 245, 249, 0.9)',
		paddingVertical: 17,
		borderRadius: 16,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.08,
		shadowRadius: 6,
		elevation: 2,
	},
	modalCancelButtonText: {
		fontSize: 16,
		fontWeight: '800',
		color: '#64748b',
		letterSpacing: 0.3,
	},
	modalConfirmButton: {
		flex: 1,
		backgroundColor: '#059669',
		paddingVertical: 17,
		borderRadius: 16,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 0.25,
		shadowRadius: 14,
		elevation: 8,
	},
	modalConfirmButtonText: {
		fontSize: 16,
		fontWeight: '900',
		color: 'white',
		letterSpacing: 0.5,
	},
})
