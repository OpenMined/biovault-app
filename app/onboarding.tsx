import { OMButton } from '@/components/ui/OMButton'
import { OMIcon } from '@/components/ui/OMIcon'
import { OMText } from '@/components/ui/OMText'
import { getAppPreferenceSync, setAppPreferenceSync } from '@/lib/app-preferences'
import { useColorScheme } from '@/lib/color-theme'
import { getDeferredLaunchUrlSync } from '@/lib/deferred-launch-url'
import { setExploreDemoModeEnabledSync } from '@/lib/demo-mode'
import { omGradients, omRadius, omSpacing } from '@/styles/brand'
import { labPalettes, type LabPalette } from '@/styles/lab-theme'
import { LinearGradient } from 'expo-linear-gradient'
import * as Linking from 'expo-linking'
import { router } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
	Animated,
	Easing,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	View,
	useWindowDimensions,
} from 'react-native'
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg'
import { SafeAreaView } from 'react-native-safe-area-context'

function openOpenMinedWebsite() {
	if (Platform.OS === 'web' && typeof window !== 'undefined') {
		window.open('https://www.openmined.org', '_blank', 'noopener,noreferrer')
		return
	}
	void Linking.openURL('https://www.openmined.org')
}

export type OnboardingAgreementCardProps = {
	hasAgreed: boolean
	onContinue: () => void
	onToggleAgreed: () => void
}

export default function OnboardingScreen() {
	const [hasAgreed, setHasAgreed] = useState(
		getAppPreferenceSync('hasAcceptedResearchDisclaimer') === 'true',
	)
	const handleContinue = () => {
		if (!hasAgreed) return
		const deferredLaunchUrl = Platform.OS === 'web' ? getDeferredLaunchUrlSync() : null
		setAppPreferenceSync('hasAcceptedResearchDisclaimer', 'true')
		setAppPreferenceSync('hasCompletedOnboarding', 'true')
		setExploreDemoModeEnabledSync(true)
		if (deferredLaunchUrl && Platform.OS === 'web' && typeof window !== 'undefined') {
			window.location.replace(deferredLaunchUrl)
			return
		}
		router.replace('/(tabs)' as any)
	}

	return (
		<OnboardingAgreementCard
			hasAgreed={hasAgreed}
			onContinue={handleContinue}
			onToggleAgreed={() => setHasAgreed((value) => !value)}
		/>
	)
}

