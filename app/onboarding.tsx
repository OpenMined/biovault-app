import { OMButton } from '@/components/ui/OMButton'
import { OMIcon } from '@/components/ui/OMIcon'
import { OMText } from '@/components/ui/OMText'
import { Storage } from '@/lib/storage'
import { omGradients, omRadius, omSpacing, omTheme } from '@/styles/brand'
import Checkbox from 'expo-checkbox'
import { router } from 'expo-router'
import { MeshGradientView } from 'expo-mesh-gradient'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function OnboardingScreen() {
	const [hasAgreed, setHasAgreed] = useState(
		Storage.getItemSync('hasAcceptedResearchDisclaimer') === 'true'
	)

	const handleContinue = () => {
		if (!hasAgreed) {
			return
		}

		Storage.setItemSync('hasAcceptedResearchDisclaimer', 'true')
		Storage.setItemSync('hasCompletedOnboarding', 'true')
		router.replace('/(tabs)' as any)
	}

	return (
		<View style={styles.screen}>
			<MeshGradientView
				style={styles.screenMesh}
				ignoresSafeArea
				columns={3}
				rows={3}
				colors={[
					omGradients.orangeRed[0],
					omGradients.redViolet[0],
					omGradients.violetBlue[0],
					omGradients.goldOrange[0],
					omGradients.tealGreen[1],
					omGradients.tealGreen[0],
					omGradients.goldOrange[1],
					omGradients.greenLime[0],
					omGradients.limeYellow[1],
				]}
				points={[
					[0, 0],
					[0.5, 0.02],
					[1, 0],
					[0.04, 0.5],
					[0.52, 0.48],
					[0.96, 0.46],
					[0, 1],
					[0.5, 0.98],
					[1, 1],
				]}
			/>
			<View style={styles.screenOverlay} />

			<SafeAreaView style={styles.safeArea}>
				<View style={styles.content}>
					<View style={styles.mainSection}>
						<View style={styles.heroSection}>
							<OMText variant="h3" style={styles.title}>
								Private genomic analysis on your device.
							</OMText>
						</View>

						<View style={styles.disclaimerCard}>
							<View style={styles.privacySection}>
								<View style={styles.cardHeader}>
									<OMIcon
										name="shield-checkmark-outline"
										tone="accent"
										containerTone="soft"
										containerStyle={styles.cardIcon}
									/>
									<View style={styles.cardHeaderText}>
										<OMText variant="headline" style={styles.cardTitle}>
											Private by default
										</OMText>
										<OMText variant="body" style={styles.cardLead}>
											Your genomic files stay on your phone and are never uploaded.
										</OMText>
									</View>
								</View>
								<View style={styles.signalList}>
									<View style={styles.signalRow}>
										<View style={styles.signalDot} />
										<OMText variant="body" style={styles.signalText}>
											Analysis runs locally on your device.
										</OMText>
									</View>
									<View style={styles.signalRow}>
										<View style={styles.signalDot} />
										<OMText variant="body" style={styles.signalText}>
											Results are visible only to you.
										</OMText>
									</View>
								</View>
							</View>

							<View style={styles.cardDivider} />

							<View style={styles.cardHeader}>
								<OMIcon
									name="flask-outline"
									tone="default"
									containerTone="soft"
									containerStyle={styles.disclaimerIcon}
								/>
								<View style={styles.cardHeaderText}>
									<OMText variant="headline" style={styles.cardTitle}>
										Research use only
									</OMText>
									<OMText variant="body" style={styles.disclaimerBody}>
										BioVault is a research tool, not a medical product. It does not provide
										medical advice and must not be used for diagnosis or treatment.
									</OMText>
								</View>
							</View>
						</View>
					</View>

					<View style={styles.footer}>
						<Pressable
							onPress={() => setHasAgreed((value) => !value)}
							style={[styles.checkboxRow, hasAgreed && styles.checkboxRowChecked]}
						>
							<Checkbox
								value={hasAgreed}
								onValueChange={setHasAgreed}
								color={hasAgreed ? omTheme.link : undefined}
								style={styles.checkbox}
							/>
							<OMText variant="body" style={styles.checkboxText}>
								I understand that BioVault is for research use only.
							</OMText>
						</Pressable>

						<OMButton
							label="Continue"
							iconName="arrow-forward-outline"
							onPress={handleContinue}
							disabled={!hasAgreed}
							style={[styles.continueButton, hasAgreed && styles.continueButtonEnabled]}
						/>
					</View>
				</View>
			</SafeAreaView>
		</View>
	)
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: omTheme.background,
	},
	screenMesh: {
		position: 'absolute',
		top: -48,
		right: -48,
		bottom: -48,
		left: -48,
		opacity: 0.9,
	},
	screenOverlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: 'rgba(252,252,253,0.28)',
	},
	safeArea: {
		flex: 1,
	},
	content: {
		flex: 1,
		paddingHorizontal: omSpacing.xl,
		paddingTop: omSpacing.s,
		paddingBottom: omSpacing.l,
		maxWidth: 420,
		width: '100%',
		alignSelf: 'center',
	},
	mainSection: {
		flex: 1,
		justifyContent: 'center',
		gap: omSpacing.m,
	},
	heroSection: {
		paddingHorizontal: omSpacing.xs,
		paddingTop: omSpacing.xs,
		paddingBottom: omSpacing.xs,
	},
	title: {
		color: omTheme.textHeadline,
		letterSpacing: -1,
		fontSize: 40,
		lineHeight: 43,
		maxWidth: 320,
	},
	disclaimerCard: {
		paddingHorizontal: omSpacing.l,
		paddingVertical: omSpacing.m,
		borderRadius: 20,
		backgroundColor: 'rgba(252,252,253,0.94)',
		borderWidth: 1,
		borderColor: 'rgba(39,37,50,0.06)',
		shadowColor: '#17161d',
		shadowOffset: { width: 0, height: 10 },
		shadowOpacity: 0.05,
		shadowRadius: 20,
		elevation: 2,
	},
	cardHeader: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: omSpacing.m,
	},
	privacySection: {
		gap: omSpacing.s,
	},
	cardDivider: {
		height: 1,
		backgroundColor: 'rgba(39,37,50,0.08)',
		marginVertical: omSpacing.m,
	},
	cardIcon: {
		backgroundColor: 'rgba(82,168,197,0.12)',
	},
	disclaimerIcon: {
		backgroundColor: 'rgba(244,243,246,0.92)',
	},
	cardHeaderText: {
		flex: 1,
	},
	cardTitle: {
		color: omTheme.textHeadline,
	},
	cardLead: {
		marginTop: omSpacing.xs,
		color: omTheme.textBody,
		fontSize: 16,
		lineHeight: 22,
	},
	disclaimerBody: {
		marginTop: omSpacing.xs,
		color: omTheme.textBody,
		fontSize: 15,
		lineHeight: 21,
	},
	signalList: {
		marginTop: omSpacing.m,
		gap: omSpacing.s,
	},
	signalRow: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: 10,
	},
	signalDot: {
		width: 8,
		height: 8,
		borderRadius: omRadius.full,
		backgroundColor: omTheme.link,
		marginTop: 7,
	},
	signalText: {
		flex: 1,
		color: omTheme.textHeadline,
		fontSize: 15,
		lineHeight: 21,
	},
	footer: {
		gap: omSpacing.m,
		paddingTop: omSpacing.m,
	},
	checkboxRow: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: omSpacing.m,
		paddingHorizontal: omSpacing.m,
		paddingVertical: 14,
		borderRadius: 16,
		backgroundColor: 'rgba(252,252,253,0.9)',
		borderWidth: 1,
		borderColor: 'rgba(39,37,50,0.06)',
	},
	checkboxRowChecked: {
		backgroundColor: 'rgba(236,245,249,0.96)',
		borderColor: 'rgba(56,140,168,0.2)',
	},
	checkbox: {
		marginTop: 2,
	},
	checkboxText: {
		flex: 1,
		color: omTheme.textBody,
		fontSize: 15,
		lineHeight: 21,
	},
	continueButton: {
		minHeight: 52,
		borderRadius: 16,
		backgroundColor: 'rgba(39,37,50,0.18)',
		borderWidth: 1,
		borderColor: 'rgba(39,37,50,0.06)',
	},
	continueButtonEnabled: {
		backgroundColor: omTheme.primary,
		borderColor: omTheme.primary,
		shadowColor: '#17161d',
		shadowOffset: { width: 0, height: 12 },
		shadowOpacity: 0.18,
		shadowRadius: 24,
		elevation: 4,
	},
})
