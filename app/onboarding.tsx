import { OMButton } from '@/components/ui/OMButton'
import { OMText } from '@/components/ui/OMText'
import { Storage } from '@/lib/storage'
import { omGradients, omSpacing, omTheme } from '@/styles/brand'
import Checkbox from 'expo-checkbox'
import * as Linking from 'expo-linking'
import { router } from 'expo-router'
import { MeshGradientView } from 'expo-mesh-gradient'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
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
					<View style={styles.heroSection}>
						<View style={styles.heroGlow} />
						<OMText variant="h3" style={styles.title}>
							Welcome to BioVault
						</OMText>
						<OMText variant="body" style={styles.body}>
							A technology by{' '}
							<OMText
								variant="body"
								tone="accent"
								style={styles.linkText}
								onPress={() => Linking.openURL('https://www.openmined.org')}
							>
								OpenMined
							</OMText>
							, our goal is making genomics accessible to everyone.
						</OMText>
					</View>

					<View style={styles.sectionDivider} />

					<View style={styles.copySection}>
						<OMText variant="headline">Private by default</OMText>
						<OMText variant="body" style={styles.body}>
							Total privacy and full control. Your personal files stay on your phone and are never
							uploaded anywhere.
						</OMText>
						<OMText variant="body" style={styles.body}>
							All analysis runs locally on your device, and the results are for your eyes only.
						</OMText>
					</View>

					<View style={styles.sectionDivider} />

					<View style={styles.copySection}>
						<OMText variant="headline">Research disclaimer</OMText>
						<OMText variant="body" style={styles.body}>
							BioVault is a research tool, not a medical product, and it does not provide medical
							advice. Do not use it to diagnose or treat any condition.
						</OMText>
						<View style={styles.checkboxRow}>
							<Checkbox
								value={hasAgreed}
								onValueChange={setHasAgreed}
								color={hasAgreed ? omTheme.link : undefined}
								style={styles.checkbox}
							/>
							<OMText variant="body" style={styles.checkboxText}>
								I understand and want to continue.
							</OMText>
						</View>
					</View>

					<OMButton
						label="Continue"
						iconName="arrow-forward-outline"
						onPress={handleContinue}
						disabled={!hasAgreed}
						style={styles.continueButton}
					/>
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
		backgroundColor: 'rgba(252,252,253,0.18)',
	},
	safeArea: {
		flex: 1,
	},
	content: {
		flex: 1,
		padding: omSpacing.xl,
		gap: omSpacing.xl,
		maxWidth: 420,
		width: '100%',
		alignSelf: 'center',
		paddingTop: omSpacing.xxxl,
		paddingBottom: omSpacing.xxl,
	},
	heroSection: {
		paddingHorizontal: omSpacing.xs,
		position: 'relative',
		paddingTop: omSpacing.l,
		paddingBottom: omSpacing.s,
	},
	copySection: {
		paddingHorizontal: omSpacing.xs,
	},
	sectionDivider: {
		height: 1,
		backgroundColor: 'rgba(39,37,50,0.08)',
		marginHorizontal: omSpacing.xs,
	},
	title: {
		color: omTheme.textHeadline,
		letterSpacing: -0.8,
		fontSize: 42,
		lineHeight: 46,
		maxWidth: 300,
	},
	body: {
		marginTop: omSpacing.s,
		color: omTheme.textBody,
		maxWidth: 340,
		fontSize: 17,
		lineHeight: 26,
	},
	linkText: {
		textDecorationLine: 'underline',
	},
	heroGlow: {
		position: 'absolute',
		top: -4,
		left: -8,
		width: 140,
		height: 140,
		borderRadius: 999,
		backgroundColor: 'rgba(82,168,197,0.16)',
	},
	checkboxRow: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: omSpacing.m,
		marginTop: omSpacing.l,
		paddingTop: omSpacing.s,
	},
	checkbox: {
		marginTop: 2,
	},
	checkboxText: {
		flex: 1,
		color: omTheme.textBody,
	},
	continueButton: {
		marginTop: 'auto',
		minHeight: 52,
	},
})
