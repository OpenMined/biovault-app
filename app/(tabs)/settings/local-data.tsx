import { OMText } from '@/components/ui/OMText'
import { deleteAllImportedDocuments, loadHomeImportState } from '@/lib/home-import'
import { deleteResultsDatabase } from '@/lib/test-results'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { useFocusEffect } from '@react-navigation/native'
import { router } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function LocalDataScreen() {
	const [importedCount, setImportedCount] = useState(0)

	const loadState = useCallback(() => {
		void loadHomeImportState()
			.then((state) => setImportedCount(state.importedDocuments.length))
			.catch((error) => {
				console.error('Failed to load local data state:', error)
				setImportedCount(0)
			})
	}, [])

	useFocusEffect(
		useCallback(() => {
			loadState()
		}, [loadState])
	)

	const handleDeleteImportedFiles = () => {
		Alert.alert(
			'Delete imported files',
			'This will remove all imported genomic files from this device. This cannot be undone.',
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Delete',
					style: 'destructive',
					onPress: () => {
						void deleteAllImportedDocuments()
							.then(() => {
								setImportedCount(0)
								Alert.alert('Deleted', 'All imported files have been removed.')
							})
							.catch((error) => {
								console.error('Failed to delete imported files:', error)
								Alert.alert('Error', 'Unable to delete imported files right now.')
							})
					},
				},
			]
		)
	}

	const handleDeleteResultsDatabase = () => {
		Alert.alert(
			'Delete results database',
			'This will remove all saved test results from this device. This cannot be undone.',
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Delete',
					style: 'destructive',
					onPress: () => {
						void deleteResultsDatabase()
							.then(() => {
								Alert.alert('Deleted', 'The local results database has been removed.')
							})
							.catch((error) => {
								console.error('Failed to delete results database:', error)
								Alert.alert('Error', 'Unable to delete the results database right now.')
							})
					},
				},
			]
		)
	}

	return (
		<SafeAreaView style={styles.safeArea} edges={['top']}>
			<ScrollView
				style={styles.screen}
				contentContainerStyle={styles.content}
				showsVerticalScrollIndicator={false}
			>
				<View style={styles.topBar}>
					<Pressable onPress={() => router.back()} style={styles.backButton}>
						<OMText variant="subtitle" style={styles.backButtonText}>
							Back
						</OMText>
					</Pressable>
				</View>

				<View style={styles.hero}>
					<OMText variant="caption" style={styles.eyebrow}>
						LOCAL DATA
					</OMText>
					<OMText variant="h3" style={styles.title}>
						Manage files and saved results on this device.
					</OMText>
					<OMText variant="body" style={styles.body}>
						Use these controls to permanently remove imported genomic files or clear saved test
						results.
					</OMText>
				</View>

				<View style={styles.noticeCard}>
					<OMText variant="subtitle" style={styles.noticeLabel}>
						PERMANENT ACTIONS
					</OMText>
					<OMText variant="body" style={styles.noticeBody}>
						These actions delete local data immediately and cannot be undone.
					</OMText>
				</View>

				<View style={styles.card}>
					<OMText variant="headline" style={styles.cardTitle}>
						Imported genomic files
					</OMText>
					<OMText variant="body" style={styles.cardBody}>
						Currently stored: {importedCount} file{importedCount === 1 ? '' : 's'}
					</OMText>
					<Pressable onPress={handleDeleteImportedFiles} style={styles.dangerButton}>
						<OMText variant="subtitle" style={styles.dangerButtonText}>
							Delete Imported Files
						</OMText>
					</Pressable>
				</View>

				<View style={styles.card}>
					<OMText variant="headline" style={styles.cardTitle}>
						Results
					</OMText>
					<OMText variant="body" style={styles.cardBody}>
						Removes all saved local test runs and result rows.
					</OMText>
					<Pressable onPress={handleDeleteResultsDatabase} style={styles.dangerButton}>
						<OMText variant="subtitle" style={styles.dangerButtonText}>
							Delete Results Database
						</OMText>
					</Pressable>
				</View>
			</ScrollView>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: omColors.grayscale850,
	},
	screen: {
		flex: 1,
		backgroundColor: omColors.grayscale850,
	},
	content: {
		padding: omSpacing.xl,
		paddingBottom: omSpacing.xxxl,
		gap: omSpacing.xl,
	},
	topBar: {
		alignItems: 'flex-start',
	},
	backButton: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(255,255,255,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.12)',
	},
	backButtonText: {
		color: omColors.grayscale300,
	},
	hero: {
		gap: omSpacing.m,
		paddingTop: omSpacing.m,
	},
	eyebrow: {
		alignSelf: 'flex-start',
		paddingHorizontal: omSpacing.s,
		paddingVertical: omSpacing.xs,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,255,255,0.08)',
		color: omColors.grayscale400,
		letterSpacing: 1,
	},
	title: {
		color: omTheme.primaryText,
		maxWidth: 340,
	},
	body: {
		color: omColors.grayscale400,
		maxWidth: 360,
		fontSize: 17,
		lineHeight: 24,
	},
	noticeCard: {
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: 'rgba(138,46,64,0.16)',
		borderWidth: 1,
		borderColor: 'rgba(224,163,176,0.24)',
		gap: omSpacing.xs,
	},
	noticeLabel: {
		color: omColors.red300,
		letterSpacing: 1,
	},
	noticeBody: {
		color: omColors.grayscale300,
	},
	card: {
		padding: omSpacing.xl,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		gap: omSpacing.m,
	},
	cardTitle: {
		color: omTheme.primaryText,
	},
	cardBody: {
		color: omColors.grayscale400,
	},
	dangerButton: {
		alignSelf: 'flex-start',
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(224,163,176,0.1)',
		borderWidth: 1,
		borderColor: 'rgba(224,163,176,0.28)',
	},
	dangerButtonText: {
		color: omTheme.dangerText,
	},
})