export function OnboardingAgreementCard({
	hasAgreed,
	onContinue,
	onToggleAgreed,
}: OnboardingAgreementCardProps) {
	const scheme = useColorScheme()
	const palette = labPalettes[scheme]
	const { width } = useWindowDimensions()
	const isWebWide = Platform.OS === 'web' && width >= 720
	const styles = useMemo(
		() => makeStyles(palette, { isWebWide }),
		[palette, isWebWide],
	)
	const stackOpacity = useRef(new Animated.Value(0)).current
	const stackTranslateY = useRef(new Animated.Value(10)).current
	const infoCardOpacity = useRef(new Animated.Value(0)).current
	const infoCardTranslateY = useRef(new Animated.Value(8)).current

	useEffect(() => {
		Animated.parallel([
			Animated.timing(stackOpacity, {
				toValue: 1,
				duration: 220,
				easing: Easing.out(Easing.quad),
				useNativeDriver: Platform.OS !== 'web',
			}),
			Animated.timing(stackTranslateY, {
				toValue: 0,
				duration: 220,
				easing: Easing.out(Easing.quad),
				useNativeDriver: Platform.OS !== 'web',
			}),
			Animated.timing(infoCardOpacity, {
				toValue: 1,
				duration: 260,
				delay: 50,
				easing: Easing.out(Easing.quad),
				useNativeDriver: Platform.OS !== 'web',
			}),
			Animated.timing(infoCardTranslateY, {
				toValue: 0,
				duration: 260,
				delay: 50,
				easing: Easing.out(Easing.quad),
				useNativeDriver: Platform.OS !== 'web',
			}),
		]).start()
	}, [infoCardOpacity, infoCardTranslateY, stackOpacity, stackTranslateY])

	return (
		<View style={styles.screen}>
			<SafeAreaView style={styles.safeArea}>
				<ScrollView
					style={styles.scroll}
					contentContainerStyle={styles.content}
					showsVerticalScrollIndicator={false}
				>
					<Animated.View
						style={[
							styles.stack,
							{
								opacity: stackOpacity,
								transform: [{ translateY: stackTranslateY }],
							},
						]}
					>
						<View style={styles.mainSection}>
							<View style={styles.heroSection}>
								<OMText variant="caption" style={styles.heroKicker}>
									BIOVAULT
								</OMText>
								<OMText variant="h3" style={styles.title}>
									Private genomic analysis on your device.
								</OMText>
								<OMText variant="body" style={styles.heroSupport}>
									Review the privacy and research notes below before continuing.
								</OMText>
							</View>

							<Animated.View
								style={{
									opacity: infoCardOpacity,
									transform: [{ translateY: infoCardTranslateY }],
								}}
							>
								<LinearGradient
									colors={[
										omGradients.orangeRed[0],
										omGradients.redViolet[0],
										omGradients.violetBlue[0],
										omGradients.tealGreen[0],
										omGradients.greenLime[0],
									]}
									start={{ x: 0, y: 0 }}
									end={{ x: 1, y: 1 }}
									style={styles.infoCardBorder}
								>
									<View style={styles.infoCard}>
										<View style={styles.signalList}>
											<SignalRow palette={palette}>
												Your files are never uploaded.
											</SignalRow>
											<SignalRow palette={palette}>
												Analysis runs locally.
											</SignalRow>
											<SignalRow palette={palette}>
												Results are visible only to you.
											</SignalRow>
										</View>
									</View>
								</LinearGradient>
							</Animated.View>

							<View style={styles.disclaimerPanel}>
								<OMText variant="caption" style={styles.disclaimerKicker}>
									RESEARCH USE ONLY
								</OMText>
								<OMText variant="body" style={styles.disclaimerBody}>
									BioVault is a research tool, not a medical product. Do not use it for
									diagnosis or treatment.
								</OMText>
							</View>

							<View style={styles.metricsPanel}>
								<OMText variant="caption" style={styles.metricsKicker}>
									TELEMETRY
								</OMText>
								<OMText variant="body" style={styles.metricsBody}>
									We collect privacy-preserving usage metrics (such as page views
									and returning visits) to improve the app. Your genomic data or
									analysis results are never included.
								</OMText>
							</View>
						</View>

						<View style={styles.footer}>
							<Pressable
								onPress={onToggleAgreed}
								style={[styles.checkboxRow, hasAgreed && styles.checkboxRowChecked]}
							>
								<View style={[styles.checkboxBox, hasAgreed && styles.checkboxBoxChecked]}>
									{hasAgreed ? <OMIcon name="checkmark" size={14} tone="accent" /> : null}
								</View>
								<OMText variant="body" style={styles.checkboxText}>
									I understand and want to continue.
								</OMText>
							</Pressable>

							<OMButton
								label="Continue"
								onPress={onContinue}
								disabled={!hasAgreed}
								labelStyle={!hasAgreed ? styles.continueButtonLabelDisabled : null}
								style={[
									styles.continueButton,
									!hasAgreed ? styles.continueButtonDisabled : null,
									hasAgreed && styles.continueButtonEnabled,
								]}
							/>

							<Pressable
								onPress={openOpenMinedWebsite}
								style={styles.footerCreditRow}
							>
								<OMText variant="caption" style={styles.footerCredit}>
									Built by{' '}
									<OMText variant="caption" style={styles.footerCreditLink}>
										OpenMined
									</OMText>
								</OMText>
								<OpenMinedLogoMark />
							</Pressable>
						</View>
					</Animated.View>
				</ScrollView>
			</SafeAreaView>
		</View>
	)
}

function SignalRow({
	children,
	palette,
}: {
	children: string
	palette: LabPalette
}) {
	return (
		<View style={rowStyles.row}>
			<View
				style={[
					rowStyles.bullet,
					{ backgroundColor: palette.accentSoft, borderColor: palette.accentBorder },
				]}
			>
				<OMIcon name="checkmark" size={12} tone="accent" />
			</View>
			<OMText variant="body" style={[rowStyles.text, { color: palette.text }]}>
				{children}
			</OMText>
		</View>
	)
}

const rowStyles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: omSpacing.m,
	},
	bullet: {
		width: 22,
		height: 22,
		borderRadius: 11,
		alignItems: 'center',
		justifyContent: 'center',
		borderWidth: 1,
	},
	text: {
		flex: 1,
		fontSize: 16,
		lineHeight: 22,
	},
})

