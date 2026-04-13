import { OMText } from '@/components/ui/OMText'
import { useAnalytics } from '@/hooks/useAnalytics'
import { setAppPreferenceSync } from '@/lib/app-preferences'
import { setExploreDemoModeEnabledSync } from '@/lib/demo-mode'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

function openResetConfirmation(onConfirm: () => void) {
	if (Platform.OS === 'web') {
		const confirmed = window.confirm(
			'This will reset the onboarding flow and show it again on next app launch. Continue?'
		)
		if (confirmed) {
			onConfirm()
		}
		return
	}

	Alert.alert(
		'Reset Onboarding',
		'This will reset the onboarding flow and show it again on next app launch. Continue?',
		[
			{ text: 'Cancel', style: 'cancel' },
			{ text: 'Reset', style: 'destructive', onPress: onConfirm },
		]
	)
}

function showResetSuccess() {
	if (Platform.OS === 'web') {
		window.alert('Onboarding has been reset.')
		router.replace('/onboarding')
		return
	}

	Alert.alert('Success', 'Onboarding has been reset.', [
		{ text: 'Go to Onboarding', onPress: () => router.replace('/onboarding') },
		{ text: 'OK', style: 'cancel' },
	])
}

function SettingsActionCard({
	label,
	title,
	description,
	onPress,
	trailing = 'Open',
	tone = 'default',
}: {
	label?: string
	title: string
	description: string
	onPress: () => void
	trailing?: string
	tone?: 'default' | 'danger'
}) {
	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [
				styles.actionCard,
				tone === 'danger' ? styles.actionCardDanger : null,
				pressed ? styles.actionCardPressed : null,
			]}
		>
			<View style={styles.actionContent}>
				{label ? (
					<OMText variant="caption" style={tone === 'danger' ? styles.dangerLabel : styles.actionLabel}>
						{label}
					</OMText>
				) : null}
				<OMText variant="headline" style={tone === 'danger' ? styles.dangerTitle : styles.actionTitle}>
					{title}
				</OMText>
				<OMText variant="body" style={tone === 'danger' ? styles.dangerDescription : styles.actionDescription}>
					{description}
				</OMText>
			</View>
			<View style={tone === 'danger' ? styles.dangerPill : styles.actionPill}>
				<OMText variant="subtitle" style={tone === 'danger' ? styles.dangerPillText : styles.actionPillText}>
					{trailing}
				</OMText>
			</View>
		</Pressable>
	)
}

