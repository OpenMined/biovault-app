import {
	TouchableOpacity,
	Text,
	Alert,
	View,
	ScrollView,
	Linking,
	StyleSheet,
	Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useAnalytics } from '@/hooks/useAnalytics'
import Constants from 'expo-constants'
import { Storage } from '@/lib/storage'
import { deleteUserGenomeDatabase, listUserGenomeDatabases } from '@/lib/genome-storage'
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated'

// ts-prune-ignore-next
export default function SettingsScreen() {
	useAnalytics({
		trackScreenView: true,
		screenProperties: { screen: 'Settings' },
	})

	const handleResetOnboarding = () => {
		const resetOnboarding = () => {
			Storage.removeItemSync('hasCompletedOnboarding')
			Storage.removeItemSync('hasAcceptedResearchDisclaimer')

			if (Platform.OS === 'web') {
				window.alert('Onboarding has been reset.')
				router.replace('/onboarding')
				return
			}

			Alert.alert('Success', 'Onboarding has been reset.', [
				{
					text: 'Go to Onboarding',
					onPress: () => router.replace('/onboarding'),
				},
				{
					text: 'OK',
					style: 'cancel',
				},
			])
		}

		if (Platform.OS === 'web') {
			const confirmed = window.confirm(
				'This will reset the onboarding flow and show it again on next app launch. Continue?'
			)
			if (confirmed) {
				resetOnboarding()
			}
			return
		}

		Alert.alert(
			'Reset Onboarding',
			'This will reset the onboarding flow and show it again on next app launch. Continue?',
			[
				{
					text: 'Cancel',
					style: 'cancel',
				},
				{
					text: 'Reset',
					style: 'destructive',
					onPress: resetOnboarding,
				},
			]
		)
	}

	const handleDeleteAllData = async () => {
		Alert.alert(
			'Delete All Data',
			'This will permanently delete all your genetic data files from this device. This action cannot be undone.',
			[
				{
					text: 'Cancel',
					style: 'cancel',
				},
				{
					text: 'Delete All',
					style: 'destructive',
					onPress: async () => {
						try {
							const databases = await listUserGenomeDatabases()
							for (const db of databases) {
								await deleteUserGenomeDatabase(db.dbName)
							}
							Alert.alert('Success', 'All genetic data has been deleted.')
						} catch {
							Alert.alert('Error', 'Failed to delete all data. Please try again.')
						}
					},
				},
			]
		)
	}

	const handleContactSupport = () => {
		Linking.openURL('mailto:support@biovault.net?subject=BioVault App Support')
	}

	const handlePrivacyPolicy = () => {
		Linking.openURL('https://biovault.net/privacy')
	}

	const handleTermsOfService = () => {
		Linking.openURL('https://biovault.net/terms')
	}

	return (
		<View style={styles.container}>
			<SafeAreaView style={styles.safeArea}>
				<ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
					{/* Header */}
					<Animated.View entering={FadeInDown.duration(300)} style={styles.header}>
						<Text style={styles.title}>Settings</Text>
					</Animated.View>

					{/* App Info */}
					<Animated.View entering={FadeInUp.duration(300).delay(50)} style={styles.section}>
						<Text style={styles.sectionLabel}>APP INFORMATION</Text>
						<View style={styles.infoCard}>
							<View style={styles.infoRow}>
								<Text style={styles.infoLabel}>Version</Text>
								<Text style={styles.infoValue}>{Constants.expoConfig?.version || '1.0.0'}</Text>
							</View>
							<View style={[styles.infoRow, { marginTop: 12 }]}>
								<Text style={styles.infoLabel}>Build</Text>
								<Text style={styles.infoValue}>
									{Constants.expoConfig?.extra?.eas?.projectId ? 'Production' : 'Development'}
								</Text>
							</View>
						</View>
					</Animated.View>

					{/* Privacy */}
					<Animated.View entering={FadeInUp.duration(300).delay(100)} style={styles.section}>
						<Text style={styles.sectionLabel}>PRIVACY & SECURITY</Text>
						<View style={styles.privacyCard}>
							<View style={styles.privacyIcon}>
								<Text style={styles.privacyIconText}>🔒</Text>
							</View>
							<Text style={styles.privacyTitle}>Your Data Stays Local</Text>
							<Text style={styles.privacyText}>
								All your genetic data is processed and stored locally on your device. Nothing ever
								leaves your device without your explicit consent.
							</Text>
							<View style={styles.privacyButtons}>
								<TouchableOpacity style={styles.privacyButton} onPress={handlePrivacyPolicy}>
									<Text style={styles.privacyButtonText}>Privacy Policy</Text>
								</TouchableOpacity>
								<TouchableOpacity style={styles.privacyButton} onPress={handleTermsOfService}>
									<Text style={styles.privacyButtonText}>Terms</Text>
								</TouchableOpacity>
							</View>
						</View>
					</Animated.View>

					{/* Support */}
					<Animated.View entering={FadeInUp.duration(300).delay(150)} style={styles.section}>
						<Text style={styles.sectionLabel}>SUPPORT</Text>
						<TouchableOpacity style={styles.actionCard} onPress={handleContactSupport}>
							<Text style={styles.actionIcon}>📧</Text>
							<View style={styles.actionInfo}>
								<Text style={styles.actionTitle}>Contact Support</Text>
								<Text style={styles.actionDescription}>Get help with your BioVault app</Text>
							</View>
							<Text style={styles.actionArrow}>→</Text>
						</TouchableOpacity>
					</Animated.View>

					{/* Data Management */}
					<Animated.View entering={FadeInUp.duration(300).delay(200)} style={styles.section}>
						<Text style={styles.sectionLabel}>DATA MANAGEMENT</Text>
						<TouchableOpacity style={styles.dangerCard} onPress={handleDeleteAllData}>
							<View style={styles.dangerIcon}>
								<Text style={styles.dangerIconText}>🗑️</Text>
							</View>
							<View style={styles.dangerInfo}>
								<Text style={styles.dangerTitle}>Delete All Data</Text>
								<Text style={styles.dangerDescription}>
									Permanently delete all genetic data from this device
								</Text>
							</View>
						</TouchableOpacity>
					</Animated.View>

					{/* Developer */}
					<Animated.View entering={FadeInUp.duration(300).delay(250)} style={styles.section}>
						<Text style={styles.sectionLabel}>DEVELOPER OPTIONS</Text>
						<TouchableOpacity
							style={styles.devCard}
							onPress={() => router.push('/settings/test' as const)}
						>
							<Text style={styles.devCardText}>Run Test Screen</Text>
						</TouchableOpacity>
						<TouchableOpacity style={styles.devCard} onPress={handleResetOnboarding}>
							<Text style={styles.devCardText}>Reset Onboarding</Text>
						</TouchableOpacity>
					</Animated.View>

					{/* Footer */}
					<Animated.View entering={FadeIn.duration(300).delay(300)} style={styles.footer}>
						<Text style={styles.footerTitle}>BioVault</Text>
						<Text style={styles.footerSubtitle}>Secure Genomic Data Management</Text>
						<Text style={styles.footerText}>Made with privacy and security in mind</Text>
					</Animated.View>
				</ScrollView>
			</SafeAreaView>
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
		paddingBottom: 100,
	},
	header: {
		paddingHorizontal: 28,
		paddingTop: 20,
		paddingBottom: 28,
		alignItems: 'center',
	},
	title: {
		fontSize: 32,
		fontWeight: '900',
		color: '#059669',
		letterSpacing: -0.8,
		textAlign: 'center',
	},
	section: {
		paddingHorizontal: 28,
		marginBottom: 28,
	},
	sectionLabel: {
		fontSize: 12,
		fontWeight: '800',
		color: '#059669',
		letterSpacing: 1,
		marginBottom: 12,
	},
	infoCard: {
		backgroundColor: 'rgba(255,255,255,0.95)',
		padding: 20,
		borderRadius: 20,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
	},
	infoRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	infoLabel: {
		fontSize: 15,
		color: '#64748b',
		fontWeight: '600',
	},
	infoValue: {
		fontSize: 15,
		color: '#0f172a',
		fontWeight: '800',
	},
	privacyCard: {
		backgroundColor: 'rgba(255,255,255,0.95)',
		padding: 24,
		borderRadius: 24,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
	},
	privacyIcon: {
		width: 64,
		height: 64,
		borderRadius: 32,
		backgroundColor: '#d1fae5',
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 16,
	},
	privacyIconText: {
		fontSize: 32,
	},
	privacyTitle: {
		fontSize: 18,
		fontWeight: '800',
		color: '#0f172a',
		marginBottom: 12,
		letterSpacing: -0.3,
	},
	privacyText: {
		fontSize: 14,
		color: '#64748b',
		textAlign: 'center',
		lineHeight: 20,
		fontWeight: '500',
		marginBottom: 20,
	},
	privacyButtons: {
		flexDirection: 'row',
		gap: 12,
		width: '100%',
	},
	privacyButton: {
		flex: 1,
		backgroundColor: '#d1fae5',
		paddingVertical: 12,
		borderRadius: 14,
		alignItems: 'center',
	},
	privacyButtonText: {
		fontSize: 13,
		color: '#059669',
		fontWeight: '800',
		letterSpacing: 0.3,
	},
	actionCard: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: 'rgba(255,255,255,0.95)',
		padding: 18,
		borderRadius: 20,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.08,
		shadowRadius: 12,
		elevation: 6,
	},
	actionIcon: {
		fontSize: 28,
		marginRight: 14,
	},
	actionInfo: {
		flex: 1,
	},
	actionTitle: {
		fontSize: 16,
		fontWeight: '800',
		color: '#0f172a',
		marginBottom: 4,
		letterSpacing: -0.3,
	},
	actionDescription: {
		fontSize: 13,
		color: '#64748b',
		fontWeight: '600',
	},
	actionArrow: {
		fontSize: 24,
		color: '#059669',
		fontWeight: '700',
	},
	dangerCard: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: 'rgba(254, 226, 226, 0.95)',
		padding: 20,
		borderRadius: 20,
		shadowColor: '#dc2626',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.1,
		shadowRadius: 12,
		elevation: 6,
		borderWidth: 2,
		borderColor: 'rgba(220, 38, 38, 0.2)',
	},
	dangerIcon: {
		width: 48,
		height: 48,
		borderRadius: 24,
		backgroundColor: '#fee2e2',
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 14,
	},
	dangerIconText: {
		fontSize: 24,
	},
	dangerInfo: {
		flex: 1,
	},
	dangerTitle: {
		fontSize: 16,
		fontWeight: '800',
		color: '#dc2626',
		marginBottom: 4,
		letterSpacing: -0.3,
	},
	dangerDescription: {
		fontSize: 13,
		color: '#991b1b',
		fontWeight: '600',
		lineHeight: 18,
	},
	devCard: {
		backgroundColor: 'rgba(241, 245, 249, 0.95)',
		padding: 16,
		borderRadius: 16,
		alignItems: 'center',
		borderWidth: 1,
		borderColor: '#e2e8f0',
	},
	devCardText: {
		fontSize: 14,
		fontWeight: '700',
		color: '#64748b',
		letterSpacing: 0.2,
	},
	footer: {
		alignItems: 'center',
		paddingVertical: 32,
		paddingHorizontal: 28,
	},
	footerTitle: {
		fontSize: 20,
		fontWeight: '900',
		color: '#059669',
		marginBottom: 4,
		letterSpacing: -0.5,
	},
	footerSubtitle: {
		fontSize: 14,
		fontWeight: '700',
		color: '#0f172a',
		marginBottom: 8,
	},
	footerText: {
		fontSize: 12,
		color: '#64748b',
		fontWeight: '600',
	},
})
