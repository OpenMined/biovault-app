import { OMText } from '@/components/ui/OMText'
import { useAnalytics } from '@/hooks/useAnalytics'
import { setAppPreferenceSync } from '@/lib/app-preferences'
import { setExploreDemoModeEnabledSync } from '@/lib/demo-mode'
import { getNewsletterApiUrl, subscribeToNewsletter } from '@/lib/newsletter'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import Constants from 'expo-constants'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

function openResetConfirmation(onConfirm: () => void) {
	if (Platform.OS === 'web') {
		// Browser modal dialogs are unreliable in some embedded/web runtimes.
		// Execute immediately on web so the reset action always works.
		onConfirm()
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

type NewsletterEntryPoint = 'settings' | 'lab-sidebar'

function normalizeNewsletterEntryPoint(value: string | string[] | undefined): NewsletterEntryPoint {
	const rawValue = Array.isArray(value) ? value[0] : value
	return rawValue === 'lab-sidebar' ? 'lab-sidebar' : 'settings'
}

function getNewsletterSource(entryPoint: NewsletterEntryPoint) {
	return Platform.OS === 'web' ? `biovault-app-web-${entryPoint}` : `biovault-app-${Platform.OS}-settings`
}

function NewsletterSignupCard({ entryPoint }: { entryPoint: NewsletterEntryPoint }) {
	const { trackEvent } = useAnalytics({ trackScreenView: false, trackAppState: false, includeRouteParams: false })
	const [email, setEmail] = useState('')
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [message, setMessage] = useState('')
	const [messageTone, setMessageTone] = useState<'default' | 'error'>('default')

	const handleSubmit = async () => {
		const normalizedEmail = email.trim()
		if (!normalizedEmail) {
			setMessage('Enter an email address.')
			setMessageTone('error')
			return
		}

		setIsSubmitting(true)
		setMessage('')
		setMessageTone('default')

		try {
			await subscribeToNewsletter({
				email: normalizedEmail,
				source: getNewsletterSource(entryPoint),
				metadata: {
					platform: Platform.OS,
					appVersion: Constants.expoConfig?.version ?? null,
					buildProfile: Constants.expoConfig?.extra?.eas?.projectId ? 'production' : 'development',
					screen: 'settings',
					entryPoint,
				},
			})
			trackEvent('newsletter_signup_submitted', {
				entryPoint,
				screen: 'settings',
				source: getNewsletterSource(entryPoint),
			})
			setEmail('')
			setMessage('Subscribed.')
			setMessageTone('default')
		} catch (error) {
			setMessage(error instanceof Error ? error.message : 'Newsletter signup failed.')
			setMessageTone('error')
		} finally {
			setIsSubmitting(false)
		}
	}

	const isDisabled = isSubmitting || email.trim().length === 0

	return (
		<View style={styles.newsletterCard}>
			<View style={styles.newsletterHeader}>
				<View style={styles.newsletterContent}>
					<OMText variant="caption" style={styles.actionLabel}>
						NEWSLETTER
					</OMText>
					<OMText variant="headline" style={styles.actionTitle}>
						Get BioVault updates
					</OMText>
					<OMText variant="body" style={styles.actionDescription}>
						Receive product updates, assay releases, and research notes from the BioVault team.
					</OMText>
				</View>
			</View>
			<View style={styles.newsletterForm}>
				<TextInput
					value={email}
					onChangeText={setEmail}
					placeholder="you@example.com"
					placeholderTextColor={omColors.grayscale500}
					keyboardType="email-address"
					autoCapitalize="none"
					autoCorrect={false}
					textContentType="emailAddress"
					inputMode="email"
					returnKeyType="send"
					onSubmitEditing={() => {
						if (!isDisabled) void handleSubmit()
					}}
					style={styles.newsletterInput}
				/>
				<Pressable
					disabled={isDisabled}
					onPress={() => void handleSubmit()}
					style={({ pressed }) => [
						styles.newsletterButton,
						isDisabled ? styles.newsletterButtonDisabled : null,
						pressed && !isDisabled ? styles.newsletterButtonPressed : null,
					]}
				>
					<OMText variant="subtitle" style={styles.newsletterButtonText}>
						{isSubmitting ? 'Joining...' : 'Join'}
					</OMText>
				</Pressable>
			</View>
			{message ? (
				<OMText variant="caption" style={messageTone === 'error' ? styles.newsletterMessageError : styles.newsletterMessage}>
					{message}
				</OMText>
			) : null}
			{process.env.EXPO_PUBLIC_NEWSLETTER_API_URL ? (
				<OMText variant="caption" style={styles.newsletterEndpoint}>
					Endpoint: {getNewsletterApiUrl()}
				</OMText>
			) : null}
		</View>
	)
}

export default function SettingsScreen() {
	const params = useLocalSearchParams<{ newsletterSource?: string | string[] }>()
	const newsletterEntryPoint = normalizeNewsletterEntryPoint(params.newsletterSource)

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
					<NewsletterSignupCard entryPoint={newsletterEntryPoint} />
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
	newsletterCard: {
		padding: omSpacing.xl,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		gap: omSpacing.m,
	},
	newsletterHeader: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		justifyContent: 'space-between',
		gap: omSpacing.l,
	},
	newsletterContent: {
		flex: 1,
		gap: omSpacing.xs,
	},
	newsletterForm: {
		flexDirection: 'row',
		alignItems: 'stretch',
		gap: omSpacing.s,
	},
	newsletterInput: {
		flex: 1,
		minHeight: 48,
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,255,255,0.06)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.12)',
		color: omTheme.primaryText,
		fontSize: 16,
		lineHeight: 22,
	},
	newsletterButton: {
		minHeight: 48,
		minWidth: 76,
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: omSpacing.l,
		borderRadius: omRadius.m,
		backgroundColor: omTheme.accent,
	},
	newsletterButtonDisabled: {
		opacity: 0.48,
	},
	newsletterButtonPressed: {
		opacity: 0.86,
	},
	newsletterButtonText: {
		color: omTheme.actionText,
	},
	newsletterMessage: {
		color: omTheme.accent,
	},
	newsletterMessageError: {
		color: omColors.red300,
	},
	newsletterEndpoint: {
		color: omColors.grayscale500,
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
