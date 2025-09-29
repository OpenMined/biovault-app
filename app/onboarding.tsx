import React, { useRef, useState, useEffect } from 'react'
import {
	View,
	FlatList,
	TouchableOpacity,
	Text,
	StyleSheet,
	Dimensions,
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
	SlideInLeft,
	SlideOutLeft,
	useAnimatedStyle,
	withTiming,
	useSharedValue,
	Easing,
	interpolate,
	Extrapolation,
} from 'react-native-reanimated'

const { width } = Dimensions.get('window')

// Inline illustration components
const LogoSVG = () => (
	<View style={illustrationStyles.imageContainer}>
		<Image
			source={require('@/assets/images/logo.png')}
			style={illustrationStyles.image}
			resizeMode="contain"
		/>
	</View>
)

const FolderSVG = () => (
	<View style={illustrationStyles.imageContainer}>
		<Image
			source={require('@/assets/images/folder.png')}
			style={illustrationStyles.image}
			resizeMode="contain"
		/>
	</View>
)

const ResearchSVG = () => (
	<View style={illustrationStyles.imageContainer}>
		<Image
			source={require('@/assets/images/research.png')}
			style={illustrationStyles.image}
			resizeMode="contain"
		/>
	</View>
)

const AlertsSVG = () => (
	<View style={illustrationStyles.imageContainer}>
		<Image
			source={require('@/assets/images/alerts.png')}
			style={illustrationStyles.image}
			resizeMode="contain"
		/>
	</View>
)

const WarningSVG = () => (
	<View style={illustrationStyles.imageContainer}>
		<Image
			source={require('@/assets/images/warning.png')}
			style={illustrationStyles.image}
			resizeMode="contain"
		/>
	</View>
)

const SyftBoxSVG = () => (
	<View style={illustrationStyles.imageContainer}>
		<Image
			source={require('@/assets/images/syftbox-icon.png')}
			style={illustrationStyles.image}
			resizeMode="contain"
		/>
	</View>
)

const slides = [
	{
		key: 'welcome',
		title: 'Welcome to BioVault',
		description:
			'BioVault is a free, open-source network for collaborative genomics. Your data **stays on your device** — encrypted, private, and under your control.',
		Illustration: LogoSVG,
		backgroundColor: '#f8fffe',
	},
	{
		key: 'private',
		title: 'Keep Your Data Private',
		description:
			'• Supports DNA files from **23andMe**\n• Does analysis offline on your phone\n• Get **free** weekly ClinVar updates without sharing any data\n• **Stays on your device** - never uploaded\n\n**Coming soon:** Ancestry, MyHeritage, Sequencing.com, Nebula, CariGenetics.com etc',
		Illustration: FolderSVG,
		backgroundColor: '#f8fffe',
	},
	{
		key: 'updates',
		title: 'Updates & Notifications',
		description:
			'• Star genes of interest\n• Updates for new ClinVar databases every few weeks\n• Get notified of breaking news, research and papers',
		Illustration: AlertsSVG,
		backgroundColor: '#f8fffe',
	},
	{
		key: 'contribute',
		title: 'Help Advance Medicine',
		description:
			'See research projects being proposed by scientists which match your variants.\n\nOnly if you want to reveal yourself, contact them privately and anonymously through the app to enroll.\n\nTheir research can be run on your device and you choose to share results or not.',
		Illustration: ResearchSVG,
		backgroundColor: '#f8fffe',
	},
	{
		key: 'privacy',
		title: 'Privacy First',
		description:
			'• **End-to-end encryption**\n• Decentralized network\n• Open Source — Transparent\n• **Free** — Apache 2.0 Licensed\n• Permissionless — Join instantly\n\nRuns on **SyftBox.net** from **OpenMined.org** 501(c)(3)',
		links: [
			{ text: 'SyftBox.net', url: 'https://syftbox.net' },
			{ text: 'OpenMined.org', url: 'https://www.openmined.org' },
		],
		Illustration: SyftBoxSVG,
		backgroundColor: '#f8fffe',
	},
	{
		key: 'disclaimer',
		title: 'Research Prototype — Use with Care',
		description:
			'This is an early-stage research tool, not medical advice. We make no guarantees about accuracy or security. Use at your own risk.',
		shortDescription: true,
		Illustration: WarningSVG,
		backgroundColor: '#f8fffe',
		requiresAgreement: true,
	},
]

