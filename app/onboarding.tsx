import React, { useState } from 'react'
import {
	View,
	TouchableOpacity,
	Text,
	StyleSheet,
	Image,
	Linking,
	Alert,
	Platform,
	ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { lightTheme } from '@/styles/colors'
import { Storage } from '@/lib/storage'

const slides = [
	{
		key: 'welcome',
		title: 'Welcome to BioVault',
		description:
			'BioVault is a free, open-source network for collaborative genomics. Your data stays on your device — encrypted, private, and under your control.',
		image: require('@/assets/images/logo.png'),
	},
	{
		key: 'private',
		title: 'Keep Your Data Private',
		description:
			'• Supports DNA files from 23andMe\n• Does analysis offline on your phone\n• Get free weekly ClinVar updates without sharing any data\n• Stays on your device - never uploaded\n\nComing soon: Ancestry, MyHeritage, Sequencing.com, Nebula, CariGenetics.com etc',
		image: require('@/assets/images/folder.png'),
	},
	{
		key: 'updates',
		title: 'Updates & Notifications',
		description:
			'• Star genes of interest\n• Updates for new ClinVar databases every few weeks\n• Get notified of breaking news, research and papers',
		image: require('@/assets/images/alerts.png'),
	},
	{
		key: 'contribute',
		title: 'Help Advance Medicine',
		description:
			'See research projects being proposed by scientists which match your variants.\n\nOnly if you want to reveal yourself, contact them privately and anonymously through the app to enroll.\n\nTheir research can be run on your device and you choose to share results or not.',
		image: require('@/assets/images/research.png'),
	},
	{
		key: 'privacy',
		title: 'Privacy First',
		description:
			'• End-to-end encryption\n• Decentralized network\n• Open Source — Transparent\n• Free — Apache 2.0 Licensed\n• Permissionless — Join instantly\n\nRuns on SyftBox.net from OpenMined.org 501(c)(3)',
		links: [
			{ text: 'SyftBox.net', url: 'https://syftbox.net' },
			{ text: 'OpenMined.org', url: 'https://www.openmined.org' },
		],
		image: require('@/assets/images/syftbox-icon.png'),
	},
	{
		key: 'disclaimer',
		title: 'Research Prototype — Use with Care',
		description:
			'This is an early-stage research tool, not medical advice. We make no guarantees about accuracy or security. Use at your own risk.',
		image: require('@/assets/images/warning.png'),
		requiresAgreement: true,
	},
]

export default function OnboardingFlow() {
	const [currentIndex, setCurrentIndex] = useState(0)
	const [hasAgreed, setHasAgreed] = useState(false)
	const theme = lightTheme
	const isWeb = Platform.OS === 'web'

	const currentSlide = slides[currentIndex]!
	const isLastSlide = currentIndex === slides.length - 1
	const canProceed = !currentSlide.requiresAgreement || hasAgreed

	const handleNext = () => {
		if (currentIndex < slides.length - 1) {
			setCurrentIndex(currentIndex + 1)
			setHasAgreed(false)
		} else if (canProceed) {
			Storage.setItemSync('hasCompletedOnboarding', 'true')
			router.replace('/(tabs)')
		}
	}

	const handleBack = () => {
		if (currentIndex > 0) {
			setCurrentIndex(currentIndex - 1)
			setHasAgreed(false)
		}
	}

	const handleLinkPress = (url: string) => {
		if (isWeb) {
			window.open(url, '_blank')
		} else {
			Alert.alert(
				'Open External Link',
				`Do you want to open ${url}?`,
				[
					{ text: 'Cancel', style: 'cancel' },
					{ text: 'Open', onPress: () => Linking.openURL(url) },
				],
				{ cancelable: true }
			)
		}
	}

	return (
		<View style={[styles.fullScreen, { backgroundColor: '#f8fffe' }]}>
			<SafeAreaView style={styles.safeArea}>
				<ScrollView
					contentContainerStyle={styles.scrollContent}
					showsVerticalScrollIndicator={false}
					bounces={false}
				>
					{/* Image */}
					<View style={styles.imageContainer}>
						<Image source={currentSlide.image} style={styles.image} resizeMode="contain" />
					</View>

					{/* Content */}
					<View style={styles.contentContainer}>
						<Text style={[styles.title, { color: theme.primary }]}>{currentSlide.title}</Text>
						<Text style={[styles.description, { color: theme.textSecondary }]}>
							{currentSlide.description}
						</Text>

						{/* Links */}
						{currentSlide.links && (
							<View style={styles.linksContainer}>
								<Text style={[styles.linksLabel, { color: theme.textSecondary }]}>
									Learn more:{' '}
								</Text>
								{currentSlide.links.map((link, index) => (
									<React.Fragment key={index}>
										<TouchableOpacity onPress={() => handleLinkPress(link.url)}>
											<Text style={[styles.linkText, { color: theme.primary }]}>{link.text}</Text>
										</TouchableOpacity>
										{index < currentSlide.links.length - 1 && (
											<Text style={[styles.linksLabel, { color: theme.textSecondary }]}> • </Text>
										)}
									</React.Fragment>
								))}
							</View>
						)}

						{/* Agreement Checkbox */}
						{currentSlide.requiresAgreement && (
							<TouchableOpacity
								style={styles.agreementContainer}
								onPress={() => setHasAgreed(!hasAgreed)}
								activeOpacity={0.7}
							>
								<View
									style={[
										styles.checkbox,
										{ borderColor: theme.primary },
										hasAgreed && { backgroundColor: theme.primary },
									]}
								>
									{hasAgreed && <Text style={styles.checkmark}>✓</Text>}
								</View>
								<Text style={[styles.agreementText, { color: theme.textPrimary }]}>
									I agree to use this research prototype at my own risk
								</Text>
							</TouchableOpacity>
						)}
					</View>
				</ScrollView>

				{/* Bottom Navigation */}
				<View style={[styles.bottomNav, { backgroundColor: '#f8fffe' }]}>
					{/* Progress Indicators */}
					<View style={styles.indicatorContainer}>
						{slides.map((_, index) => (
							<View
								key={index}
								style={[
									styles.indicator,
									{
										backgroundColor: index === currentIndex ? theme.primary : theme.inactive,
										width: index === currentIndex ? 24 : 8,
									},
								]}
							/>
						))}
					</View>

					{/* Buttons */}
					<View style={styles.buttonRow}>
						{currentIndex > 0 && (
							<TouchableOpacity
								style={[styles.backButton, { borderColor: theme.primary }]}
								onPress={handleBack}
							>
								<Text style={[styles.backButtonText, { color: theme.primary }]}>← Back</Text>
							</TouchableOpacity>
						)}

						<TouchableOpacity
							style={[
								styles.nextButton,
								{
									backgroundColor: canProceed ? theme.primary : theme.inactive,
									opacity: canProceed ? 1 : 0.5,
								},
								currentIndex === 0 && styles.fullWidthButton,
							]}
							onPress={handleNext}
							disabled={!canProceed}
						>
							<Text style={[styles.nextButtonText, { color: '#ffffff' }]}>
								{isLastSlide ? 'Start Using BioVault' : 'Next →'}
							</Text>
						</TouchableOpacity>
					</View>
				</View>
			</SafeAreaView>
		</View>
	)
}

const styles = StyleSheet.create({
	fullScreen: {
		flex: 1,
		width: '100%',
		height: '100%',
	},
	safeArea: {
		flex: 1,
	},
	scrollContent: {
		flexGrow: 1,
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: 24,
		paddingTop: 40,
		paddingBottom: 20,
		minHeight: '100%',
	},
	imageContainer: {
		width: 200,
		height: 200,
		marginBottom: 40,
		justifyContent: 'center',
		alignItems: 'center',
	},
	image: {
		width: '100%',
		height: '100%',
	},
	contentContainer: {
		width: '100%',
		maxWidth: 600,
		alignItems: 'center',
	},
	title: {
		fontSize: 32,
		fontWeight: '800',
		textAlign: 'center',
		marginBottom: 20,
		lineHeight: 40,
	},
	description: {
		fontSize: 18,
		textAlign: 'center',
		lineHeight: 28,
		marginBottom: 24,
	},
	linksContainer: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'center',
		alignItems: 'center',
		marginTop: 16,
		marginBottom: 24,
	},
	linksLabel: {
		fontSize: 16,
		lineHeight: 24,
	},
	linkText: {
		fontSize: 16,
		lineHeight: 24,
		textDecorationLine: 'underline',
		fontWeight: '600',
	},
	agreementContainer: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		marginTop: 32,
		paddingHorizontal: 16,
		maxWidth: 500,
	},
	checkbox: {
		width: 28,
		height: 28,
		borderRadius: 8,
		borderWidth: 2,
		marginRight: 16,
		alignItems: 'center',
		justifyContent: 'center',
		flexShrink: 0,
	},
	checkmark: {
		color: 'white',
		fontSize: 18,
		fontWeight: 'bold',
	},
	agreementText: {
		flex: 1,
		fontSize: 16,
		lineHeight: 24,
		fontWeight: '500',
	},
	bottomNav: {
		paddingHorizontal: 24,
		paddingVertical: 24,
		paddingBottom: 32,
		borderTopWidth: 1,
		borderTopColor: 'rgba(0,0,0,0.05)',
	},
	indicatorContainer: {
		flexDirection: 'row',
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 24,
		gap: 8,
	},
	indicator: {
		height: 8,
		borderRadius: 4,
	},
	buttonRow: {
		flexDirection: 'row',
		justifyContent: 'center',
		alignItems: 'center',
		gap: 16,
		maxWidth: 600,
		width: '100%',
		alignSelf: 'center',
	},
	backButton: {
		paddingVertical: 16,
		paddingHorizontal: 32,
		borderRadius: 12,
		borderWidth: 2,
		backgroundColor: 'transparent',
		minWidth: 120,
		alignItems: 'center',
	},
	backButtonText: {
		fontSize: 18,
		fontWeight: '700',
	},
	nextButton: {
		flex: 1,
		paddingVertical: 18,
		paddingHorizontal: 32,
		borderRadius: 12,
		alignItems: 'center',
		justifyContent: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.15,
		shadowRadius: 8,
		elevation: 5,
		minHeight: 56,
	},
	fullWidthButton: {
		flex: 1,
	},
	nextButtonText: {
		fontSize: 18,
		fontWeight: '700',
	},
})
