/**
 * My DNA tab - file management for locally stored genetic data
 */

import { useAnalytics } from '@/hooks/useAnalytics'
import {
	addDatabaseToManifest,
	deleteUserGenomeDatabase,
	listUserGenomeDatabases,
	type UserGenomeDatabase,
} from '@/lib/genome-storage'
import * as BioVault from '@/modules/expo-biovault'
import { useFocusEffect } from '@react-navigation/native'
import * as DocumentPicker from 'expo-document-picker'
import { Paths } from 'expo-file-system'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	Image,
	Linking,
	Modal,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, {
	FadeIn,
	FadeInDown,
	FadeInUp,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from 'react-native-reanimated'

interface MyDNAState {
	isProcessing: boolean
	processingMessage: string
	storedDatabases: UserGenomeDatabase[]
	loading: boolean
	showNamingDialog: boolean
	selectedFile: { uri: string; name: string } | null
	customFileName: string
	email: string
}

// ts-prune-ignore-next
export default function MyDNAScreen() {
	const { trackEvent } = useAnalytics({
		trackScreenView: true,
		screenProperties: { screen: 'MyDNA' },
	})

	const [state, setState] = useState<MyDNAState>({
		isProcessing: false,
		processingMessage: '',
		storedDatabases: [],
		loading: true,
		showNamingDialog: false,
		selectedFile: null,
		customFileName: '',
		email: '',
	})

	// Animation values
	const uploadScale = useSharedValue(1)

	const uploadAnimatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: uploadScale.value }],
	}))

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

	const processFile = React.useCallback(
		async (fileUri: string, fileName: string) => {
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
				const sqlitePath = await BioVault.processGenomeFile(inputPath, fileName, documentsPath)
				console.log('Rust processing completed:', sqlitePath)

				setState((prev) => ({
					...prev,
					processingMessage: 'File processed successfully!',
				}))

				// Add the newly created database to the manifest
				await addDatabaseToManifest(sqlitePath, fileName)

				// Track successful file processing (without filename for privacy)
				trackEvent('genome_file_processed', {
					fileType: 'zip',
					success: true,
				})

				// Refresh stored databases list
				console.log('Refreshing stored databases list...')
				await loadStoredDatabases()

				// Small delay to show success message
				setTimeout(() => {
					setState((prev) => ({ ...prev, isProcessing: false }))
				}, 1000)
			} catch (error) {
				console.error('Rust processing error:', error)
				trackEvent('genome_file_processing_error', {
					fileType: 'zip',
					error: String(error),
				})
				setState((prev) => ({ ...prev, isProcessing: false }))
				Alert.alert('Processing Error', `Failed to process file with Rust: ${error}`)
			}
		},
		[trackEvent]
	)

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
			// Animate button press
			uploadScale.value = withSpring(0.95, { damping: 15 }, () => {
				uploadScale.value = withSpring(1)
			})

			trackEvent('file_picker_opened', { source: 'MyDNA' })
			const result = await DocumentPicker.getDocumentAsync({
				type: ['application/zip', 'text/plain'],
				copyToCacheDirectory: true,
			})

			if (!result.canceled && result.assets[0]) {
				const file = result.assets[0]
				// Show naming dialog instead of processing immediately
				// Clean filename: remove .zip/.txt, spaces, and special chars
				const cleanName = file.name
					.replace(/\.(zip|txt)$/i, '')
					.replace(/\s+/g, '_') // Replace spaces with underscores
					.replace(/[^a-zA-Z0-9_-]/g, '') // Remove special chars except _ and -
					.replace(/_+/g, '_') // Replace multiple underscores with single
					.replace(/-+/g, '-') // Replace multiple dashes with single

				setState((prev) => ({
					...prev,
					selectedFile: { uri: file.uri, name: file.name },
					customFileName: cleanName,
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

		// Clean the filename again in case user edited it
		const finalName = state.customFileName
			.trim()
			.replace(/\s+/g, '_') // Replace spaces with underscores
			.replace(/[^a-zA-Z0-9_-]/g, '') // Remove special chars
			.replace(/_+/g, '_') // Collapse multiple underscores
			.replace(/-+/g, '-') // Collapse multiple dashes

		setState((prev) => ({ ...prev, showNamingDialog: false }))
		await processFile(state.selectedFile.uri, finalName)
	}

	const handleCancelProcessing = () => {
		setState((prev) => ({
			...prev,
			showNamingDialog: false,
			selectedFile: null,
			customFileName: '',
		}))
	}

	const handleEmailSubmit = () => {
		if (!state.email.trim() || !state.email.includes('@')) {
			Alert.alert('Invalid Email', 'Please enter a valid email address')
			return
		}

		trackEvent('email_captured', { source: 'vault_page' })
		Alert.alert('Thanks!', "We'll keep you updated on new features and community updates.")
		setState((prev) => ({ ...prev, email: '' }))
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
							trackEvent('genome_file_deleted', {
								fileType: 'zip',
							})
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
			<View style={styles.container}>
				<SafeAreaView style={styles.safeArea}>
					<View style={styles.loadingContainer}>
						<ActivityIndicator size="large" color="#059669" />
						<Text style={styles.loadingText}>Loading your DNA files...</Text>
					</View>
				</SafeAreaView>
			</View>
		)
	}

	const renderProcessingCard = () => {
		if (!state.isProcessing) return null

		return (
			<View style={styles.processingCard}>
				<View style={styles.processingHeader}>
					<Text style={styles.processingTitle}>📁 {state.customFileName}</Text>
					<ActivityIndicator size="small" color="#10b981" />
				</View>
				<Text style={styles.processingMessage}>{state.processingMessage}</Text>
				<View style={styles.processingProgress}>
					<View style={styles.processingProgressBar} />
				</View>
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
					<Animated.View entering={FadeInDown.duration(300)} style={styles.header}>
						<Image
							source={require('@/assets/images/logo.png')}
							style={styles.logo}
							resizeMode="contain"
						/>
						<Text style={styles.title}>Vault</Text>
						<Text style={styles.subtitle}>Securely manage your genetic data</Text>
					</Animated.View>

					{/* Show genetic data if available */}
					{state.storedDatabases.length > 0 && (
						<Animated.View entering={FadeIn.duration(300)} style={styles.filesSection}>
							<View style={styles.filesSectionHeader}>
								<Text style={styles.filesTitle}>Your Genetic Data</Text>
								<Text style={styles.filesCount}>
									{state.storedDatabases.length} file{state.storedDatabases.length !== 1 ? 's' : ''}
								</Text>
							</View>

							{state.storedDatabases.map((database, index) => (
								<Animated.View
									key={index}
									entering={FadeInUp.duration(250).delay(index * 50)}
									style={styles.premiumFileCard}
								>
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
											<Text style={styles.statNumber}>
												{database.totalVariants.toLocaleString()}
											</Text>
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
											trackEvent('analyze_button_clicked', {
												fileType: 'zip',
												variantCount: database.totalVariants,
											})
											// Navigate to insights tab and pass the database name
											router.push(`/analyze` as any)
										}}
									>
										<Text style={styles.premiumAnalyzeButtonText}>Analyze This Data</Text>
									</TouchableOpacity>
								</Animated.View>
							))}
						</Animated.View>
					)}

					{/* Upload Zone - Clean, focused area */}
					<Animated.View entering={FadeInUp.duration(300).delay(100)} style={styles.uploadZone}>
						{/* Privacy badge - always visible */}
						<Animated.View
							entering={FadeIn.duration(250).delay(150)}
							style={styles.privacyBadgeTop}
						>
							<TouchableOpacity
								style={styles.privacyBadgeButton}
								onPress={() => router.push('/privacy-info' as any)}
								activeOpacity={0.7}
							>
								<Text style={styles.privacyBadgeIcon}>🔒</Text>
								<Text style={styles.privacyBadgeText}>All data stays on your device</Text>
								<View style={styles.infoIconContainer}>
									<Text style={styles.infoIcon}>ⓘ</Text>
								</View>
							</TouchableOpacity>
						</Animated.View>

						{/* Main upload area */}
						<Animated.View style={uploadAnimatedStyle}>
							<TouchableOpacity
								style={[styles.uploadButton, state.isProcessing && styles.uploadButtonDisabled]}
								onPress={handleFilePicker}
								disabled={state.isProcessing}
								activeOpacity={0.9}
							>
								<View style={styles.uploadButtonContent}>
									<View style={styles.uploadIconContainer}>
										<Image
											source={require('@/assets/images/logo.png')}
											style={styles.uploadIconImage}
											resizeMode="contain"
										/>
									</View>
									<Text style={styles.uploadButtonTitle}>
										{state.isProcessing
											? 'Processing...'
											: state.storedDatabases.length > 0
											? 'Add More Data'
											: 'Choose File to Load'}
									</Text>
									<Text style={styles.uploadButtonSubtitle}>
										{state.storedDatabases.length > 0
											? 'Import additional files'
											: 'ZIP or TXT from genetic testing services'}
									</Text>
								</View>
							</TouchableOpacity>
						</Animated.View>

						{/* Supported formats - minimal */}
						<Animated.View entering={FadeIn.duration(250).delay(200)} style={styles.formatsRow}>
							{['23andMe', 'Ancestry', 'MyHeritage', 'Others'].map((format, index) => (
								<Animated.View
									key={format}
									entering={FadeInUp.duration(200).delay(225 + index * 25)}
									style={styles.formatBadge}
								>
									<Text style={styles.formatBadgeText}>{format}</Text>
								</Animated.View>
							))}
						</Animated.View>

						{/* Guide link - minimal */}
						<TouchableOpacity
							style={styles.guideLink}
							onPress={() => router.push('/how-to-get-file' as any)}
						>
							<Text style={styles.guideLinkText}>How to get your DNA file →</Text>
						</TouchableOpacity>

						{renderProcessingCard()}
					</Animated.View>

					{/* Community Links */}
					<Animated.View
						entering={FadeInUp.duration(300).delay(350)}
						style={styles.communitySection}
					>
						<View style={styles.communityLinks}>
							<TouchableOpacity
								style={styles.communityLink}
								onPress={() => Linking.openURL('https://biovault.net')}
							>
								<Text style={styles.communityLinkIcon}>🌐</Text>
								<Text style={styles.communityLinkText}>Website</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={styles.communityLink}
								onPress={() => Linking.openURL('https://github.com/OpenMined/biovault-app')}
							>
								<Text style={styles.communityLinkIcon}>💻</Text>
								<Text style={styles.communityLinkText}>GitHub</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={styles.communityLink}
								onPress={() => Linking.openURL('https://slack.openmined.org')}
							>
								<Text style={styles.communityLinkIcon}>💬</Text>
								<Text style={styles.communityLinkText}>Slack</Text>
							</TouchableOpacity>
						</View>
					</Animated.View>

					{/* Email Capture */}
					<Animated.View entering={FadeInUp.duration(300).delay(400)} style={styles.emailSection}>
						<View style={styles.emailCard}>
							<Text style={styles.emailTitle}>Stay Updated</Text>
							<Text style={styles.emailSubtitle}>Get notified about new features and updates</Text>
							<View style={styles.emailInputContainer}>
								<TextInput
									style={styles.emailInput}
									placeholder="your@email.com"
									value={state.email}
									onChangeText={(text) => setState((prev) => ({ ...prev, email: text }))}
									keyboardType="email-address"
									autoCapitalize="none"
									autoCorrect={false}
								/>
								<TouchableOpacity style={styles.emailButton} onPress={handleEmailSubmit}>
									<Text style={styles.emailButtonText}>→</Text>
								</TouchableOpacity>
							</View>
						</View>
					</Animated.View>
				</ScrollView>
			</SafeAreaView>

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
	loadingContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: '#e0f2e7',
	},
	loadingText: {
		marginTop: 16,
		fontSize: 17,
		color: '#475569',
		textAlign: 'center',
		fontWeight: '600',
	},
	header: {
		paddingHorizontal: 28,
		paddingTop: 12,
		paddingBottom: 20,
		alignItems: 'center',
	},
	logo: {
		width: 80,
		height: 80,
		marginBottom: 16,
	},
	title: {
		fontSize: 32,
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
	},
	uploadZone: {
		paddingHorizontal: 28,
		marginBottom: 16,
		marginTop: 4,
	},
	privacyBadgeTop: {
		marginBottom: 20,
	},
	privacyBadgeButton: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 12,
		paddingHorizontal: 20,
		backgroundColor: 'rgba(209, 250, 229, 0.7)',
		borderRadius: 20,
		gap: 8,
		shadowColor: '#059669',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.08,
		shadowRadius: 6,
		elevation: 2,
	},
	privacyBadgeIcon: {
		fontSize: 16,
	},
	privacyBadgeText: {
		fontSize: 13,
		color: '#059669',
		fontWeight: '700',
		letterSpacing: 0.3,
	},
	infoIconContainer: {
		marginLeft: 4,
	},
	infoIcon: {
		fontSize: 16,
		color: '#059669',
		opacity: 0.7,
	},
	uploadButton: {
		backgroundColor: 'rgba(255,255,255,0.98)',
		borderRadius: 24,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 8 },
		shadowOpacity: 0.12,
		shadowRadius: 20,
		elevation: 8,
		marginBottom: 20,
		borderWidth: 2,
		borderColor: 'rgba(5, 150, 105, 0.1)',
	},
	uploadButtonContent: {
		padding: 32,
		alignItems: 'center',
	},
	uploadIconContainer: {
		width: 80,
		height: 80,
		borderRadius: 40,
		backgroundColor: '#d1fae5',
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 20,
		shadowColor: '#059669',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.15,
		shadowRadius: 12,
		elevation: 4,
	},
	uploadIcon: {
		fontSize: 32,
	},
	uploadIconImage: {
		width: 56,
		height: 56,
	},
	uploadButtonTitle: {
		fontSize: 22,
		fontWeight: '900',
		color: '#0f172a',
		marginBottom: 8,
		letterSpacing: -0.5,
		textAlign: 'center',
	},
	uploadButtonSubtitle: {
		fontSize: 14,
		color: '#64748b',
		fontWeight: '600',
		textAlign: 'center',
		lineHeight: 20,
	},
	formatsRow: {
		flexDirection: 'row',
		justifyContent: 'center',
		gap: 8,
		marginBottom: 16,
		flexWrap: 'wrap',
	},
	formatBadge: {
		backgroundColor: 'rgba(209, 250, 229, 0.6)',
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 14,
	},
	formatBadgeText: {
		fontSize: 11,
		color: '#059669',
		fontWeight: '700',
		letterSpacing: 0.4,
	},
	guideLink: {
		alignItems: 'center',
		paddingVertical: 12,
		marginBottom: 8,
	},
	guideLinkText: {
		fontSize: 14,
		color: '#059669',
		fontWeight: '700',
		letterSpacing: 0.2,
	},
	uploadButtonDisabled: {
		opacity: 0.5,
	},
	processingCard: {
		backgroundColor: 'rgba(255, 255, 255, 0.95)',
		marginTop: 20,
		padding: 22,
		borderRadius: 24,
		borderWidth: 0,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.12,
		shadowRadius: 10,
		elevation: 6,
	},
	processingHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 12,
	},
	processingTitle: {
		fontSize: 17,
		fontWeight: '700',
		color: '#0f172a',
		flex: 1,
		letterSpacing: -0.2,
	},
	processingMessage: {
		fontSize: 15,
		color: '#10b981',
		marginBottom: 16,
		fontWeight: '600',
	},
	processingProgress: {
		height: 6,
		backgroundColor: '#d1fae5',
		borderRadius: 3,
		overflow: 'hidden',
	},
	processingProgressBar: {
		height: '100%',
		backgroundColor: '#10b981',
		width: '100%',
		borderRadius: 3,
	},
	emptyState: {
		backgroundColor: 'rgba(255,255,255,0.95)',
		marginHorizontal: 28,
		padding: 40,
		borderRadius: 32,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 0.1,
		shadowRadius: 16,
		elevation: 6,
		borderWidth: 0,
	},
	emptyIllustration: {
		width: 140,
		height: 140,
		borderRadius: 70,
		backgroundColor: '#d1fae5',
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 32,
		shadowColor: '#059669',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.15,
		shadowRadius: 10,
		elevation: 4,
		borderWidth: 0,
	},
	emptyIllustrationText: {
		fontSize: 64,
	},
	emptyTitle: {
		fontSize: 28,
		fontWeight: '900',
		color: '#0f172a',
		marginBottom: 16,
		textAlign: 'center',
		letterSpacing: -0.8,
	},
	emptyText: {
		fontSize: 17,
		color: '#475569',
		textAlign: 'center',
		lineHeight: 26,
		marginBottom: 32,
		maxWidth: 320,
		fontWeight: '500',
	},
	emptyBenefits: {
		alignItems: 'center',
		marginBottom: 0,
		gap: 14,
	},
	benefitPoint: {
		fontSize: 16,
		color: '#059669',
		marginBottom: 0,
		fontWeight: '700',
		letterSpacing: 0.3,
	},
	howToGetFileButton: {
		backgroundColor: '#059669',
		paddingVertical: 14,
		paddingHorizontal: 24,
		borderRadius: 12,
		marginTop: 20,
		marginBottom: 12,
		alignItems: 'center',
		shadowColor: '#059669',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.2,
		shadowRadius: 4,
		elevation: 3,
	},
	howToGetFileButtonText: {
		color: 'white',
		fontSize: 16,
		fontWeight: '600',
	},
	filesSection: {
		paddingHorizontal: 28,
		marginBottom: 16,
	},
	filesSectionHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 14,
	},
	filesTitle: {
		fontSize: 26,
		fontWeight: '900',
		color: '#0f172a',
		letterSpacing: -0.8,
	},
	filesCount: {
		fontSize: 13,
		color: '#059669',
		fontWeight: '800',
		backgroundColor: 'rgba(209, 250, 229, 0.8)',
		paddingHorizontal: 14,
		paddingVertical: 6,
		borderRadius: 20,
		borderWidth: 0,
		letterSpacing: 0.5,
	},
	premiumFileCard: {
		backgroundColor: 'rgba(255,255,255,0.95)',
		padding: 20,
		borderRadius: 24,
		marginBottom: 12,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
		borderWidth: 0,
	},
	fileCardHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 20,
	},
	fileIconContainer: {
		width: 56,
		height: 56,
		borderRadius: 18,
		backgroundColor: '#d1fae5',
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 14,
		shadowColor: '#10b981',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.15,
		shadowRadius: 4,
		elevation: 2,
	},
	fileIcon: {
		fontSize: 28,
	},
	fileInfo: {
		flex: 1,
	},
	fileName: {
		fontSize: 19,
		fontWeight: '800',
		color: '#0f172a',
		marginBottom: 4,
		letterSpacing: -0.3,
	},
	fileLoadDate: {
		fontSize: 13,
		color: '#94a3b8',
		fontWeight: '600',
	},
	deleteButton: {
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: '#fee2e2',
		justifyContent: 'center',
		alignItems: 'center',
		borderWidth: 1,
		borderColor: '#fecaca',
	},
	deleteButtonText: {
		fontSize: 16,
		color: '#dc2626',
		fontWeight: '700',
	},
	fileStats: {
		flexDirection: 'row',
		justifyContent: 'space-around',
		marginBottom: 20,
		paddingVertical: 18,
		backgroundColor: 'rgba(241, 254, 248, 0.5)',
		borderRadius: 18,
		borderWidth: 0,
	},
	statItem: {
		alignItems: 'center',
		flex: 1,
	},
	statNumber: {
		fontSize: 20,
		fontWeight: '900',
		color: '#059669',
		marginBottom: 6,
		letterSpacing: -0.5,
	},
	statLabel: {
		fontSize: 11,
		color: '#475569',
		fontWeight: '700',
		textAlign: 'center',
		textTransform: 'uppercase',
		letterSpacing: 0.8,
	},
	premiumAnalyzeButton: {
		backgroundColor: '#059669',
		paddingVertical: 16,
		borderRadius: 18,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 10,
		elevation: 6,
	},
	premiumAnalyzeButtonText: {
		color: 'white',
		fontSize: 16,
		fontWeight: '900',
		letterSpacing: 0.5,
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
	storageInfo: {
		backgroundColor: '#e8f5e8',
		marginHorizontal: 20,
		marginVertical: 20,
		padding: 16,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: '#059669',
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
		borderWidth: 0,
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
		fontSize: 17,
		backgroundColor: 'rgba(248, 250, 251, 0.8)',
		marginBottom: 24,
		fontWeight: '600',
		color: '#0f172a',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.05,
		shadowRadius: 4,
		elevation: 2,
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
		borderWidth: 0,
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
	// Community Links
	communitySection: {
		paddingHorizontal: 28,
		marginBottom: 20,
	},
	communityLinks: {
		flexDirection: 'row',
		gap: 12,
		justifyContent: 'center',
	},
	communityLink: {
		flex: 1,
		backgroundColor: 'rgba(255,255,255,0.95)',
		paddingVertical: 18,
		paddingHorizontal: 12,
		borderRadius: 20,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
		gap: 6,
	},
	communityLinkIcon: {
		fontSize: 28,
	},
	communityLinkText: {
		fontSize: 11,
		fontWeight: '800',
		color: '#059669',
		letterSpacing: 0.4,
		textTransform: 'uppercase',
	},
	// Email Capture
	emailSection: {
		paddingHorizontal: 28,
		marginBottom: 24,
	},
	emailCard: {
		backgroundColor: 'rgba(255,255,255,0.95)',
		padding: 24,
		borderRadius: 24,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
	},
	emailTitle: {
		fontSize: 20,
		fontWeight: '900',
		color: '#0f172a',
		marginBottom: 6,
		letterSpacing: -0.5,
		textAlign: 'center',
	},
	emailSubtitle: {
		fontSize: 14,
		color: '#64748b',
		fontWeight: '600',
		textAlign: 'center',
		marginBottom: 20,
	},
	emailInputContainer: {
		flexDirection: 'row',
		gap: 10,
	},
	emailInput: {
		flex: 1,
		backgroundColor: '#f8fafb',
		paddingVertical: 14,
		paddingHorizontal: 18,
		borderRadius: 16,
		fontSize: 15,
		fontWeight: '600',
		color: '#0f172a',
		borderWidth: 2,
		borderColor: '#e2e8f0',
	},
	emailButton: {
		width: 52,
		height: 52,
		borderRadius: 16,
		backgroundColor: '#059669',
		justifyContent: 'center',
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 10,
		elevation: 6,
	},
	emailButtonText: {
		fontSize: 24,
		color: 'white',
		fontWeight: '700',
	},
})
