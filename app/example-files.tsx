/**
 * Example Files - Sample genetic data for trying BioVault features
 */

import { Asset } from 'expo-asset'
import { router } from 'expo-router'
import React from 'react'
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

interface ExampleFile {
	id: string
	name: string
	displayName: string
	description: string
	variantCount: string
	source: string
	assetPath: any
}

export default function ExampleFilesScreen() {
	const exampleFiles: ExampleFile[] = [
		{
			id: '23andme-v4-test',
			name: '23andMe_v4_Test.zip',
			displayName: '23andMe Sample Data',
			description: 'Sample genetic data file from 23andMe for testing analysis features',
			variantCount: '~600,000 variants',
			source: '23andMe v4 format',
			assetPath: require('../assets/23andMe_v4_Test.zip'),
		},
	]

	const handleSelectExampleFile = async (file: ExampleFile) => {
		Alert.alert(
			'Use Example Data',
			`Load "${file.displayName}" to try BioVault's analysis features?`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Load Example Data',
					onPress: () => processExampleFile(file),
				},
			]
		)
	}

	const processExampleFile = async (file: ExampleFile) => {
		try {
			// Load the asset file and get its local URI
			const asset = Asset.fromModule(file.assetPath)
			await asset.downloadAsync()

			if (!asset.localUri) {
				throw new Error('Failed to load asset file')
			}

			// Store the example file info in a way the My DNA tab can access it
			// We'll use AsyncStorage or a simple global state
			global.pendingExampleFile = {
				fileUri: asset.localUri,
				fileName: file.displayName,
			}

			// Navigate back to My DNA tab
			router.back()
		} catch (error) {
			console.error('Example file error:', error)
			Alert.alert('Error', 'Failed to load example file. Please try again.')
		}
	}

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView
				style={styles.scrollView}
				contentContainerStyle={styles.scrollContent}
				showsVerticalScrollIndicator={false}
			>
				<View style={styles.header}>
					<TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
						<Text style={styles.backButtonText}>← Back</Text>
					</TouchableOpacity>

					<Text style={styles.title}>Example Data</Text>
					<Text style={styles.subtitle}>
						Try BioVault's features with sample genetic data files
					</Text>
				</View>

				<View style={styles.benefitsCard}>
					<Text style={styles.benefitsTitle}>🎯 Why Try Example Data?</Text>
					<View style={styles.benefitsList}>
						<Text style={styles.benefitPoint}>✨ Explore all analysis features safely</Text>
						<Text style={styles.benefitPoint}>🔬 See real ClinVar results</Text>
						<Text style={styles.benefitPoint}>🧬 Understand gene insights</Text>
						<Text style={styles.benefitPoint}>🔒 No personal data required</Text>
					</View>
				</View>

				<View style={styles.filesSection}>
					<Text style={styles.sectionTitle}>Available Example Files</Text>

					{exampleFiles.map((file) => (
						<TouchableOpacity
							key={file.id}
							style={styles.exampleFileCard}
							onPress={() => handleSelectExampleFile(file)}
						>
							<View style={styles.fileHeader}>
								<View style={styles.fileIconContainer}>
									<Text style={styles.fileIcon}>🧬</Text>
								</View>
								<View style={styles.fileInfo}>
									<Text style={styles.fileName}>{file.displayName}</Text>
									<Text style={styles.fileSource}>{file.source}</Text>
								</View>
								<View style={styles.fileArrow}>
									<Text style={styles.fileArrowText}>→</Text>
								</View>
							</View>

							<Text style={styles.fileDescription}>{file.description}</Text>

							<View style={styles.fileStats}>
								<Text style={styles.fileStat}>📊 {file.variantCount}</Text>
								<Text style={styles.fileStat}>🔬 Full analysis compatible</Text>
								<Text style={styles.fileStat}>🔒 Safe sample data</Text>
							</View>
						</TouchableOpacity>
					))}
				</View>

				<View style={styles.infoCard}>
					<Text style={styles.infoTitle}>💡 About Example Data</Text>
					<Text style={styles.infoText}>
						• Example files are processed exactly like your personal data
					</Text>
					<Text style={styles.infoText}>• All analysis features work with sample data</Text>
					<Text style={styles.infoText}>• Perfect for exploring BioVault capabilities</Text>
					<Text style={styles.infoText}>• No personal genetic information involved</Text>
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
	scrollContent: {
		flexGrow: 1,
		paddingBottom: 100,
	},
	header: {
		padding: 20,
		paddingBottom: 16,
	},
	backButton: {
		backgroundColor: '#f8f9fa',
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 8,
		alignSelf: 'flex-start',
		marginBottom: 16,
	},
	backButtonText: {
		fontSize: 14,
		color: '#666',
		fontWeight: '600',
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
	benefitsCard: {
		backgroundColor: 'white',
		marginHorizontal: 20,
		marginBottom: 20,
		padding: 20,
		borderRadius: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
	},
	benefitsTitle: {
		fontSize: 18,
		fontWeight: '700',
		color: '#333',
		marginBottom: 16,
	},
	benefitsList: {
		gap: 8,
	},
	benefitPoint: {
		fontSize: 14,
		color: '#4CAF50',
		fontWeight: '500',
	},
	filesSection: {
		marginHorizontal: 20,
		marginBottom: 20,
	},
	sectionTitle: {
		fontSize: 20,
		fontWeight: '700',
		color: '#333',
		marginBottom: 16,
	},
	exampleFileCard: {
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
	fileHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 12,
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
	fileSource: {
		fontSize: 12,
		color: '#999',
	},
	fileArrow: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: '#4CAF50',
		justifyContent: 'center',
		alignItems: 'center',
	},
	fileArrowText: {
		fontSize: 16,
		color: 'white',
		fontWeight: '600',
	},
	fileDescription: {
		fontSize: 14,
		color: '#666',
		marginBottom: 16,
		lineHeight: 20,
	},
	fileStats: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 12,
	},
	fileStat: {
		fontSize: 12,
		color: '#4CAF50',
		fontWeight: '500',
	},
	infoCard: {
		backgroundColor: '#e8f5e8',
		marginHorizontal: 20,
		marginBottom: 20,
		padding: 20,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: '#4CAF50',
	},
	infoTitle: {
		fontSize: 16,
		fontWeight: '700',
		color: '#2e7d32',
		marginBottom: 12,
	},
	infoText: {
		fontSize: 14,
		color: '#2e7d32',
		marginBottom: 6,
		lineHeight: 18,
	},
})
