import { OMButton } from '@/components/ui/OMButton'
import { OMIcon } from '@/components/ui/OMIcon'
import { OMText } from '@/components/ui/OMText'
import { Storage } from '@/lib/storage'
import { omGradients, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { LinearGradient } from 'expo-linear-gradient'
import * as Linking from 'expo-linking'
import { router } from 'expo-router'
import { useState } from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg'
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
			<SafeAreaView style={styles.safeArea}>
				<View style={styles.content}>
					<View style={styles.stack}>
						<View style={styles.mainSection}>
							<View style={styles.heroSection}>
								<View style={styles.titleRow}>
									<OMText variant="h3" style={styles.title}>
										Private genomic analysis on your device.
									</OMText>
								</View>
								<OMText variant="body" style={styles.heroSupport}>
									Review the privacy and research notes below before continuing.
								</OMText>
							</View>

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
									<OMText variant="caption" style={styles.sectionLabel}>
										Everything happens on your device
									</OMText>
									<View style={styles.signalList}>
										<OMText variant="body" style={styles.signalText}>
											&rarr; Your files are never uploaded.
										</OMText>
										<OMText variant="body" style={styles.signalText}>
											&rarr; Analysis runs locally.
										</OMText>
										<OMText variant="body" style={styles.signalText}>
											&rarr; Results are visible only to you.
										</OMText>
									</View>
								</View>
							</LinearGradient>

							<View style={styles.disclaimerPanel}>
								<OMText variant="body" style={styles.disclaimerBody}>
									BioVault is a research tool, not a medical product. Do not use it for
									diagnosis or treatment.
								</OMText>
							</View>
						</View>

						<View style={styles.footer}>
							<Pressable
								onPress={() => setHasAgreed((value) => !value)}
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
								onPress={handleContinue}
								disabled={!hasAgreed}
								style={[styles.continueButton, hasAgreed && styles.continueButtonEnabled]}
							/>

							<Pressable
								onPress={() => Linking.openURL('https://www.openmined.org')}
								style={styles.footerCreditRow}
							>
								<OMText variant="caption" style={styles.footerCredit}>
									Built by{' '}
									<OMText variant="caption" tone="accent" style={styles.footerCreditLink}>
										OpenMined
									</OMText>
								</OMText>
								<OpenMinedLogoMark />
							</Pressable>
						</View>
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
	safeArea: {
		flex: 1,
	},
	content: {
		flex: 1,
		paddingHorizontal: omSpacing.xl,
		paddingVertical: omSpacing.xl,
		maxWidth: 420,
		width: '100%',
		alignSelf: 'center',
		justifyContent: 'center',
	},
	stack: {
		gap: omSpacing.xl,
	},
	mainSection: {
		gap: omSpacing.m,
	},
	heroSection: {
		paddingHorizontal: omSpacing.xs,
		paddingTop: 0,
		paddingBottom: omSpacing.m,
	},
	titleRow: {
		maxWidth: 320,
	},
	title: {
		color: omTheme.textHeadline,
		letterSpacing: -1,
		fontSize: 42,
		lineHeight: 45,
		maxWidth: 320,
	},
	heroSupport: {
		marginTop: omSpacing.m,
		maxWidth: 320,
		color: omTheme.textBody,
		fontSize: 16,
		lineHeight: 22,
	},
	infoSection: {
		paddingVertical: omSpacing.m,
	},
	infoCardBorder: {
		borderRadius: omRadius.l,
		padding: 1.5,
		shadowColor: '#17161d',
		shadowOffset: { width: 0, height: 8 },
		shadowOpacity: 0.06,
		shadowRadius: 18,
		elevation: 2,
	},
	infoCard: {
		margin: 2,
		paddingHorizontal: omSpacing.l,
		paddingVertical: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: 'rgba(252,252,253,0.88)',
	},
	sectionLabel: {
		alignSelf: 'flex-start',
		marginBottom: 2,
		paddingHorizontal: omSpacing.s,
		paddingVertical: omSpacing.xs,
		borderRadius: omRadius.m,
		color: omTheme.textMuted,
		letterSpacing: 1,
		backgroundColor: 'rgba(244,243,246,0.96)',
		borderWidth: 1,
		borderColor: 'rgba(39,37,50,0.08)',
	},
	disclaimerPanel: {
		paddingHorizontal: omSpacing.l,
		paddingVertical: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: omTheme.textHeadline,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
	},
	disclaimerBody: {
		color: omTheme.primaryText,
		fontSize: 17,
		lineHeight: 24,
	},
	signalList: {
		marginTop: omSpacing.m,
		gap: omSpacing.l,
	},
	signalText: {
		color: omTheme.textHeadline,
		fontSize: 17,
		lineHeight: 24,
	},
	footer: {
		gap: omSpacing.m,
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
		paddingHorizontal: omSpacing.l,
		paddingVertical: omSpacing.m,
		borderRadius: omRadius.l,
		backgroundColor: omTheme.background,
		borderWidth: 1,
		borderColor: 'rgba(39,37,50,0.06)',
		shadowColor: '#17161d',
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 0,
		shadowRadius: 12,
		elevation: 0,
	},
	checkboxRowChecked: {
		borderColor: 'rgba(39,37,50,0.08)',
	},
	checkboxBox: {
		width: 22,
		height: 22,
		borderRadius: omRadius.s,
		borderWidth: 1.5,
		borderColor: 'rgba(94,90,114,0.6)',
		backgroundColor: omTheme.background,
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
		fontSize: 16,
		lineHeight: 22,
		includeFontPadding: false,
	},
	continueButton: {
		minHeight: 54,
		borderRadius: omRadius.l,
		backgroundColor: 'rgba(60,159,139,0.28)',
		borderWidth: 1,
		borderColor: 'rgba(60,159,139,0.24)',
	},
	continueButtonEnabled: {
		backgroundColor: omTheme.accentDeep,
		borderColor: omTheme.accentDeep,
		shadowColor: '#17161d',
		shadowOffset: { width: 0, height: 12 },
		shadowOpacity: 0.18,
		shadowRadius: 24,
		elevation: 4,
	},
	footerCredit: {
		color: omTheme.textMuted,
		textAlign: 'center',
		fontSize: 14,
		lineHeight: 20,
	},
	footerCreditLink: {
		fontSize: 14,
		lineHeight: 20,
		textDecorationLine: 'underline',
	},
})

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
