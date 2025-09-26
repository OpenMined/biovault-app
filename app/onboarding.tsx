import React, { useRef, useState } from 'react'
import { View, FlatList, TouchableOpacity, Text, StyleSheet, Dimensions, Image, Linking, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Storage } from 'expo-sqlite/kv-store'
import { useTheme } from '@/contexts/ThemeContext'

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
}: OnboardingScreenProps) {
	const { theme } = useTheme()

	const handleLinkPress = (url: string) => {
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
			<View style={onboardingScreenStyles.illustrationContainer}>
				{Illustration && <Illustration />}
			</View>
			<Text style={[onboardingScreenStyles.title, { color: theme.textPrimary }]}>{title}</Text>
			<Text style={[
				onboardingScreenStyles.description,
				{ color: theme.textSecondary, textAlign: 'left' },
				shortDescription && onboardingScreenStyles.shortDescription
			]}>
				{parseDescription(description)}
			</Text>

			{links && (
				<View style={onboardingScreenStyles.linksContainer}>
					<Text style={[onboardingScreenStyles.linksLabel, { color: theme.textSecondary }]}>
						Learn more: {'  '}
					</Text>
					{links.map((link, index) => (
						<React.Fragment key={index}>
							<TouchableOpacity
								onPress={() => link.url && handleLinkPress(link.url)}
							>
								<Text style={[
									onboardingScreenStyles.linkText,
									{ color: '#059669', textDecorationLine: 'underline' }
								]}>
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
				</View>
			)}

			{requiresAgreement && (
				<TouchableOpacity
					style={onboardingScreenStyles.agreementContainer}
					onPress={() => onAgreementChange?.(!hasAgreed)}
				>
					<View style={[
						onboardingScreenStyles.checkbox,
						{ borderColor: '#059669' },
						hasAgreed && { backgroundColor: '#059669' }
					]}>
						{hasAgreed && <Text style={onboardingScreenStyles.checkmark}>✓</Text>}
					</View>
					<Text style={[onboardingScreenStyles.agreementText, { color: theme.textPrimary }]}>
						I agree to use this research prototype at my own risk
					</Text>
				</TouchableOpacity>
			)}
		</View>
	)
}

// ts-prune-ignore-next
export default function OnboardingFlow() {
	const [currentIndex, setCurrentIndex] = useState(0)
	const [hasAgreed, setHasAgreed] = useState(false)
	const { theme } = useTheme()
	const ref = useRef<FlatList>(null)

	const currentSlide = slides[currentIndex]
	const isLastSlide = currentIndex === slides.length - 1
	const canProceed = !currentSlide?.requiresAgreement || hasAgreed

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
		<SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>

			<FlatList
				ref={ref}
				horizontal
				pagingEnabled
				showsHorizontalScrollIndicator={false}
				onScroll={(e) => {
					const index = Math.round(e.nativeEvent.contentOffset.x / width)
					if (index !== currentIndex) {
						setCurrentIndex(index)
						// Reset agreement when changing slides
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

			<View style={[styles.bottomContainer, { backgroundColor: theme.background }]}>
				<View style={styles.indicatorContainer}>
					{slides.map((_, index) => (
						<View
							key={index}
							style={[
								styles.indicator,
								{ backgroundColor: index === currentIndex ? '#059669' : theme.inactive }
							]}
						/>
					))}
				</View>

				<View style={styles.buttonRow}>
					{currentIndex > 0 && (
						<TouchableOpacity
							style={[styles.backButton, { borderColor: '#059669' }]}
							onPress={handleBack}
						>
							<Text style={[styles.backButtonText, { color: '#059669' }]}>← Back</Text>
						</TouchableOpacity>
					)}

					<TouchableOpacity
						style={[
							styles.nextButton,
							currentIndex === 0 && styles.singleButton,
							{ backgroundColor: canProceed ? '#059669' : theme.inactive }
						]}
						onPress={handleNext}
						disabled={!canProceed}
					>
						<Text style={[styles.buttonText, { color: canProceed ? theme.textInverse : theme.textSecondary }]}>
							{isLastSlide ? 'Start Using BioVault' : 'Next →'}
						</Text>
					</TouchableOpacity>
				</View>
			</View>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
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
	},
	indicator: {
		width: 8,
		height: 8,
		borderRadius: 4,
		marginHorizontal: 4,
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
		padding: 30,
		flex: 1,
	},
	illustrationContainer: {
		height: 250,
		marginBottom: 40,
		justifyContent: 'center',
		alignItems: 'center',
	},
	title: {
		fontSize: 28,
		fontWeight: 'bold',
		color: '#059669',
		textAlign: 'left',
		marginBottom: 16,
		paddingHorizontal: 30,
		alignSelf: 'stretch',
	},
	description: {
		fontSize: 16,
		textAlign: 'left',
		color: '#64748b',
		lineHeight: 24,
		paddingHorizontal: 30,
		alignSelf: 'stretch',
	},
	shortDescription: {
		marginBottom: 40,
	},
	agreementContainer: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		marginTop: 20,
		paddingHorizontal: 40,
		marginBottom: 20,
	},
	checkbox: {
		width: 24,
		height: 24,
		borderRadius: 6,
		borderWidth: 2,
		marginRight: 12,
		alignItems: 'center',
		justifyContent: 'center',
		marginTop: 2,
	},
	checkmark: {
		color: 'white',
		fontSize: 16,
		fontWeight: 'bold',
	},
	agreementText: {
		flex: 1,
		fontSize: 14,
		lineHeight: 20,
		fontWeight: '500',
		textAlign: 'left',
	},
	linksContainer: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'flex-start',
		alignItems: 'center',
		marginTop: 10,
		paddingHorizontal: 30,
	},
	linksLabel: {
		fontSize: 16,
		lineHeight: 24,
	},
	linkText: {
		fontSize: 16,
		lineHeight: 24,
	},
})

const illustrationStyles = StyleSheet.create({
	imageContainer: {
		width: 200,
		height: 200,
		justifyContent: 'center',
		alignItems: 'center',
	},
	image: {
		width: '100%',
		height: '100%',
	},
})
