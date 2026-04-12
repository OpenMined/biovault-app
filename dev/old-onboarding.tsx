import React, { useState, useEffect } from 'react'
import { View, TouchableOpacity, Text, StyleSheet, Image, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { lightTheme } from '@/styles/colors'
import { Storage } from 'expo-sqlite/kv-store'
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
			'BioVault is a free, open-source network for collaborative genomics. Your data stays on your device — encrypted, private, and under your control.',
		image: require('@/assets/images/logo.png'),
		gradient: ['#e0f2e7', '#f0f9f6'],
	},
	{
		key: 'private',
		title: 'Keep Your Data Private',
		bullets: [
			'Supports DNA files from 23andMe',
			'Does analysis offline on your phone',
			'Get free weekly ClinVar updates',
			'Stays on your device - never uploaded',
		],
		footer: 'Coming soon: Ancestry, MyHeritage, Sequencing.com, Nebula, CariGenetics.com',
		image: require('@/assets/images/folder.png'),
		gradient: ['#f0f9f6', '#e8f5f0'],
	},
	{
		key: 'updates',
		title: 'Updates & Notifications',
		bullets: [
			'Star genes of interest',
			'Updates for new ClinVar databases',
			'Get notified of breaking news and research',
		],
		image: require('@/assets/images/alerts.png'),
		gradient: ['#e8f5f0', '#e0f2e7'],
	},
	{
		key: 'contribute',
		title: 'Help Advance Medicine',
		description:
			'See research projects being proposed by scientists which match your variants.\n\nOnly if you want to reveal yourself, contact them privately and anonymously through the app to enroll.\n\nTheir research can be run on your device and you choose to share results or not.',
		image: require('@/assets/images/research.png'),
		gradient: ['#e0f2e7', '#f8fffe'],
	},
	{
		key: 'privacy',
		title: 'Privacy First',
		bullets: [
			'End-to-end encryption',
			'Decentralized network',
			'Open Source — Transparent',
			'Free — Apache 2.0 Licensed',
			'Permissionless — Join instantly',
		],
		footer: 'Runs on SyftBox.net from OpenMined.org 501(c)(3)',
		links: [
			{ text: 'SyftBox.net', url: 'https://syftbox.net' },
			{ text: 'OpenMined.org', url: 'https://www.openmined.org' },
		],
		image: require('@/assets/images/syftbox-icon.png'),
		gradient: ['#f8fffe', '#e0f2e7'],
	},
	{
		key: 'disclaimer',
		title: 'Research Prototype — Use with Care',
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

	const progress = useSharedValue(0)
	const imageScale = useSharedValue(1)

	const currentSlide = slides[currentIndex]!
	const isLastSlide = currentIndex === slides.length - 1
	const canProceed = !currentSlide.requiresAgreement || hasAgreed

	useEffect(() => {
		progress.value = withSpring((currentIndex + 1) / slides.length, {
			damping: 30,
			stiffness: 120,
			overshootClamping: true,
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
			router.replace('/(tabs)' as any)
		}
	}

	const handleBack = () => {
		if (currentIndex > 0) {
			setCurrentIndex(currentIndex - 1)
			setHasAgreed(false)
		}
	}

	const handleLinkPress = (url: string) => {
		Linking.openURL(url)
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
						Step {currentIndex + 1} of {slides.length}
					</Text>
				</View>

				{/* Main Content */}
				<View style={styles.content}>
					{/* Image */}
					<Animated.View
						key={`image-${currentIndex}`}
						entering={FadeIn.duration(250).delay(50)}
						style={[styles.imageContainer, imageScaleStyle]}
					>
						<Image source={currentSlide.image} style={styles.image} resizeMode="contain" />
					</Animated.View>

					{/* Title */}
					<Animated.Text
						key={`title-${currentIndex}`}
						entering={FadeInDown.duration(250).delay(100)}
						style={[styles.title, { color: theme.primary }]}
					>
						{currentSlide.title}
					</Animated.Text>

					{/* Description */}
					{currentSlide.description && (
						<Animated.Text
							key={`desc-${currentIndex}`}
							entering={FadeInDown.duration(250).delay(150)}
							style={[styles.description, { color: theme.textSecondary }]}
						>
							{currentSlide.description}
						</Animated.Text>
					)}

					{/* Bullet Points */}
					{currentSlide.bullets && (
						<View style={styles.bulletsContainer}>
							{currentSlide.bullets.map((bullet, index) => (
								<Animated.View
									key={bullet}
									entering={FadeInDown.duration(200).delay(200 + index * 30)}
									style={styles.bulletRow}
								>
									<View style={[styles.bulletDot, { backgroundColor: theme.primary }]} />
									<Text style={[styles.bulletText, { color: theme.textPrimary }]}>{bullet}</Text>
								</Animated.View>
							))}
						</View>
					)}

					{/* Footer Text */}
					{currentSlide.footer && (
						<Animated.Text
							entering={FadeInUp.duration(250).delay(200)}
							style={[styles.footer, { color: theme.textSecondary }]}
						>
							{currentSlide.footer}
						</Animated.Text>
					)}

					{/* Links */}
					{currentSlide.links && (
						<Animated.View
							entering={FadeInUp.duration(250).delay(200)}
							style={styles.linksContainer}
						>
							<Text style={[styles.linksLabel, { color: theme.textSecondary }]}>Learn more: </Text>
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
						<Animated.View
							entering={FadeInUp.duration(250).delay(150)}
							style={styles.agreementWrapper}
						>
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

				{/* Bottom Navigation */}
				<View style={styles.bottomNav}>
					<View style={styles.buttonRow}>
						{currentIndex > 0 && (
							<Animated.View
								entering={SlideInLeft.duration(200)}
								exiting={SlideOutLeft.duration(200)}
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
	header: {
		paddingHorizontal: 24,
		paddingTop: 20,
		paddingBottom: 16,
	},
	progressBarContainer: {
		height: 5,
		backgroundColor: 'rgba(0,0,0,0.08)',
		borderRadius: 3,
		overflow: 'hidden',
		marginBottom: 12,
	},
	progressBar: {
		height: '100%',
		borderRadius: 3,
	},
	stepIndicator: {
		fontSize: 14,
		fontWeight: '600',
		textAlign: 'center',
		opacity: 0.5,
	},
	content: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: 28,
		paddingVertical: 12,
	},
	imageContainer: {
		width: 160,
		height: 160,
		marginBottom: 32,
		justifyContent: 'center',
		alignItems: 'center',
	},
	image: {
		width: '100%',
		height: '100%',
	},
	title: {
		fontSize: 30,
		fontWeight: '900',
		textAlign: 'center',
		marginBottom: 20,
		lineHeight: 38,
		letterSpacing: -0.5,
	},
	description: {
		fontSize: 17,
		textAlign: 'center',
		lineHeight: 26,
		marginBottom: 0,
		fontWeight: '400',
	},
	bulletsContainer: {
		width: '100%',
		maxWidth: 450,
		marginTop: 24,
		marginBottom: 0,
	},
	bulletRow: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		marginBottom: 14,
		paddingHorizontal: 8,
	},
	bulletDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
		marginRight: 14,
		marginTop: 7,
		flexShrink: 0,
	},
	bulletText: {
		fontSize: 16,
		fontWeight: '500',
		flex: 1,
		lineHeight: 22,
	},
	footer: {
		fontSize: 13,
		textAlign: 'center',
		marginTop: 20,
		fontStyle: 'italic',
		opacity: 0.7,
		lineHeight: 19,
	},
	linksContainer: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'center',
		alignItems: 'center',
		marginTop: 20,
		marginBottom: 0,
	},
	linksLabel: {
		fontSize: 14,
		lineHeight: 24,
	},
	linkButton: {
		paddingHorizontal: 6,
		paddingVertical: 4,
	},
	linkText: {
		fontSize: 14,
		lineHeight: 24,
		textDecorationLine: 'underline',
		fontWeight: '700',
	},
	agreementWrapper: {
		width: '100%',
		alignItems: 'center',
		marginTop: 28,
	},
	agreementContainer: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		paddingHorizontal: 20,
		paddingVertical: 20,
		maxWidth: 500,
		width: '100%',
		backgroundColor: 'rgba(255,255,255,0.95)',
		borderRadius: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.1,
		shadowRadius: 12,
		elevation: 4,
	},
	checkbox: {
		width: 26,
		height: 26,
		borderRadius: 7,
		borderWidth: 2.5,
		marginRight: 14,
		marginTop: 0,
		alignItems: 'center',
		justifyContent: 'center',
		flexShrink: 0,
	},
	checkmark: {
		color: 'white',
		fontSize: 17,
		fontWeight: 'bold',
		lineHeight: 17,
	},
	agreementText: {
		flex: 1,
		fontSize: 14,
		lineHeight: 20,
		fontWeight: '500',
	},
	bottomNav: {
		paddingHorizontal: 24,
		paddingVertical: 16,
		paddingBottom: 24,
	},
	buttonRow: {
		flexDirection: 'row',
		justifyContent: 'center',
		alignItems: 'center',
		gap: 14,
		maxWidth: 600,
		width: '100%',
		alignSelf: 'center',
	},
	backButton: {
		paddingVertical: 17,
		paddingHorizontal: 30,
		borderRadius: 16,
		borderWidth: 2.5,
		backgroundColor: 'rgba(255,255,255,0.95)',
		minWidth: 120,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 3 },
		shadowOpacity: 0.1,
		shadowRadius: 10,
		elevation: 4,
	},
	backButtonText: {
		fontSize: 18,
		fontWeight: '800',
	},
	nextButton: {
		flex: 1,
		paddingVertical: 19,
		paddingHorizontal: 24,
		borderRadius: 16,
		alignItems: 'center',
		justifyContent: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 0.25,
		shadowRadius: 14,
		elevation: 8,
		minHeight: 60,
	},
	fullWidthButton: {
		flex: 1,
	},
	nextButtonText: {
		fontSize: 17,
		fontWeight: '900',
		letterSpacing: 0.3,
		flexShrink: 0,
	},
})
