import { OMText } from '@/components/ui/OMText'
import { installAssayPackageFromGitHubUrl } from '@/lib/github-assay-packages'
import { listInstalledAssays, uninstallInstalledAssay, type InstalledAssaySummary } from '@/lib/installed-assays'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
	Alert,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	TextInput,
	View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

function formatInstalledAt(value: string) {
	return new Date(value).toLocaleString()
}

export default function AssaySettingsScreen() {
	const [githubUrl, setGithubUrl] = useState('')
	const [installedAssays, setInstalledAssays] = useState<InstalledAssaySummary[]>([])
	const [isRefreshing, setIsRefreshing] = useState(true)
	const [isInstalling, setIsInstalling] = useState(false)

	const refreshInstalledAssays = useCallback(() => {
		setIsRefreshing(true)
		return listInstalledAssays()
			.then(setInstalledAssays)
			.catch((error) => {
				console.error('Failed to load installed assays:', error)
				setInstalledAssays([])
			})
			.finally(() => {
				setIsRefreshing(false)
			})
	}, [])

	useEffect(() => {
		void refreshInstalledAssays()
	}, [refreshInstalledAssays])

	const handleInstall = () => {
		const trimmedUrl = githubUrl.trim()
		if (!trimmedUrl) {
			Alert.alert('Missing URL', 'Paste a GitHub tree or blob URL that points to an assay package.')
			return
		}

		void (async () => {
			try {
				setIsInstalling(true)
				const installed = await installAssayPackageFromGitHubUrl(trimmedUrl)
				await refreshInstalledAssays()
				setGithubUrl('')
				Alert.alert('Assay installed', `${installed.id} is now available in Explore.`)
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unable to install assay package.'
				Alert.alert('Install failed', message)
			} finally {
				setIsInstalling(false)
			}
		})()
	}

	const handleUninstall = (assay: InstalledAssaySummary) => {
		Alert.alert('Remove assay', `Remove ${assay.id} from this device?`, [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Remove',
				style: 'destructive',
				onPress: () => {
					void uninstallInstalledAssay(assay.id)
						.then(() => refreshInstalledAssays())
						.catch((error) => {
							console.error('Failed to uninstall assay:', error)
							Alert.alert('Remove failed', 'Unable to remove this assay right now.')
						})
				},
			},
		])
	}

	return (
		<SafeAreaView style={styles.safeArea} edges={['top']}>
			<KeyboardAvoidingView
				style={styles.safeArea}
				behavior={Platform.OS === 'ios' ? 'padding' : undefined}
			>
				<ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
					<View style={styles.topBar}>
						<Pressable onPress={() => router.back()} style={styles.backButton}>
							<OMText variant="subtitle" style={styles.backButtonText}>
								Back
							</OMText>
						</Pressable>
					</View>

					<View style={styles.hero}>
						<OMText variant="h3" style={styles.title}>
							Assay Packages
						</OMText>
						<OMText variant="body" style={styles.body}>
							Install package-based assays from GitHub into this device. Installed assays override bundled assays with the same id.
						</OMText>
					</View>

					<View style={styles.panel}>
						<OMText variant="headline" style={styles.panelTitle}>
							Install from GitHub
						</OMText>
						<OMText variant="body" style={styles.panelBody}>
							Paste a GitHub `tree` URL for an assay directory, or a `blob` URL for its `assay.yaml`.
						</OMText>
						<TextInput
							value={githubUrl}
							onChangeText={setGithubUrl}
							autoCapitalize="none"
							autoCorrect={false}
							placeholder="https://github.com/owner/repo/tree/main/path/to/assay"
							placeholderTextColor={omColors.grayscale500}
							style={styles.input}
						/>
						<Pressable
							onPress={handleInstall}
							disabled={isInstalling}
							style={({ pressed }) => [
								styles.primaryButton,
								isInstalling ? styles.primaryButtonDisabled : null,
								pressed ? styles.primaryButtonPressed : null,
							]}
						>
							<OMText variant="subtitle" style={styles.primaryButtonText}>
								{isInstalling ? 'Installing...' : 'Install assay'}
							</OMText>
						</Pressable>
					</View>

					<View style={styles.panel}>
						<OMText variant="headline" style={styles.panelTitle}>
							Installed assays
						</OMText>
						{isRefreshing ? (
							<OMText variant="body" style={styles.panelBody}>
								Loading installed assays...
							</OMText>
						) : installedAssays.length ? (
							<View style={styles.stack}>
								{installedAssays.map((assay) => (
									<View key={assay.id} style={styles.assayCard}>
										<View style={styles.assayCardBody}>
											<OMText variant="headline" style={styles.assayTitle}>
												{assay.id}
											</OMText>
											<OMText variant="caption" style={styles.assayMeta}>
												Installed {formatInstalledAt(assay.installedAt)} • v{assay.version}
											</OMText>
											<OMText variant="caption" style={styles.assayMeta} numberOfLines={2}>
												{assay.source}
											</OMText>
										</View>
										<Pressable
											onPress={() => handleUninstall(assay)}
											style={({ pressed }) => [
												styles.removeButton,
												pressed ? styles.removeButtonPressed : null,
											]}
										>
											<OMText variant="subtitle" style={styles.removeButtonText}>
												Remove
											</OMText>
										</Pressable>
									</View>
								))}
							</View>
						) : (
							<OMText variant="body" style={styles.panelBody}>
								No installed assay packages yet.
							</OMText>
						)}
					</View>
				</ScrollView>
			</KeyboardAvoidingView>
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
		gap: omSpacing.s,
	},
	title: {
		color: omTheme.primaryText,
	},
	body: {
		color: omColors.grayscale400,
		fontSize: 17,
		lineHeight: 24,
	},
	panel: {
		padding: omSpacing.xl,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		gap: omSpacing.m,
	},
	panelTitle: {
		color: omTheme.primaryText,
	},
	panelBody: {
		color: omColors.grayscale400,
		lineHeight: 22,
	},
	input: {
		borderRadius: omRadius.m,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.12)',
		backgroundColor: 'rgba(255,255,255,0.05)',
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.m,
		color: omColors.grayscale00,
	},
	primaryButton: {
		alignSelf: 'flex-start',
		paddingHorizontal: omSpacing.l,
		paddingVertical: omSpacing.m,
		borderRadius: omRadius.full,
		backgroundColor: omColors.teal500,
	},
	primaryButtonDisabled: {
		opacity: 0.6,
	},
	primaryButtonPressed: {
		opacity: 0.9,
	},
	primaryButtonText: {
		color: omColors.grayscale850,
	},
	stack: {
		gap: omSpacing.s,
	},
	assayCard: {
		padding: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,255,255,0.04)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
		gap: omSpacing.m,
	},
	assayCardBody: {
		gap: omSpacing.xs,
	},
	assayTitle: {
		color: omTheme.primaryText,
	},
	assayMeta: {
		color: omColors.grayscale400,
	},
	removeButton: {
		alignSelf: 'flex-start',
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(255,112,112,0.14)',
		borderWidth: 1,
		borderColor: 'rgba(255,112,112,0.28)',
	},
	removeButtonPressed: {
		opacity: 0.85,
	},
	removeButtonText: {
		color: '#ffb0b0',
	},
})
