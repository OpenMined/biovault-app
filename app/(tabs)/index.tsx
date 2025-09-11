/**
 * My DNA tab - file management for uploaded genetic data
 */

import React, { useState, useEffect } from 'react'
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
	ActivityIndicator,
	Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import * as DocumentPicker from 'expo-document-picker'
import { parse23andMeFile } from '@/lib/23andme-parser'
import {
	createFastGenomeDatabase,
	listUserGenomeDatabases,
	deleteUserGenomeDatabase,
	type UserGenomeDatabase,
} from '@/lib/fast-genome-storage'

interface MyDNAState {
	isUploading: boolean
	uploadMessage: string
	storedDatabases: UserGenomeDatabase[]
	loading: boolean
}

export default function MyDNAScreen() {
	const [state, setState] = useState<MyDNAState>({
		isUploading: false,
		uploadMessage: '',
		storedDatabases: [],
		loading: true,
	})

	useEffect(() => {
		loadStoredDatabases()
	}, [])

	useFocusEffect(
		React.useCallback(() => {
			loadStoredDatabases()
		}, [])
	)

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

	const handleFilePicker = async () => {
		try {
			const result = await DocumentPicker.getDocumentAsync({
				type: 'application/zip',
				copyToCacheDirectory: true,
			})

			if (!result.canceled && result.assets[0]) {
				const file = result.assets[0]
				await processFile(file.uri, file.name)
			}
		} catch (error) {
			console.error('File picker error:', error)
			Alert.alert('Error', 'Failed to pick file')
		}
	}

	const processFile = async (fileUri: string, fileName: string) => {
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

			// Create fast SQLite database
			console.log('Creating SQLite database...')
			const userDatabase = await createFastGenomeDatabase(genomeData, (message) => {
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

	if (state.isUploading) {
		return (
			<SafeAreaView style={styles.container}>
				<View style={styles.loadingContainer}>
					<ActivityIndicator size="large" color="#4CAF50" />
					<Text style={styles.loadingText}>{state.uploadMessage}</Text>
				</View>
			</SafeAreaView>
		)
	}

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView style={styles.scrollView}>
				<View style={styles.header}>
					<Text style={styles.title}>My DNA</Text>
					<Text style={styles.subtitle}>Manage your uploaded genetic data files</Text>
				</View>

				<View style={styles.uploadSection}>
					<TouchableOpacity style={styles.uploadButton} onPress={handleFilePicker}>
						<Text style={styles.uploadButtonText}>📁 Upload New File</Text>
						<Text style={styles.uploadHint}>Select your 23andMe or AncestryDNA ZIP file</Text>
					</TouchableOpacity>
				</View>

				{state.storedDatabases.length === 0 ? (
					<View style={styles.emptyState}>
						<Text style={styles.emptyTitle}>No DNA Files Yet</Text>
						<Text style={styles.emptyText}>
							Upload your genetic data file to get started with analysis
						</Text>
					</View>
				) : (
					<View style={styles.filesSection}>
						<Text style={styles.filesTitle}>Your DNA Files</Text>

						{state.storedDatabases.map((database, index) => (
							<View key={index} style={styles.fileCard}>
								<View style={styles.fileHeader}>
									<Text style={styles.fileName}>{database.fileName}</Text>
									<TouchableOpacity
										style={styles.deleteButton}
										onPress={() => handleDeleteDatabase(database)}
									>
										<Text style={styles.deleteButtonText}>Delete</Text>
									</TouchableOpacity>
								</View>

								<View style={styles.fileDetails}>
									<Text style={styles.fileDetail}>
										{database.totalVariants.toLocaleString()} variants
									</Text>
									<Text style={styles.fileDetail}>{database.rsidCount.toLocaleString()} rsIDs</Text>
									<Text style={styles.fileDetail}>Uploaded: {formatDate(database.uploadDate)}</Text>
								</View>

								<View style={styles.fileActions}>
									<TouchableOpacity style={styles.analyzeButton}>
										<Text style={styles.analyzeButtonText}>
											Go to Analyze Tab to run analysis →
										</Text>
									</TouchableOpacity>
								</View>
							</View>
						))}
					</View>
				)}

				<View style={styles.storageInfo}>
					<Text style={styles.storageTitle}>Storage Information</Text>
					<Text style={styles.storageText}>• Files are stored locally on your device</Text>
					<Text style={styles.storageText}>• Data never leaves your phone</Text>
					<Text style={styles.storageText}>• You can delete files anytime to free up space</Text>
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
		marginTop: 12,
		fontSize: 16,
		color: '#666',
		textAlign: 'center',
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
	uploadSection: {
		paddingHorizontal: 20,
		marginBottom: 20,
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
	emptyState: {
		backgroundColor: 'white',
		marginHorizontal: 20,
		padding: 24,
		borderRadius: 12,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	emptyTitle: {
		fontSize: 20,
		fontWeight: '600',
		color: '#333',
		marginBottom: 8,
	},
	emptyText: {
		fontSize: 14,
		color: '#666',
		textAlign: 'center',
		lineHeight: 20,
	},
	filesSection: {
		paddingHorizontal: 20,
	},
	filesTitle: {
		fontSize: 20,
		fontWeight: '600',
		color: '#333',
		marginBottom: 12,
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
	fileName: {
		fontSize: 16,
		fontWeight: '600',
		color: '#333',
		flex: 1,
	},
	deleteButton: {
		backgroundColor: '#ffebee',
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 6,
	},
	deleteButtonText: {
		fontSize: 12,
		color: '#d32f2f',
		fontWeight: '600',
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
})
