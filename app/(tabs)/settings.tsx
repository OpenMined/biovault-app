import { TouchableOpacity, Text, Alert, View, ScrollView, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Storage } from 'expo-sqlite/kv-store'
import { layout, typography, buttons, cards } from '@/styles'
import { useTheme } from '@/contexts/ThemeContext'
import { useAnalytics } from '@/hooks/useAnalytics'
import Constants from 'expo-constants'

// ts-prune-ignore-next
export default function SettingsScreen() {
	const { theme, themeMode, setThemeMode } = useTheme()

	useAnalytics({
		trackScreenView: true,
		screenProperties: { screen: 'Settings' },
	})

	const handleThemeToggle = () => {
		const modes: ('system' | 'light' | 'dark')[] = ['system', 'light', 'dark']
		const currentIndex = modes.indexOf(themeMode)
		const nextIndex = (currentIndex + 1) % modes.length
		const nextMode = modes[nextIndex]
		if (nextMode) {
			setThemeMode(nextMode)
		}
	}

	const getThemeDisplayName = () => {
		switch (themeMode) {
			case 'light': return '☀️ Light'
			case 'dark': return '🌙 Dark'
			case 'system': return '📱 System'
		}
	}

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
		<SafeAreaView style={[layout.screenContainer, { backgroundColor: theme.background }]}>
			<ScrollView style={layout.contentContainer}>
				<Text style={[typography.largeTitle, { color: theme.primaryAlt }]}>Settings</Text>

				<View style={{ marginBottom: 24 }}>
					<Text style={[typography.sectionTitle, { color: theme.textPrimary }]}>Appearance</Text>
					<TouchableOpacity style={[buttons.secondary, { backgroundColor: theme.surface, marginTop: 12 }]} onPress={handleThemeToggle}>
						<Text style={[typography.buttonTextSmall, { color: theme.textPrimary }]}>
							{getThemeDisplayName()}
						</Text>
					</TouchableOpacity>
				</View>

				<View style={{ marginBottom: 24 }}>
					<Text style={[typography.sectionTitle, { color: theme.textPrimary }]}>App Information</Text>
					<View style={[cards.compact, { backgroundColor: theme.surface, marginTop: 12 }]}>
						<View style={layout.spacedRow}>
							<Text style={[typography.bodyText, { color: theme.textSecondary }]}>Version</Text>
							<Text style={[typography.bodyText, { color: theme.textPrimary, fontWeight: '600' }]}>{Constants.expoConfig?.version || '1.0.0'}</Text>
						</View>
						<View style={[layout.spacedRow, { marginTop: 8 }]}>
							<Text style={[typography.bodyText, { color: theme.textSecondary }]}>Build</Text>
							<Text style={[typography.bodyText, { color: theme.textPrimary, fontWeight: '600' }]}>
								{Constants.expoConfig?.extra?.eas?.projectId ? 'Production' : 'Development'}
							</Text>
						</View>
					</View>
				</View>

				<View style={{ marginBottom: 24 }}>
					<Text style={[typography.sectionTitle, { color: theme.textPrimary }]}>Privacy & Security</Text>
					<View style={[cards.standard, { backgroundColor: theme.surface, marginTop: 12 }]}>
						<Text style={[typography.cardTitle, { color: theme.primary }]}>🔒 Your Data Stays Local</Text>
						<Text style={[typography.bodyText, { color: theme.textSecondary, marginTop: 12 }]}>
							All your genetic data is processed and stored locally on your device. Nothing ever
							leaves your device without your explicit consent.
						</Text>
						<View style={[layout.row, { marginTop: 16, gap: 12 }]}>
							<TouchableOpacity style={[buttons.primarySmall, { backgroundColor: theme.primaryLight, flex: 1 }]} onPress={handlePrivacyPolicy}>
								<Text style={[typography.buttonTextSmall, { color: theme.primary }]}>Privacy Policy</Text>
							</TouchableOpacity>
							<TouchableOpacity style={[buttons.primarySmall, { backgroundColor: theme.primaryLight, flex: 1 }]} onPress={handleTermsOfService}>
								<Text style={[typography.buttonTextSmall, { color: theme.primary }]}>Terms of Service</Text>
							</TouchableOpacity>
						</View>
					</View>
				</View>

				<View style={{ marginBottom: 24 }}>
					<Text style={[typography.sectionTitle, { color: theme.textPrimary }]}>Support</Text>
					<TouchableOpacity style={[cards.compact, { backgroundColor: theme.surface, marginTop: 12 }]} onPress={handleContactSupport}>
						<View style={layout.spacedRow}>
							<View style={layout.row}>
								<Text style={{ fontSize: 24, marginRight: 16 }}>📧</Text>
								<View>
									<Text style={[typography.cardTitle, { color: theme.textPrimary }]}>Contact Support</Text>
									<Text style={[typography.bodyText, { color: theme.textSecondary }]}>Get help with your BioVault app</Text>
								</View>
							</View>
							<Text style={[typography.bodyText, { color: theme.textSecondary, fontSize: 20 }]}>›</Text>
						</View>
					</TouchableOpacity>
				</View>

				<View style={{ marginBottom: 24 }}>
					<Text style={[typography.sectionTitle, { color: theme.textPrimary }]}>Developer Options</Text>
					<TouchableOpacity style={[buttons.destructive, { marginTop: 12 }]} onPress={handleResetOnboarding}>
						<Text style={typography.buttonTextSmall}>Reset Onboarding</Text>
					</TouchableOpacity>
				</View>

				<View style={[layout.centeredContainer, { paddingVertical: 32 }]}>
					<Text style={[typography.cardTitle, { color: theme.primary, textAlign: 'center' }]}>BioVault - Secure Genomic Data Management</Text>
					<Text style={[typography.caption, { color: theme.textSecondary, textAlign: 'center', marginTop: 4 }]}>Made with privacy and security in mind</Text>
				</View>
			</ScrollView>
		</SafeAreaView>
	)
}