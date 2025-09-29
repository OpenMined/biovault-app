import React, { useState, useEffect } from 'react'
import {
	View,
	TouchableOpacity,
	Text,
	StyleSheet,
	Image,
	Linking,
	Alert,
	Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { lightTheme } from '@/styles/colors'
import { Storage } from '@/lib/storage'
import Animated, {
	FadeIn,
	FadeInDown,
	FadeInUp,
	SlideInLeft,
	SlideOutLeft,
	useAnimatedStyle,
	withSpring,
	withTiming,
	useSharedValue,
} from 'react-native-reanimated'

const slides = [
	{
		key: 'welcome',
		title: 'Welcome to BioVault',
		description:
			'A free, open-source network for collaborative genomics. Your data stays on your device — encrypted, private, and under your control.',
		image: require('@/assets/images/logo.png'),
		gradient: ['#e0f2e7', '#f0f9f6'],
	},
	{
		key: 'private',
		title: 'Keep Your Data Private',
		description:
			'Supports DNA files from 23andMe. Analysis happens offline on your phone. Get free weekly ClinVar updates without sharing any data. Your data never leaves your device.',
		bullets: ['Offline Analysis', 'Weekly Updates', 'Zero Data Sharing', 'Full Privacy'],
		image: require('@/assets/images/folder.png'),
		gradient: ['#f0f9f6', '#e8f5f0'],
	},
	{
		key: 'updates',
		title: 'Stay Informed',
		description: 'Star genes of interest and get notified of breaking news, research, and papers.',
		bullets: ['Gene Tracking', 'Research Updates', 'News Alerts', 'Scientific Papers'],
		image: require('@/assets/images/alerts.png'),
		gradient: ['#e8f5f0', '#e0f2e7'],
	},
	{
		key: 'contribute',
		title: 'Advance Medicine',
		description:
			'See research projects matching your variants. Connect anonymously with scientists. Run research on your device. You control what to share.',
		image: require('@/assets/images/research.png'),
		gradient: ['#e0f2e7', '#f8fffe'],
	},
	{
		key: 'privacy',
		title: 'Built on Trust',
		description:
			'End-to-end encryption. Open source & transparent. Free forever. Apache 2.0 Licensed.\n\nPowered by SyftBox.net from OpenMined.org 501(c)(3)',
		links: [
			{ text: 'SyftBox', url: 'https://syftbox.net' },
			{ text: 'OpenMined', url: 'https://www.openmined.org' },
		],
		image: require('@/assets/images/syftbox-icon.png'),
		gradient: ['#f8fffe', '#e0f2e7'],
	},
	{
		key: 'disclaimer',
		title: 'Research Prototype',
		description:
			'This is an early-stage research tool, not medical advice. We make no guarantees about accuracy or security. Use at your own risk.',
		image: require('@/assets/images/warning.png'),
		gradient: ['#fff9f0', '#ffe5cc'],
		requiresAgreement: true,
	},
]

export default function OnboardingFlow() {
	const [currentIndex, setCurrentIndex] = useState(0)
	const [hasAgreed, setHasAgreed] = useState(false)
	const theme = lightTheme
	const isWeb = Platform.OS === 'web'

	const progress = useSharedValue(0)
	const imageScale = useSharedValue(1)

	const currentSlide = slides[currentIndex]!
	const isLastSlide = currentIndex === slides.length - 1
	const canProceed = !currentSlide.requiresAgreement || hasAgreed

	useEffect(() => {
		progress.value = withSpring((currentIndex + 1) / slides.length, {
			damping: 20,
			stiffness: 90,
		})
		imageScale.value = withSpring(1, {
			damping: 15,
			stiffness: 100,
		})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentIndex])

	const progressStyle = useAnimatedStyle(() => ({
		width: `${progress.value * 100}%`,
	}))

	const imageScaleStyle = useAnimatedStyle(() => ({
		transform: [{ scale: imageScale.value }],
	}))

	const handleNext = () => {
		if (currentIndex < slides.length - 1) {
			imageScale.value = withTiming(0.8, { duration: 200 }, () => {
				imageScale.value = withSpring(1)
			})
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
				'Open Link',
				`Open ${url}?`,
				[
					{ text: 'Cancel', style: 'cancel' },
					{ text: 'Open', onPress: () => Linking.openURL(url) },
				],
				{ cancelable: true }
			)
		}
	}

	return (
		<View
			style={[
				styles.fullScreen,
				{
					backgroundColor: currentSlide.gradient[0],
				},
			]}
		>
			<SafeAreaView style={styles.safeArea}>
				{/* Header with Progress Bar */}
				<View style={styles.header}>
					<View style={styles.progressBarContainer}>
						<Animated.View
							style={[styles.progressBar, progressStyle, { backgroundColor: theme.primary }]}
						/>
					</View>
					<Text style={[styles.stepIndicator, { color: theme.textSecondary }]}>
						{currentIndex + 1} of {slides.length}
					</Text>
				</View>

				<View style={styles.content}>
					{/* Image */}
					<Animated.View
						key={`image-${currentIndex}`}
						entering={FadeIn.duration(600).delay(200)}
						style={[styles.imageContainer, imageScaleStyle]}
					>
						<Image source={currentSlide.image} style={styles.image} resizeMode="contain" />
					</Animated.View>

					{/* Content */}
					<View style={styles.contentContainer}>
						<Animated.Text
							key={`title-${currentIndex}`}
							entering={FadeInDown.duration(500).delay(300)}
							style={[styles.title, { color: theme.primary }]}
						>
							{currentSlide.title}
						</Animated.Text>

						<Animated.Text
							key={`desc-${currentIndex}`}
							entering={FadeInDown.duration(500).delay(400)}
							style={[styles.description, { color: theme.textSecondary }]}
						>
							{currentSlide.description}
						</Animated.Text>

						{/* Bullet Points */}
						{currentSlide.bullets && (
							<View style={styles.bulletsContainer}>
								{currentSlide.bullets.map((bullet, index) => (
									<Animated.View
										key={bullet}
										entering={FadeInRight.duration(400).delay(500 + index * 100)}
										style={styles.bulletItem}
									>
										<View style={[styles.bulletDot, { backgroundColor: theme.primary }]} />
										<Text style={[styles.bulletText, { color: theme.textPrimary }]}>{bullet}</Text>
									</Animated.View>
								))}
							</View>
						)}

						{/* Links */}
						{currentSlide.links && (
							<Animated.View
								entering={FadeInUp.duration(500).delay(600)}
								style={styles.linksContainer}
							>
								<Text style={[styles.linksLabel, { color: theme.textSecondary }]}>
									Learn more:{' '}
								</Text>
								{currentSlide.links.map((link, index) => (
									<React.Fragment key={index}>
										<TouchableOpacity
											onPress={() => handleLinkPress(link.url)}
											style={styles.linkButton}
										>
											<Text style={[styles.linkText, { color: theme.primary }]}>{link.text}</Text>
										</TouchableOpacity>
										{index < currentSlide.links.length - 1 && (
											<Text style={[styles.linksLabel, { color: theme.textSecondary }]}> • </Text>
										)}
									</React.Fragment>
								))}
							</Animated.View>
						)}

						{/* Agreement Checkbox */}
						{currentSlide.requiresAgreement && (
							<Animated.View entering={FadeInUp.duration(500).delay(500)}>
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
										I understand this is a research prototype and agree to use it at my own risk
									</Text>
								</TouchableOpacity>
							</Animated.View>
						)}
					</View>
				</View>

				{/* Bottom Navigation */}
				<Animated.View
					entering={FadeInUp.duration(500).delay(700)}
					style={[styles.bottomNav, { backgroundColor: 'transparent' }]}
				>
					<View style={styles.buttonRow}>
						{currentIndex > 0 && (
							<Animated.View
								entering={SlideInLeft.duration(300)}
								exiting={SlideOutLeft.duration(300)}
							>
								<TouchableOpacity
									style={[styles.backButton, { borderColor: theme.primary }]}
									onPress={handleBack}
								>
									<Text style={[styles.backButtonText, { color: theme.primary }]}>← Back</Text>
								</TouchableOpacity>
							</Animated.View>
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
							activeOpacity={0.8}
						>
							<Text style={[styles.nextButtonText, { color: '#ffffff' }]}>
								{isLastSlide ? '🚀 Get Started' : 'Next →'}
							</Text>
						</TouchableOpacity>
					</View>
				</Animated.View>
			</SafeAreaView>
		</View>
	)
}

const FadeInRight = FadeInDown

const styles = StyleSheet.create({
	fullScreen: {
		flex: 1,
		width: '100%',
		height: '100%',
	},
	safeArea: {
		flex: 1,
	},
	header: {
		paddingHorizontal: 24,
		paddingTop: 16,
		paddingBottom: 8,
	},
	progressBarContainer: {
		height: 4,
		backgroundColor: 'rgba(0,0,0,0.08)',
		borderRadius: 2,
		overflow: 'hidden',
		marginBottom: 8,
	},
	progressBar: {
		height: '100%',
		borderRadius: 2,
	},
	stepIndicator: {
		fontSize: 13,
		fontWeight: '600',
		textAlign: 'center',
		opacity: 0.6,
	},
	content: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: 20,
		paddingVertical: 12,
	},
	imageContainer: {
		width: 140,
		height: 140,
		marginBottom: 20,
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
		flex: 1,
		justifyContent: 'flex-start',
		paddingHorizontal: 4,
	},
	title: {
		fontSize: 28,
		fontWeight: '900',
		textAlign: 'center',
		marginBottom: 12,
		lineHeight: 34,
		letterSpacing: -0.5,
	},
	description: {
		fontSize: 15,
		textAlign: 'center',
		lineHeight: 22,
		marginBottom: 16,
		fontWeight: '400',
	},
	bulletsContainer: {
		width: '100%',
		maxWidth: 400,
		marginTop: 4,
		marginBottom: 12,
	},
	bulletItem: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 10,
		paddingHorizontal: 12,
	},
	bulletDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
		marginRight: 10,
	},
	bulletText: {
		fontSize: 14,
		fontWeight: '600',
		flex: 1,
	},
	linksContainer: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'center',
		alignItems: 'center',
		marginTop: 8,
		marginBottom: 12,
	},
	linksLabel: {
		fontSize: 13,
		lineHeight: 20,
	},
	linkButton: {
		paddingHorizontal: 4,
		paddingVertical: 2,
	},
	linkText: {
		fontSize: 13,
		lineHeight: 20,
		textDecorationLine: 'underline',
		fontWeight: '700',
	},
	agreementContainer: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		marginTop: 16,
		paddingHorizontal: 14,
		paddingVertical: 14,
		backgroundColor: 'rgba(255,255,255,0.9)',
		borderRadius: 12,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.05,
		shadowRadius: 8,
		elevation: 2,
		width: '100%',
	},
	checkbox: {
		width: 20,
		height: 20,
		borderRadius: 5,
		borderWidth: 2,
		marginRight: 12,
		marginTop: 2,
		alignItems: 'center',
		justifyContent: 'center',
		flexShrink: 0,
	},
	checkmark: {
		color: 'white',
		fontSize: 13,
		fontWeight: 'bold',
		lineHeight: 13,
	},
	agreementText: {
		flex: 1,
		fontSize: 13,
		lineHeight: 19,
		fontWeight: '500',
		color: '#2d5a4f',
	},
	bottomNav: {
		paddingHorizontal: 20,
		paddingVertical: 16,
		paddingBottom: 20,
	},
	buttonRow: {
		flexDirection: 'row',
		justifyContent: 'center',
		alignItems: 'center',
		gap: 12,
		maxWidth: 600,
		width: '100%',
		alignSelf: 'center',
	},
	backButton: {
		paddingVertical: 16,
		paddingHorizontal: 28,
		borderRadius: 16,
		borderWidth: 2.5,
		backgroundColor: 'rgba(255,255,255,0.9)',
		minWidth: 110,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.08,
		shadowRadius: 8,
		elevation: 3,
	},
	backButtonText: {
		fontSize: 17,
		fontWeight: '800',
	},
	nextButton: {
		flex: 1,
		paddingVertical: 18,
		paddingHorizontal: 32,
		borderRadius: 16,
		alignItems: 'center',
		justifyContent: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 0.2,
		shadowRadius: 12,
		elevation: 8,
		minHeight: 56,
	},
	fullWidthButton: {
		flex: 1,
	},
	nextButtonText: {
		fontSize: 18,
		fontWeight: '800',
		letterSpacing: 0.3,
	},
})