export default function SettingsScreen() {
	useAnalytics({
		trackScreenView: true,
		screenProperties: { screen: 'Settings' },
	})

	const handleResetOnboarding = () => {
		openResetConfirmation(() => {
			setAppPreferenceSync('hasCompletedOnboarding', null)
			setAppPreferenceSync('hasAcceptedResearchDisclaimer', null)
			setExploreDemoModeEnabledSync(false)
			showResetSuccess()
		})
	}

	return (
		<SafeAreaView style={styles.safeArea} edges={['top']}>
			<ScrollView
				style={styles.screen}
				contentContainerStyle={styles.content}
				showsVerticalScrollIndicator={false}
			>
				<View style={styles.hero}>
					<OMText variant="h3" style={styles.title}>
						Settings
					</OMText>
					<OMText variant="body" style={styles.body}>
						Manage privacy, support, local data, and app preferences for this device.
					</OMText>
				</View>

				<View style={styles.section}>
					<OMText variant="subtitle" style={styles.sectionTitle}>
						APP INFORMATION
					</OMText>
					<View style={styles.infoCard}>
						<View style={styles.infoRow}>
							<OMText variant="body" style={styles.infoLabel}>
								Version
							</OMText>
							<OMText variant="headline" style={styles.infoValue}>
								{Constants.expoConfig?.version || '1.0.0'}
							</OMText>
						</View>
						<View style={styles.infoDivider} />
						<View style={styles.infoRow}>
							<OMText variant="body" style={styles.infoLabel}>
								Build
							</OMText>
							<OMText variant="headline" style={styles.infoValue}>
								{Constants.expoConfig?.extra?.eas?.projectId ? 'Production' : 'Development'}
							</OMText>
						</View>
					</View>
				</View>

				<View style={styles.section}>
					<OMText variant="subtitle" style={styles.sectionTitle}>
						PRIVACY
					</OMText>
					<View style={styles.privacyCard}>
						<View style={styles.privacyBadge}>
							<OMText variant="subtitle" style={styles.privacyBadgeText}>
								Local by default
							</OMText>
						</View>
						<OMText variant="headline" style={styles.privacyTitle}>
							Your genomic data stays on this device.
						</OMText>
						<OMText variant="body" style={styles.privacyBody}>
							Imported files, processing, and saved results remain local unless you explicitly choose
							to share something.
						</OMText>
						<View style={styles.linkRow}>
							<Pressable onPress={() => Linking.openURL('https://biovault.net/privacy')} style={styles.linkButton}>
								<OMText variant="subtitle" style={styles.linkButtonText}>
									Privacy Policy
								</OMText>
							</Pressable>
							<Pressable onPress={() => Linking.openURL('https://biovault.net/terms')} style={styles.linkButton}>
								<OMText variant="subtitle" style={styles.linkButtonText}>
									Terms
								</OMText>
							</Pressable>
						</View>
					</View>
				</View>

				<View style={styles.section}>
					<OMText variant="subtitle" style={styles.sectionTitle}>
						SUPPORT
					</OMText>
					<SettingsActionCard
						label="SUPPORT"
						title="Contact support"
						description="Send questions or bug reports to the BioVault team."
						trailing="Email"
						onPress={() => Linking.openURL('mailto:support@biovault.net?subject=BioVault App Support')}
					/>
				</View>

				<View style={styles.section}>
					<OMText variant="subtitle" style={styles.sectionTitle}>
						ASSAYS
					</OMText>
					<SettingsActionCard
						label="PACKAGES"
						title="Manage assay packages"
						description="Install or remove assay packages from GitHub on this device."
						trailing="Manage"
						onPress={() => router.push('/settings/assays' as const)}
					/>
				</View>

				<View style={styles.section}>
					<OMText variant="subtitle" style={styles.sectionTitle}>
						DATA MANAGEMENT
					</OMText>
					<SettingsActionCard
						label="LOCAL DATA"
						title="Manage local data"
						description="Delete imported files or clear the local results database from this device."
						trailing="Manage"
						tone="danger"
						onPress={() => router.push('/settings/local-data' as const)}
					/>
				</View>

				<View style={styles.section}>
					<OMText variant="subtitle" style={styles.sectionTitle}>
						DEVELOPER OPTIONS
					</OMText>
					<SettingsActionCard
						label="RESET"
						title="Reset onboarding"
						description="Show onboarding again and clear the saved onboarding completion flags."
						trailing="Reset"
						onPress={handleResetOnboarding}
					/>
				</View>

				<View style={styles.footer}>
					<OMText variant="headline" style={styles.footerTitle}>
						BioVault
					</OMText>
					<OMText variant="body" style={styles.footerBody}>
						Secure genomic data management with local-first defaults.
					</OMText>
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
	hero: {
		gap: omSpacing.m,
		paddingTop: omSpacing.m,
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
	section: {
		gap: omSpacing.m,
	},
	sectionTitle: {
		color: omColors.grayscale400,
		letterSpacing: 1,
	},
	infoCard: {
		padding: omSpacing.xl,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		gap: omSpacing.m,
	},
	infoRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.l,
	},
	infoDivider: {
		height: 1,
		backgroundColor: 'rgba(255,255,255,0.08)',
	},
	infoLabel: {
		color: omColors.grayscale400,
	},
	infoValue: {
		color: omTheme.primaryText,
	},
	privacyCard: {
		padding: omSpacing.xl,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		gap: omSpacing.m,
	},
	privacyBadge: {
		alignSelf: 'flex-start',
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.xs,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(83,190,169,0.14)',
		borderWidth: 1,
		borderColor: 'rgba(83,190,169,0.28)',
	},
	privacyBadgeText: {
		color: omTheme.accent,
	},
	privacyTitle: {
		color: omTheme.primaryText,
	},
	privacyBody: {
		color: omColors.grayscale400,
	},
	linkRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: omSpacing.m,
	},
	linkButton: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(255,255,255,0.06)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
	},
	linkButtonText: {
		color: omTheme.primaryText,
	},
	actionCard: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		justifyContent: 'space-between',
		gap: omSpacing.l,
		padding: omSpacing.xl,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
	},
	actionCardDanger: {
		backgroundColor: 'rgba(138,46,64,0.16)',
		borderColor: 'rgba(224,163,176,0.24)',
	},
	actionCardPressed: {
		opacity: 0.9,
	},
	actionContent: {
		flex: 1,
		gap: omSpacing.xs,
	},
	actionLabel: {
		color: omColors.grayscale500,
		letterSpacing: 1,
	},
	actionTitle: {
		color: omTheme.primaryText,
	},
	actionDescription: {
		color: omColors.grayscale400,
	},
	actionPill: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(255,255,255,0.06)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
	},
	actionPillText: {
		color: omTheme.accent,
	},
	dangerLabel: {
		color: omColors.red300,
		letterSpacing: 1,
	},
	dangerTitle: {
		color: omTheme.primaryText,
	},
	dangerDescription: {
		color: omColors.grayscale300,
	},
	dangerPill: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(250,240,242,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(224,163,176,0.24)',
	},
	dangerPillText: {
		color: omColors.red300,
	},
	footer: {
		paddingTop: omSpacing.s,
		paddingBottom: omSpacing.xl,
		gap: omSpacing.xs,
		alignItems: 'center',
	},
	footerTitle: {
		color: omTheme.primaryText,
	},
	footerBody: {
		color: omColors.grayscale500,
		textAlign: 'center',
	},
})
