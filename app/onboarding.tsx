import { OMButton } from '@/components/ui/OMButton'
import { OMIcon } from '@/components/ui/OMIcon'
import { OMText } from '@/components/ui/OMText'
import { Storage } from '@/lib/storage'
import { omGradients, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { router } from 'expo-router'
import { MeshGradientView } from 'expo-mesh-gradient'
import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function OnboardingScreen() {
	const [hasAgreed, setHasAgreed] = useState(
		Storage.getItemSync('hasAcceptedResearchDisclaimer') === 'true'
	)
	const titleAnim = useRef(new Animated.Value(0)).current
	const privacyAnim = useRef(new Animated.Value(0)).current
	const researchAnim = useRef(new Animated.Value(0)).current
	const consentAnim = useRef(new Animated.Value(0)).current
	const buttonAnim = useRef(new Animated.Value(0)).current

	useEffect(() => {
		Animated.stagger(90, [
			Animated.timing(titleAnim, {
				toValue: 1,
				duration: 320,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: true,
			}),
			Animated.timing(privacyAnim, {
				toValue: 1,
				duration: 320,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: true,
			}),
			Animated.timing(researchAnim, {
				toValue: 1,
				duration: 320,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: true,
			}),
			Animated.timing(consentAnim, {
				toValue: 1,
				duration: 320,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: true,
			}),
			Animated.timing(buttonAnim, {
				toValue: 1,
				duration: 320,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: true,
			}),
		]).start()
	}, [buttonAnim, consentAnim, privacyAnim, researchAnim, titleAnim])

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
							<Animated.View style={[styles.heroSection, getFadeUpStyle(titleAnim, 18)]}>
								<OMText variant="h3" style={styles.title}>
									Private genomic analysis on your device.
								</OMText>
								<OMText variant="body" style={styles.heroSupport}>
									Review the privacy and research notes below before continuing.
								</OMText>
							</Animated.View>

							<View style={styles.infoSections}>
								<Animated.View style={[styles.infoSection, getFadeUpStyle(privacyAnim, 16)]}>
									<OMText variant="caption" style={styles.sectionEyebrow}>
										PRIVATE
									</OMText>
									<View style={styles.signalList}>
										<OMText variant="body" style={styles.signalText}>
											Your files are never uploaded.
										</OMText>
										<OMText variant="body" style={styles.signalText}>
											Analysis runs locally.
										</OMText>
										<OMText variant="body" style={styles.signalText}>
											Results are visible only to you.
										</OMText>
									</View>
								</Animated.View>

								<View style={styles.sectionDivider} />

								<Animated.View style={[styles.infoSection, getFadeUpStyle(researchAnim, 16)]}>
									<OMText variant="caption" style={styles.sectionEyebrow}>
										DISCLAIMER
									</OMText>
									<View style={styles.cardHeaderText}>
										<OMText variant="body" style={styles.disclaimerBody}>
											BioVault is a research tool, not a medical product. Do not use it for
											diagnosis or treatment.
										</OMText>
									</View>
								</Animated.View>
							</View>
						</View>

						<View style={styles.footer}>
							<Animated.View style={getFadeUpStyle(consentAnim, 14)}>
								<Pressable
									onPress={() => setHasAgreed((value) => !value)}
									style={[styles.checkboxRow, hasAgreed && styles.checkboxRowChecked]}
								>
									<View style={[styles.checkboxBox, hasAgreed && styles.checkboxBoxChecked]}>
										{hasAgreed ? (
											<OMIcon name="checkmark" size={14} tone="accent" />
										) : null}
									</View>
									<OMText variant="body" style={styles.checkboxText}>
										I understand and want to continue.
									</OMText>
								</Pressable>
							</Animated.View>

							<Animated.View style={getFadeUpStyle(buttonAnim, 12)}>
								<OMButton
									label="Continue"
									iconName="arrow-forward-outline"
									onPress={handleContinue}
									disabled={!hasAgreed}
									style={[styles.continueButton, hasAgreed && styles.continueButtonEnabled]}
								/>
							</Animated.View>
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
		paddingTop: omSpacing.xxxl,
		paddingBottom: omSpacing.l,
		maxWidth: 420,
		width: '100%',
		alignSelf: 'center',
	},
	mainSection: {
		gap: omSpacing.s,
	},
	heroSection: {
		paddingHorizontal: omSpacing.xs,
		paddingTop: 0,
		paddingBottom: omSpacing.s,
	},
	title: {
		color: omTheme.textHeadline,
		letterSpacing: -1,
		fontSize: 40,
		lineHeight: 43,
		maxWidth: 320,
	},
	heroSupport: {
		marginTop: omSpacing.m,
		maxWidth: 320,
		color: omTheme.textBody,
		fontSize: 15,
		lineHeight: 21,
	},
	infoSections: {
		gap: omSpacing.m,
		paddingHorizontal: omSpacing.xs,
	},
	infoSection: {
		paddingVertical: omSpacing.s,
	},
	sectionEyebrow: {
		marginBottom: omSpacing.xs,
		color: omTheme.textMuted,
		letterSpacing: 1,
	},
	sectionDivider: {
		height: 1,
		backgroundColor: 'rgba(39,37,50,0.06)',
		marginHorizontal: omSpacing.s,
	},
	cardHeaderText: {
		width: '100%',
	},
	disclaimerBody: {
		color: omTheme.textBody,
		fontSize: 16,
		lineHeight: 22,
	},
	signalList: {
		marginTop: omSpacing.m,
		gap: omSpacing.m,
	},
	signalText: {
		color: omTheme.textHeadline,
		fontSize: 16,
		lineHeight: 22,
	},
	footer: {
		marginTop: omSpacing.l,
		gap: omSpacing.s,
		paddingTop: 0,
	},
	checkboxRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: omSpacing.m,
		paddingHorizontal: omSpacing.m,
		paddingVertical: 14,
		borderRadius: 16,
		backgroundColor: 'rgba(252,252,253,0.62)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.22)',
	},
	checkboxRowChecked: {
		backgroundColor: 'rgba(236,245,249,0.74)',
		borderColor: 'rgba(56,140,168,0.22)',
	},
	checkboxBox: {
		width: 22,
		height: 22,
		borderRadius: omRadius.s,
		borderWidth: 1.5,
		borderColor: 'rgba(94,90,114,0.6)',
		backgroundColor: 'rgba(252,252,253,0.72)',
		alignItems: 'center',
		justifyContent: 'center',
		flexShrink: 0,
	},
	checkboxBoxChecked: {
		borderColor: 'rgba(56,140,168,0.5)',
		backgroundColor: 'rgba(236,245,249,0.92)',
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
		backgroundColor: 'rgba(39,37,50,0.42)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.14)',
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

function getFadeUpStyle(progress: Animated.Value, distance: number) {
	return {
		opacity: progress,
		transform: [
			{
				translateY: progress.interpolate({
					inputRange: [0, 1],
					outputRange: [distance, 0],
				}),
			},
		],
	}
}
