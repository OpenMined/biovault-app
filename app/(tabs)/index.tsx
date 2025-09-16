/**
 * My DNA tab - file management for uploaded genetic data
 */

import { parse23andMeFile } from '@/lib/23andme-parser'
import {
	createFastGenomeDatabase,
	deleteUserGenomeDatabase,
	listUserGenomeDatabases,
	type UserGenomeDatabase,
} from '@/lib/fast-genome-storage'
import { useFocusEffect } from '@react-navigation/native'
import * as DocumentPicker from 'expo-document-picker'
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

// Global type for pending example file
declare global {
	var pendingExampleFile: { fileUri: string; fileName: string } | null
}

interface MyDNAState {
	isUploading: boolean
	uploadMessage: string
	storedDatabases: UserGenomeDatabase[]
	loading: boolean
	showNamingDialog: boolean
	selectedFile: { uri: string; name: string } | null
	customFileName: string
}

export default function MyDNAScreen() {
	const [state, setState] = useState<MyDNAState>({
		isUploading: false,
		uploadMessage: '',
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
		console.log('Processing file:', { fileUri, fileName })

		setState((prev) => ({
			...prev,
			isUploading: true,
			uploadMessage: 'Parsing genetic data...',
		}))

		try {
			// Parse the 23andMe file
			console.log('Starting to parse 23andMe file...')
			const genomeData = await parse23andMeFile(fileUri)
			console.log('File parsed successfully:', {
				fileName: genomeData.fileName,
				totalVariants: genomeData.totalVariants,
				rsidCount: genomeData.rsidCount,
				parseErrorsCount: genomeData.parseErrors.length,
			})

			setState((prev) => ({
				...prev,
				uploadMessage: 'Storing data locally...',
			}))

			// Create fast SQLite database with custom name
			console.log('Creating SQLite database...')
			const customGenomeData = {
				...genomeData,
				fileName: fileName, // Use the custom name instead of original filename
			}
			const userDatabase = await createFastGenomeDatabase(customGenomeData, (message) => {
				console.log('Database creation progress:', message)
				setState((prev) => ({
					...prev,
					uploadMessage: message,
				}))
			})

			console.log('Database created:', userDatabase)

			setState((prev) => ({
				...prev,
				uploadMessage: 'File uploaded successfully!',
			}))

			// Refresh stored databases list
			console.log('Refreshing stored databases list...')
			await loadStoredDatabases()

			// Small delay to show success message
			setTimeout(() => {
				setState((prev) => ({ ...prev, isUploading: false }))
			}, 1000)
		} catch (error) {
			console.error('Upload error:', error)
			setState((prev) => ({ ...prev, isUploading: false }))
			Alert.alert('Upload Error', `Failed to process file: ${error}`)
		}
	}, [])

	useEffect(() => {
		loadStoredDatabases()
	}, [])

	useFocusEffect(
		React.useCallback(() => {
			loadStoredDatabases()

			// Check for pending example file when tab becomes focused
			if (global.pendingExampleFile) {
				const { fileUri, fileName } = global.pendingExampleFile
				global.pendingExampleFile = null // Clear it
				processFile(fileUri, fileName)
			}
		}, [processFile])
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

	const handleConfirmUpload = async () => {
		if (!state.selectedFile || !state.customFileName.trim()) {
			Alert.alert('Error', 'Please enter a name for your DNA file')
			return
		}

		setState((prev) => ({ ...prev, showNamingDialog: false }))
		await processFile(state.selectedFile.uri, state.customFileName.trim())
	}

	const handleCancelUpload = () => {
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

	const renderUploadingCard = () => {
		if (!state.isUploading) return null

		return (
			<View style={styles.uploadingCard}>
				<View style={styles.uploadingHeader}>
					<Text style={styles.uploadingTitle}>📁 {state.customFileName}</Text>
					<ActivityIndicator size="small" color="#4CAF50" />
				</View>
				<Text style={styles.uploadingMessage}>{state.uploadMessage}</Text>
				<View style={styles.uploadingProgress}>
					<View style={styles.uploadingProgressBar} />
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
								<Text style={styles.uploadTitle}>Upload Genetic Data</Text>
								<Text style={styles.uploadDescription}>
									Add your genetic testing files to start analyzing your DNA
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
							style={[styles.premiumUploadButton, state.isUploading && styles.uploadButtonDisabled]}
							onPress={handleFilePicker}
							disabled={state.isUploading}
						>
							<Text style={styles.premiumUploadButtonText}>
								{state.isUploading ? 'Processing...' : '🚀 Choose File to Upload'}
							</Text>
						</TouchableOpacity>

						<View style={styles.orDivider}>
							<View style={styles.dividerLine} />
							<Text style={styles.orText}>or</Text>
							<View style={styles.dividerLine} />
						</View>

						<TouchableOpacity
							style={styles.exampleFilesButton}
							onPress={() => router.push('/example-files')}
							disabled={state.isUploading}
						>
							<Text style={styles.exampleFilesButtonText}>📋 Try with Example Data</Text>
						</TouchableOpacity>
					</View>
					{renderUploadingCard()}
				</View>

				{state.storedDatabases.length === 0 ? (
					<View style={styles.emptyState}>
						<View style={styles.emptyIllustration}>
							<Text style={styles.emptyIllustrationText}>🧬</Text>
						</View>
						<Text style={styles.emptyTitle}>Upload Your First DNA File</Text>
						<Text style={styles.emptyText}>
							Start your genetic journey by uploading data from genetic testing services
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
										<Text style={styles.fileUploadDate}>
											Uploaded {formatDate(database.uploadDate)}
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
							<Text style={styles.privacyPointText}>Data never uploaded to servers</Text>
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
				onRequestClose={handleCancelUpload}
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
							<TouchableOpacity style={styles.modalCancelButton} onPress={handleCancelUpload}>
								<Text style={styles.modalCancelButtonText}>Cancel</Text>
							</TouchableOpacity>
							<TouchableOpacity style={styles.modalConfirmButton} onPress={handleConfirmUpload}>
								<Text style={styles.modalConfirmButtonText}>Upload File</Text>
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
	orDivider: {
		flexDirection: 'row',
		alignItems: 'center',
		marginVertical: 20,
	},
	dividerLine: {
		flex: 1,
		height: 1,
		backgroundColor: '#e0e0e0',
	},
	orText: {
		fontSize: 14,
		color: '#999',
		marginHorizontal: 16,
		fontWeight: '500',
	},
	exampleFilesButton: {
		backgroundColor: '#f8f9fa',
		paddingVertical: 14,
		borderRadius: 12,
		alignItems: 'center',
		borderWidth: 1,
		borderColor: '#e0e0e0',
	},
	exampleFilesButtonText: {
		color: '#666',
		fontSize: 14,
		fontWeight: '600',
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
	uploadingCard: {
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
	uploadingHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 8,
	},
	uploadingTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#333',
		flex: 1,
	},
	uploadingMessage: {
		fontSize: 14,
		color: '#4CAF50',
		marginBottom: 12,
	},
	uploadingProgress: {
		height: 4,
		backgroundColor: '#e8f5e8',
		borderRadius: 2,
		overflow: 'hidden',
	},
	uploadingProgressBar: {
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
	fileUploadDate: {
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
