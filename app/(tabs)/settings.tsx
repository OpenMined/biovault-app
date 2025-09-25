import { useAnalytics } from '@/hooks/useAnalytics'
import { TouchableOpacity, Text, StyleSheet, Alert, View, ScrollView, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Storage } from 'expo-sqlite/kv-store'
import Constants from 'expo-constants'

export default function SettingsScreen() {
	useAnalytics({
		trackScreenView: true,
		screenProperties: { screen: 'Settings' },
	})

	const handleResetOnboarding = () => {
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
					onPress: () => {
						Storage.removeItemSync('hasCompletedOnboarding')
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
		<SafeAreaView style={styles.container}>
			<ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
				<View style={styles.header}>
					<Text style={styles.title}>Settings</Text>
					<Text style={styles.subtitle}>Manage your BioVault experience</Text>
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>App Information</Text>
					<View style={styles.infoCard}>
						<View style={styles.infoRow}>
							<Text style={styles.infoLabel}>Version</Text>
							<Text style={styles.infoValue}>{Constants.expoConfig?.version || '1.0.0'}</Text>
						</View>
						<View style={styles.infoRow}>
							<Text style={styles.infoLabel}>Build</Text>
							<Text style={styles.infoValue}>
								{Constants.expoConfig?.extra?.eas?.projectId ? 'Production' : 'Development'}
							</Text>
						</View>
					</View>
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Privacy & Security</Text>
					<View style={styles.settingsCard}>
						<View style={styles.privacyHeader}>
							<Text style={styles.privacyTitle}>🔒 Your Data Stays Local</Text>
						</View>
						<Text style={styles.privacyDescription}>
							All your genetic data is processed and stored locally on your device. Nothing ever
							leaves your device without your explicit consent.
						</Text>
						<View style={styles.privacyActions}>
							<TouchableOpacity style={styles.linkButton} onPress={handlePrivacyPolicy}>
								<Text style={styles.linkButtonText}>Privacy Policy</Text>
							</TouchableOpacity>
							<TouchableOpacity style={styles.linkButton} onPress={handleTermsOfService}>
								<Text style={styles.linkButtonText}>Terms of Service</Text>
							</TouchableOpacity>
						</View>
					</View>
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Support</Text>
					<View style={styles.settingsCard}>
						<TouchableOpacity style={styles.supportButton} onPress={handleContactSupport}>
							<View style={styles.supportButtonContent}>
								<Text style={styles.supportIcon}>📧</Text>
								<View style={styles.supportText}>
									<Text style={styles.supportTitle}>Contact Support</Text>
									<Text style={styles.supportDescription}>Get help with your BioVault app</Text>
								</View>
								<Text style={styles.chevron}>›</Text>
							</View>
						</TouchableOpacity>
					</View>
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Developer Options</Text>
					<View style={styles.settingsCard}>
						<TouchableOpacity style={styles.devButton} onPress={handleResetOnboarding}>
							<Text style={styles.devButtonText}>🔄 Reset Onboarding</Text>
						</TouchableOpacity>
					</View>
				</View>

				<View style={styles.footer}>
					<Text style={styles.footerText}>BioVault - Secure Genomic Data Management</Text>
					<Text style={styles.footerSubtext}>Made with privacy and security in mind</Text>
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
	section: {
		marginBottom: 24,
		paddingHorizontal: 20,
	},
	sectionTitle: {
		fontSize: 20,
		fontWeight: '700',
		color: '#333',
		marginBottom: 12,
	},
	settingsCard: {
		backgroundColor: 'white',
		borderRadius: 16,
		padding: 20,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 3,
	},
	infoCard: {
		backgroundColor: 'white',
		borderRadius: 16,
		padding: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 3,
	},
	infoRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingVertical: 8,
		borderBottomWidth: 1,
		borderBottomColor: '#f0f0f0',
	},
	infoLabel: {
		fontSize: 16,
		color: '#666',
		fontWeight: '500',
	},
	infoValue: {
		fontSize: 16,
		color: '#333',
		fontWeight: '600',
	},
	privacyHeader: {
		marginBottom: 12,
	},
	privacyTitle: {
		fontSize: 18,
		fontWeight: '700',
		color: '#059669',
	},
	privacyDescription: {
		fontSize: 14,
		color: '#666',
		lineHeight: 20,
		marginBottom: 16,
	},
	privacyActions: {
		flexDirection: 'row',
		gap: 12,
	},
	linkButton: {
		flex: 1,
		backgroundColor: '#e8f5e8',
		paddingVertical: 8,
		paddingHorizontal: 12,
		borderRadius: 8,
		alignItems: 'center',
	},
	linkButtonText: {
		fontSize: 12,
		color: '#059669',
		fontWeight: '600',
	},
	supportButton: {
		borderRadius: 12,
	},
	supportButtonContent: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 4,
	},
	supportIcon: {
		fontSize: 24,
		marginRight: 16,
	},
	supportText: {
		flex: 1,
	},
	supportTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#333',
		marginBottom: 2,
	},
	supportDescription: {
		fontSize: 14,
		color: '#666',
	},
	chevron: {
		fontSize: 20,
		color: '#ccc',
		fontWeight: '300',
	},
	devButton: {
		backgroundColor: '#f8f9fa',
		padding: 12,
		borderRadius: 8,
		alignItems: 'center',
		borderWidth: 1,
		borderColor: '#e0e0e0',
	},
	devButtonText: {
		color: '#666',
		fontSize: 14,
		fontWeight: '500',
	},
	footer: {
		alignItems: 'center',
		paddingVertical: 32,
		paddingHorizontal: 20,
	},
	footerText: {
		fontSize: 16,
		fontWeight: '600',
		color: '#059669',
		marginBottom: 4,
		textAlign: 'center',
	},
	footerSubtext: {
		fontSize: 12,
		color: '#999',
		textAlign: 'center',
	},
})