// Inline OnboardingScreen component
interface OnboardingScreenProps {
	title: string
	description: string
	links?: { text: string; url: string | null }[]
	Illustration?: React.ComponentType
	backgroundColor?: string
	shortDescription?: boolean
	requiresAgreement?: boolean
	hasAgreed?: boolean
	onAgreementChange?: (agreed: boolean) => void
	isActive: boolean
}

function OnboardingScreen({
	title,
	description,
	links,
	Illustration,
	backgroundColor = '#f8fafc',
	shortDescription = false,
	requiresAgreement = false,
	hasAgreed = false,
	onAgreementChange,
	isActive,
}: OnboardingScreenProps) {
	const theme = lightTheme
	const isWeb = Platform.OS === 'web'

	// Smooth fade and slide from top animation
	const animProgress = useSharedValue(0)

	useEffect(() => {
		if (isActive) {
			animProgress.value = withTiming(1, {
				duration: 600,
				easing: Easing.bezier(0.25, 0.1, 0.25, 1), // Custom ease-out curve
			})
		} else {
			animProgress.value = 0
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isActive])

	const imageStyle = useAnimatedStyle(() => ({
		opacity: interpolate(animProgress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
		transform: [
			{
				translateY: interpolate(animProgress.value, [0, 1], [-30, 0], Extrapolation.CLAMP),
			},
			{
				scale: interpolate(animProgress.value, [0, 1], [0.9, 1], Extrapolation.CLAMP),
			},
		],
	}))

	const titleStyle = useAnimatedStyle(() => ({
		opacity: interpolate(animProgress.value, [0, 0.3, 1], [0, 0, 1], Extrapolation.CLAMP),
		transform: [
			{
				translateY: interpolate(animProgress.value, [0, 1], [-20, 0], Extrapolation.CLAMP),
			},
		],
	}))

	const descStyle = useAnimatedStyle(() => ({
		opacity: interpolate(animProgress.value, [0, 0.5, 1], [0, 0, 1], Extrapolation.CLAMP),
		transform: [
			{
				translateY: interpolate(animProgress.value, [0, 1], [-15, 0], Extrapolation.CLAMP),
			},
		],
	}))

	const extraStyle = useAnimatedStyle(() => ({
		opacity: interpolate(animProgress.value, [0, 0.7, 1], [0, 0, 1], Extrapolation.CLAMP),
		transform: [
			{
				translateY: interpolate(animProgress.value, [0, 1], [-10, 0], Extrapolation.CLAMP),
			},
		],
	}))

	const handleLinkPress = (url: string) => {
		if (isWeb) {
			window.open(url, '_blank')
		} else {
			Alert.alert(
				'Open External Link',
				`Do you want to open ${url}?`,
				[
					{
						text: 'Cancel',
						style: 'cancel',
					},
					{
						text: 'Open',
						onPress: () => Linking.openURL(url),
					},
				],
				{ cancelable: true }
			)
		}
	}

	// Parse description for bold text marked with **
	const parseDescription = (text: string) => {
		const parts = text.split(/(\*\*[^*]+\*\*)/g)
		return parts.map((part, index) => {
			if (part.startsWith('**') && part.endsWith('**')) {
				return (
					<Text key={index} style={{ fontWeight: 'bold' }}>
						{part.slice(2, -2)}
					</Text>
				)
			}
			return <Text key={index}>{part}</Text>
		})
	}

	return (
		<View style={[onboardingScreenStyles.container, { backgroundColor }]}>
			<Animated.View style={[onboardingScreenStyles.illustrationContainer, imageStyle]}>
				{Illustration && <Illustration />}
			</Animated.View>
			<Animated.Text
				style={[onboardingScreenStyles.title, { color: theme.textPrimary }, titleStyle]}
			>
				{title}
			</Animated.Text>
			<Animated.Text
				style={[
					onboardingScreenStyles.description,
					{ color: theme.textSecondary, textAlign: 'center' },
					shortDescription && onboardingScreenStyles.shortDescription,
					descStyle,
				]}
			>
				{parseDescription(description)}
			</Animated.Text>

			{links && (
				<Animated.View style={[onboardingScreenStyles.linksContainer, extraStyle]}>
					<Text style={[onboardingScreenStyles.linksLabel, { color: theme.textSecondary }]}>
						Learn more: {'  '}
					</Text>
					{links.map((link, index) => (
						<React.Fragment key={index}>
							<TouchableOpacity onPress={() => link.url && handleLinkPress(link.url)}>
								<Text
									style={[
										onboardingScreenStyles.linkText,
										{ color: '#059669', textDecorationLine: 'underline' },
									]}
								>
									{link.text}
								</Text>
							</TouchableOpacity>
							{index < links.length - 1 && (
								<Text style={[onboardingScreenStyles.linkText, { color: theme.textSecondary }]}>
									{'  •  '}
								</Text>
							)}
						</React.Fragment>
					))}
				</Animated.View>
			)}

			{requiresAgreement && (
				<Animated.View style={[onboardingScreenStyles.agreementWrapper, extraStyle]}>
					<TouchableOpacity
						style={onboardingScreenStyles.agreementContainer}
						onPress={() => onAgreementChange?.(!hasAgreed)}
						activeOpacity={0.7}
					>
						<View
							style={[
								onboardingScreenStyles.checkbox,
								{ borderColor: '#059669' },
								hasAgreed && { backgroundColor: '#059669' },
							]}
						>
							{hasAgreed && <Text style={onboardingScreenStyles.checkmark}>✓</Text>}
						</View>
						<Text style={[onboardingScreenStyles.agreementText, { color: theme.textPrimary }]}>
							I agree to use this research prototype at my own risk
						</Text>
					</TouchableOpacity>
				</Animated.View>
			)}
		</View>
	)
}

// ts-prune-ignore-next
export default function OnboardingFlow() {
	const [currentIndex, setCurrentIndex] = useState(0)
	const [hasAgreed, setHasAgreed] = useState(false)
	const theme = lightTheme
	const ref = useRef<FlatList>(null)

	const progress = useSharedValue(0)

	const currentSlide = slides[currentIndex]
	const isLastSlide = currentIndex === slides.length - 1
	const canProceed = !currentSlide?.requiresAgreement || hasAgreed

	useEffect(() => {
		progress.value = withTiming((currentIndex + 1) / slides.length, {
			duration: 400,
			easing: Easing.bezier(0.25, 0.1, 0.25, 1),
		})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentIndex])

	const progressStyle = useAnimatedStyle(() => ({
		width: `${progress.value * 100}%`,
	}))

	const handleNext = () => {
		if (currentIndex < slides.length - 1) {
			ref.current?.scrollToIndex({ index: currentIndex + 1 })
		} else if (canProceed) {
			Storage.setItemSync('hasCompletedOnboarding', 'true')
			router.replace('/(tabs)')
		}
	}

	const handleBack = () => {
		if (currentIndex > 0) {
			ref.current?.scrollToIndex({ index: currentIndex - 1 })
		}
	}

	return (
		<View style={[styles.fullScreen, { backgroundColor: '#f8fffe' }]}>
			<SafeAreaView style={styles.safeArea}>
				{/* Animated Progress Bar */}
				<View style={styles.progressBarContainer}>
					<Animated.View
						style={[styles.progressBar, progressStyle, { backgroundColor: '#059669' }]}
					/>
				</View>

				<FlatList
					ref={ref}
					horizontal
					pagingEnabled
					showsHorizontalScrollIndicator={false}
					scrollEventThrottle={16}
					onScroll={(e) => {
						const index = Math.round(e.nativeEvent.contentOffset.x / width)
						if (index !== currentIndex) {
							setCurrentIndex(index)
							setHasAgreed(false)
						}
					}}
					data={slides}
					renderItem={({ item, index }) => {
						const { key, ...rest } = item
						return (
							<OnboardingScreen
								key={key}
								{...rest}
								isActive={index === currentIndex}
								hasAgreed={index === currentIndex ? hasAgreed : false}
								onAgreementChange={(agreed) => {
									if (index === currentIndex) {
										setHasAgreed(agreed)
									}
								}}
							/>
						)
					}}
					keyExtractor={(item) => item.key}
				/>

				<View style={[styles.bottomContainer, { backgroundColor: 'transparent' }]}>
					<View style={styles.indicatorContainer}>
						{slides.map((_, index) => (
							<View
								key={index}
								style={[
									styles.indicator,
									{
										backgroundColor: index === currentIndex ? '#059669' : theme.inactive,
										width: index === currentIndex ? 20 : 8,
									},
								]}
							/>
						))}
					</View>

					<View style={styles.buttonRow}>
						{currentIndex > 0 && (
							<Animated.View
								entering={SlideInLeft.duration(300)}
								exiting={SlideOutLeft.duration(300)}
							>
								<TouchableOpacity
									style={[styles.backButton, { borderColor: '#059669' }]}
									onPress={handleBack}
								>
									<Text style={[styles.backButtonText, { color: '#059669' }]}>← Back</Text>
								</TouchableOpacity>
							</Animated.View>
						)}

						<TouchableOpacity
							style={[
								styles.nextButton,
								currentIndex === 0 && styles.singleButton,
								{ backgroundColor: canProceed ? '#059669' : theme.inactive },
							]}
							onPress={handleNext}
							disabled={!canProceed}
						>
							<Text
								style={[
									styles.buttonText,
									{ color: canProceed ? theme.textInverse : theme.textSecondary },
								]}
							>
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
	progressBarContainer: {
		height: 3,
		backgroundColor: 'rgba(0,0,0,0.08)',
		marginHorizontal: 20,
		marginTop: 12,
		marginBottom: 8,
		borderRadius: 2,
		overflow: 'hidden',
	},
	progressBar: {
		height: '100%',
		borderRadius: 2,
	},
	container: {
		flex: 1,
	},
	bottomContainer: {
		paddingHorizontal: 20,
		paddingBottom: 40,
		paddingTop: 10,
	},
	indicatorContainer: {
		flexDirection: 'row',
		justifyContent: 'center',
		marginBottom: 30,
		gap: 6,
	},
	indicator: {
		height: 8,
		borderRadius: 4,
	},
	buttonRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		gap: 12,
	},
	backButton: {
		paddingVertical: 16,
		paddingHorizontal: 24,
		borderRadius: 12,
		borderWidth: 2,
		backgroundColor: 'transparent',
	},
	backButtonText: {
		fontSize: 16,
		fontWeight: '600',
	},
	nextButton: {
		flex: 1,
		paddingVertical: 16,
		borderRadius: 12,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: {
			width: 0,
			height: 2,
		},
		shadowOpacity: 0.1,
		shadowRadius: 3.84,
		elevation: 5,
	},
	singleButton: {
		marginLeft: 0,
	},
	buttonText: {
		fontSize: 18,
		fontWeight: '600',
	},
})

const onboardingScreenStyles = StyleSheet.create({
	container: {
		width,
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: 20,
		paddingVertical: 16,
		flex: 1,
	},
	illustrationContainer: {
		height: 180,
		marginBottom: 24,
		justifyContent: 'center',
		alignItems: 'center',
	},
	title: {
		fontSize: 26,
		fontWeight: 'bold',
		color: '#059669',
		textAlign: 'center',
		marginBottom: 12,
		paddingHorizontal: 16,
		alignSelf: 'stretch',
	},
	description: {
		fontSize: 15,
		textAlign: 'center',
		color: '#64748b',
		lineHeight: 22,
		paddingHorizontal: 16,
		alignSelf: 'stretch',
		marginBottom: 8,
	},
	shortDescription: {
		marginBottom: 20,
	},
	agreementWrapper: {
		paddingHorizontal: 0,
		width: '100%',
		alignItems: 'center',
	},
	agreementContainer: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		marginTop: 16,
		paddingHorizontal: 14,
		paddingVertical: 14,
		backgroundColor: 'rgba(255,255,255,0.9)',
		borderRadius: 10,
		maxWidth: '100%',
		width: '100%',
	},
	checkbox: {
		width: 22,
		height: 22,
		borderRadius: 6,
		borderWidth: 2,
		marginRight: 10,
		alignItems: 'center',
		justifyContent: 'center',
		marginTop: 1,
		flexShrink: 0,
	},
	checkmark: {
		color: 'white',
		fontSize: 14,
		fontWeight: 'bold',
		lineHeight: 14,
	},
	agreementText: {
		flex: 1,
		fontSize: 13,
		lineHeight: 18,
		fontWeight: '500',
		textAlign: 'left',
		color: '#2d5a4f',
	},
	linksContainer: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'center',
		alignItems: 'center',
		marginTop: 8,
		paddingHorizontal: 16,
	},
	linksLabel: {
		fontSize: 14,
		lineHeight: 22,
	},
	linkText: {
		fontSize: 14,
		lineHeight: 22,
	},
})

const illustrationStyles = StyleSheet.create({
	imageContainer: {
		width: 160,
		height: 160,
		justifyContent: 'center',
		alignItems: 'center',
	},
	image: {
		width: '100%',
		height: '100%',
	},
})
