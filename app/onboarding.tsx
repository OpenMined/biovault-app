import { useRef, useState } from 'react'
import { View, FlatList, TouchableOpacity, Text, StyleSheet, Dimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Storage } from 'expo-sqlite/kv-store'

const { width } = Dimensions.get('window')

// Inline illustration components
const DNAISVG = () => (
	<View style={illustrationStyles.iconContainer}>
		<Text style={illustrationStyles.iconText}>🧬</Text>
	</View>
)

const BrainSVG = () => (
	<View style={illustrationStyles.iconContainer}>
		<Text style={illustrationStyles.iconText}>🧠</Text>
	</View>
)

const MicroscopeSVG = () => (
	<View style={illustrationStyles.iconContainer}>
		<Text style={illustrationStyles.iconText}>🔬</Text>
	</View>
)

const SecureSVG = () => (
	<View style={illustrationStyles.iconContainer}>
		<Text style={illustrationStyles.iconText}>🔒</Text>
	</View>
)

const slides = [
	{
		key: 'welcome',
		title: 'Welcome to BioVault',
		description:
			'Your personal genomic data vault. Securely store, analyze, and explore your genetic information.',
		Illustration: DNAISVG,
		backgroundColor: '#f0fdf4',
	},
	{
		key: 'insights',
		title: 'Discover Insights',
		description:
			'Unlock the secrets hidden in your DNA. Get personalized health insights based on your genetic data.',
		Illustration: BrainSVG,
		backgroundColor: '#ecfdf5',
	},
	{
		key: 'research',
		title: 'Advance Research',
		description:
			'Contribute to scientific breakthroughs. Your anonymized data can help advance medical research.',
		Illustration: MicroscopeSVG,
		backgroundColor: '#f0fdf4',
	},
	{
		key: 'secure',
		title: 'Privacy First',
		description:
			'Your data stays with you. We use end-to-end encryption to keep your genetic information secure.',
		Illustration: SecureSVG,
		backgroundColor: '#ecfdf5',
	},
]

// Inline OnboardingScreen component
interface OnboardingScreenProps {
	title: string
	description: string
	Illustration?: React.ComponentType
	backgroundColor?: string
}

function OnboardingScreen({
	title,
	description,
	Illustration,
	backgroundColor = '#f8fafc',
}: OnboardingScreenProps) {
	return (
		<View style={[onboardingScreenStyles.container, { backgroundColor }]}>
			<View style={onboardingScreenStyles.illustrationContainer}>
				{Illustration && <Illustration />}
			</View>
			<Text style={onboardingScreenStyles.title}>{title}</Text>
			<Text style={onboardingScreenStyles.description}>{description}</Text>
		</View>
	)
}

// ts-prune-ignore-next
export default function OnboardingFlow() {
	const [currentIndex, setCurrentIndex] = useState(0)
	const ref = useRef<FlatList>(null)
	const handleNext = () => {
		if (currentIndex < slides.length - 1) {
			ref.current?.scrollToIndex({ index: currentIndex + 1 })
		} else {
			Storage.setItemSync('hasCompletedOnboarding', 'true')
			router.replace('/(tabs)')
		}
	}

	const handleSkip = () => {
		Storage.setItemSync('hasCompletedOnboarding', 'true')
		router.replace('/(tabs)')
	}

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.skipContainer}>
				<TouchableOpacity onPress={handleSkip}>
					<Text style={styles.skipText}>Skip</Text>
				</TouchableOpacity>
			</View>

			<FlatList
				ref={ref}
				horizontal
				pagingEnabled
				showsHorizontalScrollIndicator={false}
				onScroll={(e) => {
					const index = Math.round(e.nativeEvent.contentOffset.x / width)
					setCurrentIndex(index)
				}}
				data={slides}
				renderItem={({ item }) => {
					const { key, ...rest } = item
					return <OnboardingScreen key={key} {...rest} />
				}}
				keyExtractor={(item) => item.key}
			/>

			<View style={styles.bottomContainer}>
				<View style={styles.indicatorContainer}>
					{slides.map((_, index) => (
						<View
							key={index}
							style={[
								styles.indicator,
								index === currentIndex ? styles.activeIndicator : styles.inactiveIndicator,
							]}
						/>
					))}
				</View>

				<TouchableOpacity style={styles.button} onPress={handleNext}>
					<Text style={styles.buttonText}>
						{currentIndex === slides.length - 1 ? 'Get Started' : 'Next'}
					</Text>
				</TouchableOpacity>
			</View>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#ffffff',
	},
	skipContainer: {
		alignItems: 'flex-end',
		paddingHorizontal: 20,
		paddingTop: 10,
	},
	skipText: {
		fontSize: 16,
		color: '#64748b',
		fontWeight: '500',
	},
	bottomContainer: {
		paddingHorizontal: 20,
		paddingBottom: 40,
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
	activeIndicator: {
		backgroundColor: '#059669',
	},
	inactiveIndicator: {
		backgroundColor: '#d1d5db',
	},
	button: {
		backgroundColor: '#059669',
		padding: 16,
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
	buttonText: {
		color: 'white',
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
		textAlign: 'center',
		marginBottom: 16,
	},
	description: {
		fontSize: 16,
		textAlign: 'center',
		color: '#64748b',
		lineHeight: 24,
		paddingHorizontal: 20,
	},
})

const illustrationStyles = StyleSheet.create({
	iconContainer: {
		width: 180,
		height: 180,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: '#f0fdf4',
		borderRadius: 90,
		borderWidth: 3,
		borderColor: '#059669',
	},
	iconText: {
		fontSize: 80,
	},
})