function makeStyles(p: LabPalette, opts: { isWebWide: boolean }) {
	return StyleSheet.create({
		screen: {
			flex: 1,
			backgroundColor: p.pageBg,
		},
		safeArea: {
			flex: 1,
		},
		scroll: {
			flex: 1,
		},
		content: {
			flexGrow: 1,
			paddingHorizontal: opts.isWebWide ? omSpacing.xl : omSpacing.l,
			paddingVertical: opts.isWebWide ? omSpacing.xl : omSpacing.l,
			maxWidth: opts.isWebWide ? 520 : 420,
			width: '100%',
			alignSelf: 'center',
			justifyContent: 'center',
		},
		stack: {
			gap: opts.isWebWide ? omSpacing.xl : omSpacing.m,
		},
		mainSection: {
			gap: opts.isWebWide ? omSpacing.l : omSpacing.m,
		},
		heroSection: {
			gap: opts.isWebWide ? omSpacing.s : omSpacing.xs,
			paddingBottom: opts.isWebWide ? omSpacing.s : 0,
		},
		heroKicker: {
			color: p.accentStrong,
			letterSpacing: 1.6,
		},
		title: {
			color: p.text,
			letterSpacing: 0,
			fontSize: opts.isWebWide ? 40 : 30,
			lineHeight: opts.isWebWide ? 44 : 34,
		},
		heroSupport: {
			color: p.textMuted,
			fontSize: opts.isWebWide ? 16 : 15,
			lineHeight: opts.isWebWide ? 22 : 20,
			marginTop: omSpacing.xs,
		},
		infoCardBorder: {
			borderRadius: omRadius.l,
			padding: 1.5,
		},
		metricsPanel: {
			gap: omSpacing.xs,
			paddingHorizontal: opts.isWebWide ? omSpacing.l : omSpacing.m,
			paddingVertical: opts.isWebWide ? omSpacing.l : omSpacing.m,
			borderRadius: omRadius.l,
			backgroundColor: p.accentSoft,
			borderWidth: 1,
			borderColor: p.accentBorder,
			marginBottom: omSpacing.m,
		},
		metricsKicker: {
			color: p.accentStrong,
			letterSpacing: 1.4,
		},
		metricsBody: {
			color: p.text,
			fontSize: opts.isWebWide ? 15 : 14,
			lineHeight: opts.isWebWide ? 22 : 20,
		},
		infoCard: {
			margin: 1.5,
			paddingHorizontal: opts.isWebWide ? omSpacing.xl : omSpacing.l,
			paddingVertical: opts.isWebWide ? omSpacing.xl : omSpacing.l,
			borderRadius: omRadius.l,
			backgroundColor: p.surfaceSolid,
		},
		signalList: {
			gap: opts.isWebWide ? omSpacing.l : omSpacing.m,
		},
		disclaimerPanel: {
			gap: omSpacing.xs,
			paddingHorizontal: opts.isWebWide ? omSpacing.l : omSpacing.m,
			paddingVertical: opts.isWebWide ? omSpacing.l : omSpacing.m,
			borderRadius: omRadius.l,
			backgroundColor: p.warningBg,
			borderWidth: 1,
			borderColor: p.warningBorder,
		},
		disclaimerKicker: {
			color: p.warningText,
			letterSpacing: 1.4,
		},
		disclaimerBody: {
			color: p.warningText,
			fontSize: opts.isWebWide ? 15 : 14,
			lineHeight: opts.isWebWide ? 22 : 20,
		},
		footer: {
			gap: opts.isWebWide ? omSpacing.m : omSpacing.s,
			alignItems: 'stretch',
		},
		footerCreditRow: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'center',
			gap: omSpacing.xs,
			marginTop: omSpacing.xs,
		},
		checkboxRow: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: omSpacing.m,
			paddingHorizontal: opts.isWebWide ? omSpacing.l : omSpacing.m,
			paddingVertical: opts.isWebWide ? omSpacing.m : omSpacing.s,
			borderRadius: omRadius.l,
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.border,
		},
		checkboxRowChecked: {
			borderColor: p.accentBorder,
			backgroundColor: p.accentSoft,
		},
		checkboxBox: {
			width: 22,
			height: 22,
			borderRadius: omRadius.s,
			borderWidth: 1.5,
			borderColor: p.borderStrong,
			backgroundColor: p.pageBg,
			alignItems: 'center',
			justifyContent: 'center',
			flexShrink: 0,
		},
		checkboxBoxChecked: {
			borderColor: p.accent,
			backgroundColor: p.accentSoft,
		},
		checkboxText: {
			flex: 1,
			color: p.text,
			fontSize: opts.isWebWide ? 16 : 15,
			lineHeight: opts.isWebWide ? 22 : 20,
			includeFontPadding: false,
		},
		continueButton: {
			minHeight: opts.isWebWide ? 54 : 46,
			borderRadius: omRadius.l,
			backgroundColor: p.surface,
			borderWidth: 1,
			borderColor: p.border,
		},
		continueButtonDisabled: {
			opacity: 1,
			backgroundColor: p.surfaceRaised,
			borderColor: p.border,
		},
		continueButtonLabelDisabled: {
			color: p.textMuted,
		},
		continueButtonEnabled: {
			backgroundColor: p.accent,
			borderColor: p.accent,
		},
		footerCredit: {
			color: p.textFaint,
			textAlign: 'center',
			fontSize: 14,
			lineHeight: 20,
		},
		footerCreditLink: {
			color: p.accentStrong,
			fontSize: 14,
			lineHeight: 20,
			textDecorationLine: 'underline',
		},
	})
}

