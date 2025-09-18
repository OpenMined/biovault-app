/**
 * My DNA tab - file management for locally stored genetic data
 */

import {
	deleteUserGenomeDatabase,
	listUserGenomeDatabases,
	type UserGenomeDatabase,
} from '@/lib/fast-genome-storage'
import * as Biovault from '@/modules/expo-biovault'
import { useFocusEffect } from '@react-navigation/native'
import * as DocumentPicker from 'expo-document-picker'
import { Paths } from 'expo-file-system'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
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

interface MyDNAState {
	isProcessing: boolean
	processingMessage: string
	storedDatabases: UserGenomeDatabase[]
	loading: boolean
	showNamingDialog: boolean
	selectedFile: { uri: string; name: string } | null
	customFileName: string
}

export default function MyDNAScreen() {
	const [state, setState] = useState<MyDNAState>({
		isProcessing: false,
		processingMessage: '',
		storedDatabases: [],
		loading: true,
		showNamingDialog: false,
		selectedFile: null,
		customFileName: '',
	})

	const loadStoredDatabases = async () => {
		try {
			console.log('Loading stored databases...')
			const databases = await listUserGenomeDatabases()
			console.log('Loaded databases:', databases)
			setState((prev) => ({ ...prev, storedDatabases: databases }))
		} catch (err) {
			console.error('Failed to load stored databases:', err)
		} finally {
			setState((prev) => ({ ...prev, loading: false }))
		}
	}

	const processFile = React.useCallback(async (fileUri: string, fileName: string) => {
		console.log('Processing file with Rust:', { fileUri, fileName })

		setState((prev) => ({
			...prev,
			isProcessing: true,
			processingMessage: 'Processing with Rust...',
		}))

		try {
			// Use the proper FileSystem API for documents directory
			const documentsPath = Paths.document.uri.replace('file://', '')

			setState((prev) => ({
				...prev,
				processingMessage: 'Parsing genetic data with Rust...',
			}))

			// Convert input file URI to path for Rust
			const inputPath = fileUri.replace('file://', '')

			// Use Rust to parse and create SQLite database
			console.log('Starting Rust processing...', { inputPath, documentsPath })
			const sqlitePath = await Biovault.processGenomeFile(inputPath, fileName, documentsPath)
			console.log('Rust processing completed:', sqlitePath)

			setState((prev) => ({
				...prev,
				processingMessage: 'File processed successfully!',
			}))

			// Refresh stored databases list
			console.log('Refreshing stored databases list...')
			await loadStoredDatabases()

			// Small delay to show success message
			setTimeout(() => {
				setState((prev) => ({ ...prev, isProcessing: false }))
			}, 1000)
		} catch (error) {
			console.error('Rust processing error:', error)
			setState((prev) => ({ ...prev, isProcessing: false }))
			Alert.alert('Processing Error', `Failed to process file with Rust: ${error}`)
		}
	}, [])

	useEffect(() => {
		loadStoredDatabases()
	}, [])

	useFocusEffect(
		React.useCallback(() => {
			loadStoredDatabases()
		}, [])
	)

	const handleFilePicker = async () => {
		try {
			const result = await DocumentPicker.getDocumentAsync({
				type: 'application/zip',
				copyToCacheDirectory: true,
			})

			if (!result.canceled && result.assets[0]) {
				const file = result.assets[0]
				// Show naming dialog instead of processing immediately
				setState((prev) => ({
					...prev,
					selectedFile: { uri: file.uri, name: file.name },
					customFileName: file.name.replace('.zip', '').replace(/[^a-zA-Z0-9\s-]/g, ''),
					showNamingDialog: true,
				}))
			}
		} catch (error) {
			console.error('File picker error:', error)
			Alert.alert('Error', 'Failed to pick file')
		}
	}

	const handleConfirmProcessing = async () => {
		if (!state.selectedFile || !state.customFileName.trim()) {
			Alert.alert('Error', 'Please enter a name for your DNA file')
			return
		}

		setState((prev) => ({ ...prev, showNamingDialog: false }))
		await processFile(state.selectedFile.uri, state.customFileName.trim())
	}

	const handleCancelProcessing = () => {
		setState((prev) => ({
			...prev,
			showNamingDialog: false,
			selectedFile: null,
			customFileName: '',
		}))
	}

	const handleDeleteDatabase = (database: UserGenomeDatabase) => {
		Alert.alert(
			'Delete DNA File',
			`Are you sure you want to delete "${database.fileName}"? This cannot be undone.`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Delete',
					style: 'destructive',
					onPress: async () => {
						try {
							await deleteUserGenomeDatabase(database.dbName)
							await loadStoredDatabases() // Refresh the list
						} catch {
							Alert.alert('Error', 'Failed to delete file')
						}
					},
				},
			]
		)
	}

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString()
	}

	if (state.loading) {
		return (
			<SafeAreaView style={styles.container}>
				<View style={styles.loadingContainer}>
					<ActivityIndicator size="large" color="#4CAF50" />
					<Text style={styles.loadingText}>Loading your DNA files...</Text>
				</View>
			</SafeAreaView>
		)
	}

	const renderProcessingCard = () => {
		if (!state.isProcessing) return null

		return (
			<View style={styles.processingCard}>
				<View style={styles.processingHeader}>
					<Text style={styles.processingTitle}>📁 {state.customFileName}</Text>
					<ActivityIndicator size="small" color="#4CAF50" />
				</View>
				<Text style={styles.processingMessage}>{state.processingMessage}</Text>
				<View style={styles.processingProgress}>
					<View style={styles.processingProgressBar} />
				</View>
			</View>
		)
	}

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView
				style={styles.scrollView}
				contentContainerStyle={styles.scrollContent}
				showsVerticalScrollIndicator={false}
			>
				<View style={styles.header}>
					<View style={styles.headerContent}>
						<Text style={styles.title}>My DNA</Text>
						<Text style={styles.subtitle}>Securely manage your genetic data files</Text>
					</View>
				</View>

				<View style={styles.uploadSection}>
					<View style={styles.uploadCard}>
						<View style={styles.uploadHeader}>
							<View style={styles.uploadIconContainer}>
								<Text style={styles.uploadIcon}>📁</Text>
							</View>
							<View style={styles.uploadContent}>
								<Text style={styles.uploadTitle}>Load Genetic Data</Text>
								<Text style={styles.uploadDescription}>
									Import your genetic testing files for local analysis on your device
								</Text>
							</View>
						</View>

						<View style={styles.supportedFormats}>
							<Text style={styles.formatsLabel}>Supported formats:</Text>
							<View style={styles.formatsList}>
								{['23andMe', 'AncestryDNA', 'MyHeritage', 'Other ZIP files'].map((format) => (
									<View key={format} style={styles.formatChip}>
										<Text style={styles.formatText}>{format}</Text>
									</View>
								))}
							</View>
						</View>

						<TouchableOpacity
							style={[
								styles.premiumUploadButton,
								state.isProcessing && styles.uploadButtonDisabled,
							]}
							onPress={handleFilePicker}
							disabled={state.isProcessing}
						>
							<Text style={styles.premiumUploadButtonText}>
								{state.isProcessing ? 'Processing...' : '🚀 Choose File to Load'}
							</Text>
						</TouchableOpacity>
					</View>
					{renderProcessingCard()}
				</View>

				{state.storedDatabases.length === 0 ? (
					<View style={styles.emptyState}>
						<View style={styles.emptyIllustration}>
							<Text style={styles.emptyIllustrationText}>🧬</Text>
						</View>
						<Text style={styles.emptyTitle}>Load Your First DNA File</Text>
						<Text style={styles.emptyText}>
							Start your genetic journey by importing data from genetic testing services for local
							analysis
						</Text>
						<View style={styles.emptyBenefits}>
							<Text style={styles.benefitPoint}>🔒 Data stays on your device</Text>
							<Text style={styles.benefitPoint}>⚡ Instant analysis results</Text>
							<Text style={styles.benefitPoint}>🧬 Discover genetic insights</Text>
						</View>
					</View>
				) : (
					<View style={styles.filesSection}>
						<View style={styles.filesSectionHeader}>
							<Text style={styles.filesTitle}>Your Genetic Data</Text>
							<Text style={styles.filesCount}>
								{state.storedDatabases.length} file{state.storedDatabases.length !== 1 ? 's' : ''}
							</Text>
						</View>

						{state.storedDatabases.map((database, index) => (
							<View key={index} style={styles.premiumFileCard}>
								<View style={styles.fileCardHeader}>
									<View style={styles.fileIconContainer}>
										<Text style={styles.fileIcon}>🧬</Text>
									</View>
									<View style={styles.fileInfo}>
										<Text style={styles.fileName}>{database.fileName}</Text>
										<Text style={styles.fileLoadDate}>
											Loaded {formatDate(database.uploadDate)}
										</Text>
									</View>
									<TouchableOpacity
										style={styles.deleteButton}
										onPress={() => handleDeleteDatabase(database)}
									>
										<Text style={styles.deleteButtonText}>✕</Text>
									</TouchableOpacity>
								</View>

								<View style={styles.fileStats}>
									<View style={styles.statItem}>
										<Text style={styles.statNumber}>{database.totalVariants.toLocaleString()}</Text>
										<Text style={styles.statLabel}>Variants</Text>
									</View>
									<View style={styles.statItem}>
										<Text style={styles.statNumber}>{database.rsidCount.toLocaleString()}</Text>
										<Text style={styles.statLabel}>rsIDs</Text>
									</View>
									<View style={styles.statItem}>
										<Text style={styles.statNumber}>
											{((database.totalVariants * 4) / 1024 / 1024).toFixed(1)}MB
										</Text>
										<Text style={styles.statLabel}>Storage</Text>
									</View>
								</View>

								<TouchableOpacity
									style={styles.premiumAnalyzeButton}
									onPress={() => {
										// Navigate to insights tab and pass the database name
										router.push(`/insights?selectedDb=${encodeURIComponent(database.dbName)}`)
									}}
								>
									<Text style={styles.premiumAnalyzeButtonText}>🔍 Analyze This Data</Text>
								</TouchableOpacity>
							</View>
						))}
					</View>
				)}

				<View style={styles.privacyCard}>
					<View style={styles.privacyHeader}>
						<View style={styles.privacyIconContainer}>
							<Text style={styles.privacyIcon}>🔒</Text>
						</View>
						<Text style={styles.privacyTitle}>Your Privacy Matters</Text>
					</View>
					<View style={styles.privacyPoints}>
						<View style={styles.privacyPoint}>
							<Text style={styles.privacyPointIcon}>📱</Text>
							<Text style={styles.privacyPointText}>Files stored locally on your device</Text>
						</View>
						<View style={styles.privacyPoint}>
							<Text style={styles.privacyPointIcon}>🚫</Text>
							<Text style={styles.privacyPointText}>Data never leaves your device</Text>
						</View>
						<View style={styles.privacyPoint}>
							<Text style={styles.privacyPointIcon}>🗑️</Text>
							<Text style={styles.privacyPointText}>Delete files anytime to free space</Text>
						</View>
					</View>
				</View>
			</ScrollView>

			{/* File Naming Modal */}
			<Modal
				visible={state.showNamingDialog}
				transparent={true}
				animationType="fade"
				onRequestClose={handleCancelProcessing}
			>
				<View style={styles.modalOverlay}>
					<View style={styles.modalContainer}>
						<Text style={styles.modalTitle}>Name Your DNA File</Text>
						<Text style={styles.modalSubtitle}>
							Give your genetic data a memorable name for easy identification
						</Text>

						<TextInput
							style={styles.modalInput}
							value={state.customFileName}
							onChangeText={(text) => setState((prev) => ({ ...prev, customFileName: text }))}
							placeholder="Enter a name for your DNA file"
							autoFocus={true}
							selectTextOnFocus={true}
						/>

						<View style={styles.modalButtons}>
							<TouchableOpacity style={styles.modalCancelButton} onPress={handleCancelProcessing}>
								<Text style={styles.modalCancelButtonText}>Cancel</Text>
							</TouchableOpacity>
							<TouchableOpacity style={styles.modalConfirmButton} onPress={handleConfirmProcessing}>
								<Text style={styles.modalConfirmButtonText}>Load File</Text>
							</TouchableOpacity>
						</View>
					</View>
				</View>
			</Modal>
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
	uploadSection: {
		paddingHorizontal: 20,
		marginBottom: 24,
	},
	uploadCard: {
		backgroundColor: 'white',
		padding: 24,
		borderRadius: 20,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.1,
		shadowRadius: 12,
		elevation: 6,
	},
	uploadHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 20,
	},
	uploadIconContainer: {
		width: 56,
		height: 56,
		borderRadius: 28,
		backgroundColor: '#e8f5e8',
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 16,
	},
	uploadIcon: {
		fontSize: 28,
	},
	uploadContent: {
		flex: 1,
	},
	uploadTitle: {
		fontSize: 20,
		fontWeight: '700',
		color: '#333',
		marginBottom: 4,
	},
	uploadDescription: {
		fontSize: 14,
		color: '#666',
		lineHeight: 20,
	},
	supportedFormats: {
		marginBottom: 20,
	},
	formatsLabel: {
		fontSize: 12,
		color: '#999',
		marginBottom: 8,
		fontWeight: '600',
	},
	formatsList: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 6,
	},
	formatChip: {
		backgroundColor: '#f0f8f0',
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: '#e0e0e0',
	},
	formatText: {
		fontSize: 10,
		color: '#4CAF50',
		fontWeight: '600',
	},
	premiumUploadButton: {
		backgroundColor: '#4CAF50',
		paddingVertical: 16,
		borderRadius: 16,
		alignItems: 'center',
		shadowColor: '#4CAF50',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.3,
		shadowRadius: 8,
		elevation: 6,
	},
	premiumUploadButtonText: {
		color: 'white',
		fontSize: 16,
		fontWeight: '700',
	},
	uploadButton: {
		backgroundColor: 'white',
		padding: 20,
		borderRadius: 12,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	uploadButtonText: {
		fontSize: 18,
		fontWeight: '600',
		color: '#4CAF50',
		marginBottom: 4,
	},
	uploadHint: {
		fontSize: 14,
		color: '#666',
	},
	uploadButtonDisabled: {
		opacity: 0.6,
	},
	processingCard: {
		backgroundColor: 'white',
		marginTop: 16,
		padding: 16,
		borderRadius: 12,
		borderWidth: 2,
		borderColor: '#4CAF50',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	processingHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 8,
	},
	processingTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#333',
		flex: 1,
	},
	processingMessage: {
		fontSize: 14,
		color: '#4CAF50',
		marginBottom: 12,
	},
	processingProgress: {
		height: 4,
		backgroundColor: '#e8f5e8',
		borderRadius: 2,
		overflow: 'hidden',
	},
	processingProgressBar: {
		height: '100%',
		backgroundColor: '#4CAF50',
		width: '100%',
		borderRadius: 2,
	},
	emptyState: {
		backgroundColor: 'white',
		marginHorizontal: 20,
		padding: 32,
		borderRadius: 20,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.1,
		shadowRadius: 12,
		elevation: 6,
	},
	emptyIllustration: {
		width: 100,
		height: 100,
		borderRadius: 50,
		backgroundColor: '#e8f5e8',
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 24,
		shadowColor: '#4CAF50',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 8,
		elevation: 4,
	},
	emptyIllustrationText: {
		fontSize: 48,
	},
	emptyTitle: {
		fontSize: 24,
		fontWeight: '700',
		color: '#333',
		marginBottom: 12,
		textAlign: 'center',
	},
	emptyText: {
		fontSize: 16,
		color: '#666',
		textAlign: 'center',
		lineHeight: 22,
		marginBottom: 24,
		maxWidth: 280,
	},
	emptyBenefits: {
		alignItems: 'center',
		marginBottom: 24,
	},
	benefitPoint: {
		fontSize: 14,
		color: '#4CAF50',
		marginBottom: 8,
		fontWeight: '500',
	},
	filesSection: {
		paddingHorizontal: 20,
		marginBottom: 20,
	},
	filesSectionHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 16,
	},
	filesTitle: {
		fontSize: 22,
		fontWeight: '700',
		color: '#333',
	},
	filesCount: {
		fontSize: 14,
		color: '#4CAF50',
		fontWeight: '600',
		backgroundColor: '#e8f5e8',
		paddingHorizontal: 12,
		paddingVertical: 4,
		borderRadius: 12,
	},
	premiumFileCard: {
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
	fileCardHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 16,
	},
	fileIconContainer: {
		width: 48,
		height: 48,
		borderRadius: 24,
		backgroundColor: '#e8f5e8',
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 12,
	},
	fileIcon: {
		fontSize: 24,
	},
	fileInfo: {
		flex: 1,
	},
	fileName: {
		fontSize: 18,
		fontWeight: '700',
		color: '#333',
		marginBottom: 4,
	},
	fileLoadDate: {
		fontSize: 12,
		color: '#999',
	},
	deleteButton: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: '#ffebee',
		justifyContent: 'center',
		alignItems: 'center',
	},
	deleteButtonText: {
		fontSize: 14,
		color: '#d32f2f',
		fontWeight: '600',
	},
	fileStats: {
		flexDirection: 'row',
		justifyContent: 'space-around',
		marginBottom: 16,
		paddingVertical: 12,
		backgroundColor: '#f8f9fa',
		borderRadius: 12,
	},
	statItem: {
		alignItems: 'center',
		flex: 1,
	},
	statNumber: {
		fontSize: 16,
		fontWeight: '700',
		color: '#4CAF50',
		marginBottom: 4,
	},
	statLabel: {
		fontSize: 10,
		color: '#666',
		fontWeight: '600',
		textAlign: 'center',
	},
	premiumAnalyzeButton: {
		backgroundColor: '#4CAF50',
		paddingVertical: 12,
		borderRadius: 12,
		alignItems: 'center',
		shadowColor: '#4CAF50',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.2,
		shadowRadius: 4,
		elevation: 3,
	},
	premiumAnalyzeButtonText: {
		color: 'white',
		fontSize: 14,
		fontWeight: '700',
	},
	fileCard: {
		backgroundColor: 'white',
		padding: 16,
		borderRadius: 12,
		marginBottom: 12,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	fileHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 8,
	},
	fileDetails: {
		marginBottom: 12,
	},
	fileDetail: {
		fontSize: 14,
		color: '#666',
		marginBottom: 2,
	},
	fileActions: {
		alignItems: 'center',
	},
	analyzeButton: {
		backgroundColor: '#e3f2fd',
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 6,
	},
	analyzeButtonText: {
		fontSize: 14,
		color: '#1976d2',
		fontWeight: '600',
	},
	privacyCard: {
		backgroundColor: 'white',
		marginHorizontal: 20,
		marginVertical: 20,
		padding: 20,
		borderRadius: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
		borderWidth: 1,
		borderColor: '#e8f5e8',
	},
	privacyHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 16,
	},
	privacyIconContainer: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: '#e8f5e8',
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 12,
	},
	privacyIcon: {
		fontSize: 20,
	},
	privacyTitle: {
		fontSize: 18,
		fontWeight: '700',
		color: '#333',
	},
	privacyPoints: {
		gap: 12,
	},
	privacyPoint: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	privacyPointIcon: {
		fontSize: 16,
		marginRight: 12,
		width: 20,
		textAlign: 'center',
	},
	privacyPointText: {
		fontSize: 14,
		color: '#666',
		flex: 1,
		lineHeight: 18,
	},
	storageInfo: {
		backgroundColor: '#e8f5e8',
		marginHorizontal: 20,
		marginVertical: 20,
		padding: 16,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: '#4CAF50',
	},
	storageTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#2e7d32',
		marginBottom: 8,
	},
	storageText: {
		fontSize: 14,
		color: '#2e7d32',
		marginBottom: 4,
	},
	// Modal styles
	modalOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0, 0, 0, 0.5)',
		justifyContent: 'center',
		alignItems: 'center',
		padding: 20,
	},
	modalContainer: {
		backgroundColor: 'white',
		borderRadius: 16,
		padding: 24,
		width: '100%',
		maxWidth: 400,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.25,
		shadowRadius: 8,
		elevation: 8,
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: '700',
		color: '#333',
		textAlign: 'center',
		marginBottom: 8,
	},
	modalSubtitle: {
		fontSize: 14,
		color: '#666',
		textAlign: 'center',
		marginBottom: 20,
		lineHeight: 20,
	},
	modalInput: {
		borderWidth: 1,
		borderColor: '#e0e0e0',
		borderRadius: 12,
		padding: 16,
		fontSize: 16,
		backgroundColor: '#f8f9fa',
		marginBottom: 20,
	},
	modalButtons: {
		flexDirection: 'row',
		gap: 12,
	},
	modalCancelButton: {
		flex: 1,
		backgroundColor: '#f5f5f5',
		paddingVertical: 12,
		borderRadius: 8,
		alignItems: 'center',
	},
	modalCancelButtonText: {
		fontSize: 16,
		fontWeight: '600',
		color: '#666',
	},
	modalConfirmButton: {
		flex: 1,
		backgroundColor: '#4CAF50',
		paddingVertical: 12,
		borderRadius: 8,
		alignItems: 'center',
	},
	modalConfirmButtonText: {
		fontSize: 16,
		fontWeight: '600',
		color: 'white',
	},
})