function OpenMinedLogoMark() {
	return (
		<Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
			<Path
				d="M10.7486 0.721949L7.08028 7.07644L12.0005 4.23569V4.23761L19.7624 11.9995L13.2524 0.722909C12.6955 -0.24097 11.3044 -0.24097 10.7476 0.722909L10.7486 0.721949Z"
				fill="url(#om0)"
			/>
			<Path
				d="M16.9216 7.07644L19.7633 11.9986L19.7605 11.9995L12.0005 19.7595L23.2771 13.2504C24.241 12.6936 24.241 11.3025 23.2771 10.7457L16.9216 7.07644Z"
				fill="url(#om1)"
			/>
			<Path
				d="M4.23857 11.9976L12.0005 4.23569L0.72387 10.7447C-0.240008 11.3016 -0.240008 12.6927 0.72387 13.2495L7.08203 16.9188L4.23761 11.9986L4.23857 11.9976Z"
				fill="url(#om2)"
			/>
			<Path
				d="M12.0014 19.7605V19.7585L4.24145 11.9986H4.23953L10.7496 23.2752C11.3064 24.239 12.6975 24.239 13.2543 23.2752L16.9245 16.9188L12.0034 19.7605H12.0014Z"
				fill="url(#om3)"
			/>
			<Path d="M12.0014 11.9995V16.6547L16.6567 11.9995H12.0014Z" fill="url(#om4)" />
			<Path d="M12.0014 11.9995H7.34622L12.0014 16.6547V11.9995Z" fill="url(#om5)" />
			<Path d="M12.0014 11.9995V7.34429L7.34622 11.9995H12.0014Z" fill="url(#om6)" />
			<Path d="M12.0014 11.9995H16.6567L12.0014 7.34429V11.9995Z" fill="url(#om7)" />
			<Defs>
				<SvgLinearGradient id="om0" x1="7.07932" y1="5.99832" x2="19.7633" y2="5.99832">
					<Stop stopColor="#E6AF7B" />
					<Stop offset="0.42" stopColor="#F3C07A" />
					<Stop offset="0.8" stopColor="#C5A48A" />
					<Stop offset="1" stopColor="#87A9A0" />
				</SvgLinearGradient>
				<SvgLinearGradient id="om1" x1="18.0017" y1="7.07644" x2="18.0017" y2="19.7605">
					<Stop stopColor="#BACC9B" />
					<Stop offset="0.29" stopColor="#9FCFA1" />
					<Stop offset="0.52" stopColor="#81BEA5" />
					<Stop offset="0.79" stopColor="#7EA3A3" />
					<Stop offset="1" stopColor="#8D7997" />
				</SvgLinearGradient>
				<SvgLinearGradient id="om2" x1="6.00024" y1="16.9197" x2="6.00024" y2="4.23569">
					<Stop stopColor="#A85684" />
					<Stop offset="0.27" stopColor="#C35074" />
					<Stop offset="0.53" stopColor="#E27D69" />
					<Stop offset="1" stopColor="#C9BC8F" />
				</SvgLinearGradient>
				<SvgLinearGradient id="om3" x1="4.23761" y1="17.9988" x2="16.9226" y2="17.9988">
					<Stop stopColor="#F6796C" />
					<Stop offset="0.25" stopColor="#C5707C" />
					<Stop offset="0.49" stopColor="#927393" />
					<Stop offset="0.78" stopColor="#757FA3" />
					<Stop offset="1" stopColor="#60A4AF" />
				</SvgLinearGradient>
				<SvgLinearGradient id="om4" x1="10.8379" y1="15.4912" x2="15.4931" y2="10.836">
					<Stop stopColor="#757FA3" />
					<Stop offset="1" stopColor="#60A4AF" />
				</SvgLinearGradient>
				<SvgLinearGradient id="om5" x1="13.166" y1="15.4902" x2="8.51075" y2="10.835">
					<Stop stopColor="#C5707C" />
					<Stop offset="1" stopColor="#ED986C" />
				</SvgLinearGradient>
				<SvgLinearGradient id="om6" x1="8.50979" y1="13.1631" x2="13.165" y2="8.50786">
					<Stop stopColor="#F3C07A" />
					<Stop offset="1" stopColor="#ED986C" />
				</SvgLinearGradient>
				<SvgLinearGradient id="om7" x1="10.8379" y1="8.50786" x2="15.4931" y2="13.1631">
					<Stop stopColor="#5CB6A5" />
					<Stop offset="1" stopColor="#99CC99" />
				</SvgLinearGradient>
			</Defs>
		</Svg>
	)
}
