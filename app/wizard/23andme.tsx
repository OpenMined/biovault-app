import { useRef, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, FlatList, Dimensions, Image, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTheme } from '@/contexts/ThemeContext'
import { sharedStyles } from '@/styles/shared'
import { useAnalytics } from '@/hooks/useAnalytics'

const { width } = Dimensions.get('window')

const wizardSteps = [
	{
		key: 'welcome',
		title: 'Get Your 23andMe Data',
		logo: require('@/assets/formats/23andme_logo.png'),
		description: 'This guide will walk you through downloading your genetic data from 23andMe for use in BioVault.',
		backgroundColor: '#f0f9f6',
	},
	{
		key: 'login',
		title: 'Step 1: Login to 23andMe',
		icon: '🔐',
		description: 'Go to 23andme.com and sign in to your account using your email and password.',
		link: 'https://www.23andme.com',
		linkText: 'Open 23andMe →',
		backgroundColor: '#e0f2e7',
	},
	{
		key: 'settings',
		title: 'Step 2: Open Settings',
		icon: '⚙️',
		description: 'Go to the top right menu and click on Settings to access your account options.',
		image: require('@/assets/guides/23andme/2.png'),
		link: 'https://you.23andme.com/user/',
		linkText: 'Go to Settings →',
		backgroundColor: '#f8fffe',
	},
	{
		key: 'download_menu',
		title: 'Step 3: Go to Download Data',
		icon: '📊',
		description: 'Find the section that says 23andMe Data and click the "View" button.',
		image: require('@/assets/guides/23andme/3.png'),
		backgroundColor: '#e8f5f0',
	},
	{
		key: 'birth_date',
		title: 'Step 4: Verify Your Identity',
		icon: '📅',
		description: 'Enter your date of birth to confirm your identity and proceed with the download.',
		image: require('@/assets/guides/23andme/4.png'),
		backgroundColor: '#f0f9f6',
	},
	{
		key: 'raw_data',
		title: 'Step 5: Select Raw Data',
		icon: '📥',
		description: 'Scroll down to the "Raw Data" section and click "Download Raw Data".',
		image: require('@/assets/guides/23andme/5.png'),
		link: 'https://you.23andme.com/tools/data/download/',
		linkText: 'Direct Download Link →',
		backgroundColor: '#e0f2e7',
	},
	{
		key: 'submit',
		title: 'Step 6: Submit Request',
		icon: '✅',
		description: 'Scroll down, check "I understand" and click "Submit request" to initiate the download process.',
		image: require('@/assets/guides/23andme/6.png'),
		backgroundColor: '#f8fffe',
	},
	{
		key: 'email',
		title: 'Step 7: Check Your Email',
		icon: '📧',
		description: 'Wait for the download email from 23andMe. It will contain a link to download your file (e.g., genome_YourName_v4_Full_date.zip).',
		image: require('@/assets/guides/23andme/7.png'),
		backgroundColor: '#e8f5f0',
	},
	{
		key: 'transfer',
		title: 'Step 8: Transfer to Phone',
		icon: '📱',
		description: 'Transfer the file to your phone using one of these methods:',
		backgroundColor: '#f0f9f6',
		subsections: [
			{
				title: 'Option A: AirDrop (Mac)',
				description: 'Right-click the file, select Share → AirDrop, choose your iPhone',
				image: require('@/assets/guides/23andme/8a.png'),
			},
			{
				title: 'Option B: Cloud Storage',
				description: 'Upload to Dropbox/Google Drive, then download on your phone',
			},
			{
				title: 'Option C: Email',
				description: 'Email the file to yourself and save it to Downloads on your phone',
			},
		],
	},
	{
		key: 'upload',
		title: 'Step 9: Upload to BioVault',
		icon: '🚀',
		description: 'Once the file is on your phone, tap the "Load" button in BioVault and select your genome file from your phone\'s file system.',
		image: require('@/assets/guides/23andme/9.jpg'),
		backgroundColor: '#e0f2e7',
		isLast: true,
	},
]

interface WizardStepProps {
	step: typeof wizardSteps[0]
}

function WizardStep({ step }: WizardStepProps) {
	const { theme } = useTheme()

	const handleLinkPress = (url: string) => {
		Linking.openURL(url)
	}

	return (
		<ScrollView
			style={{ width }}
			contentContainerStyle={{
				padding: 20,
				paddingBottom: 120,
			}}
			showsVerticalScrollIndicator={false}
		>
			<View style={{
				backgroundColor: theme.surface,
				borderRadius: 20,
				padding: 20,
				shadowColor: '#000',
				shadowOffset: { width: 0, height: 4 },
				shadowOpacity: 0.1,
				shadowRadius: 12,
				elevation: 6,
			}}>
				{/* Icon or Logo */}
				<View style={{
					width: 80,
					height: 80,
					borderRadius: 40,
					backgroundColor: theme.primaryLight,
					justifyContent: 'center',
					alignItems: 'center',
					marginBottom: 20,
					borderWidth: 2,
					borderColor: theme.primary,
					alignSelf: 'center',
				}}>
					{step.logo ? (
						<Image
							source={step.logo}
							style={{ width: 50, height: 50 }}
							resizeMode="contain"
						/>
					) : (
						<Text style={{ fontSize: 40 }}>{step.icon}</Text>
					)}
				</View>

				{/* Title */}
				<Text style={[
					sharedStyles.title,
					{
						color: theme.textPrimary,
						textAlign: 'center',
						marginBottom: 12,
						fontSize: 24,
					}
				]}>
					{step.title}
				</Text>

				{/* Description */}
				<Text style={[
					sharedStyles.subtitle,
					{
						color: theme.textSecondary,
						textAlign: 'center',
						lineHeight: 22,
						marginBottom: 20,
						fontSize: 16,
					}
				]}>
					{step.description}
				</Text>

				{/* Link Button */}
				{step.link && (
					<TouchableOpacity
						style={{
							backgroundColor: theme.primary,
							paddingVertical: 12,
							paddingHorizontal: 20,
							borderRadius: 12,
							marginBottom: 20,
							alignSelf: 'center',
						}}
						onPress={() => handleLinkPress(step.link!)}
					>
						<Text style={{
							color: theme.textInverse,
							fontSize: 16,
							fontWeight: '600',
						}}>
							{step.linkText}
						</Text>
					</TouchableOpacity>
				)}

				{/* Main Image */}
				{step.image && (
					<View style={{
						marginTop: 10,
						marginBottom: 20,
						borderRadius: 12,
						overflow: 'hidden',
						borderWidth: 1,
						borderColor: theme.border,
					}}>
						<Image
							source={step.image}
							style={{
								width: '100%',
								height: step.isLast ? 400 : undefined,
								aspectRatio: step.isLast ? undefined : 16/9,
							}}
							resizeMode="contain"
						/>
					</View>
				)}

				{/* Subsections for transfer options */}
				{step.subsections && (
					<View style={{ marginTop: 10 }}>
						{step.subsections.map((subsection, index) => (
							<View
								key={index}
								style={{
									backgroundColor: theme.background,
									padding: 16,
									borderRadius: 12,
									marginBottom: 12,
									borderWidth: 1,
									borderColor: theme.border,
								}}
							>
								<Text style={{
									fontSize: 16,
									fontWeight: '600',
									color: theme.textPrimary,
									marginBottom: 8,
								}}>
									{subsection.title}
								</Text>
								<Text style={{
									fontSize: 14,
									color: theme.textSecondary,
									lineHeight: 20,
								}}>
									{subsection.description}
								</Text>
								{subsection.image && (
									<View style={{
										marginTop: 12,
										borderRadius: 8,
										overflow: 'hidden',
									}}>
										<Image
											source={subsection.image}
											style={{
												width: '100%',
												height: undefined,
												aspectRatio: 16/9,
											}}
											resizeMode="contain"
										/>
									</View>
								)}
							</View>
						))}
					</View>
				)}
			</View>
		</ScrollView>
	)
}

// ts-prune-ignore-next
export default function DNA23andMeWizard() {
	const [currentIndex, setCurrentIndex] = useState(0)
	const { theme } = useTheme()
	const ref = useRef<FlatList>(null)

	// Track page view for 23andMe guide
	useAnalytics({
		trackScreenView: true,
		screenProperties: {
			screen: '23andMe_Guide',
			provider: '23andMe',
			type: 'dna_file_guide'
		},
	})

	const isLastStep = currentIndex === wizardSteps.length - 1
	const isFirstStep = currentIndex === 0

	const handleNext = () => {
		if (currentIndex < wizardSteps.length - 1) {
			ref.current?.scrollToIndex({ index: currentIndex + 1 })
		} else {
			// Go back to My DNA page
			router.replace('/(tabs)' as const)
		}
	}

	const handleBack = () => {
		if (currentIndex > 0) {
			ref.current?.scrollToIndex({ index: currentIndex - 1 })
		} else {
			router.back()
		}
	}


	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
			{/* Header with Back Button */}
			<View style={{
				flexDirection: 'row',
				justifyContent: 'space-between',
				alignItems: 'center',
				paddingHorizontal: 20,
				paddingVertical: 10,
			}}>
				<TouchableOpacity
					onPress={() => router.back()}
					style={{ padding: 8 }}
				>
					<Text style={{
						fontSize: 16,
						color: theme.primary,
					}}>
						← Back
					</Text>
				</TouchableOpacity>
				<Text style={{
					fontSize: 18,
					fontWeight: '600',
					color: theme.textPrimary,
				}}>
					23andMe Guide
				</Text>
				<View style={{ width: 60 }} />
			</View>

			<FlatList
				ref={ref}
				horizontal
				pagingEnabled
				showsHorizontalScrollIndicator={false}
				onScroll={(e) => {
					const index = Math.round(e.nativeEvent.contentOffset.x / width)
					if (index !== currentIndex) {
						setCurrentIndex(index)
					}
				}}
				data={wizardSteps}
				renderItem={({ item }) => <WizardStep step={item} />}
				keyExtractor={(item) => item.key}
			/>

			<View style={{
				backgroundColor: theme.background,
				paddingHorizontal: 20,
				paddingBottom: 20,
				paddingTop: 10,
			}}>
				{/* Progress Indicators */}
				<View style={{
					flexDirection: 'row',
					justifyContent: 'center',
					marginBottom: 20,
				}}>
					{wizardSteps.map((_, index) => (
						<View
							key={index}
							style={[{
								width: index === currentIndex ? 24 : 8,
								height: 8,
								borderRadius: 4,
								marginHorizontal: 4,
								backgroundColor: index === currentIndex ? theme.primary : theme.inactive,
							}]}
						/>
					))}
				</View>

				{/* Step counter */}
				<Text style={{
					textAlign: 'center',
					fontSize: 14,
					color: theme.textSecondary,
					marginBottom: 20,
				}}>
					Step {currentIndex + 1} of {wizardSteps.length}
				</Text>

				{/* Navigation buttons */}
				<View style={{
					flexDirection: 'row',
					justifyContent: 'space-between',
					alignItems: 'center',
					gap: 12,
				}}>
					<TouchableOpacity
						style={{
							borderWidth: 2,
							borderColor: theme.primary,
							paddingVertical: 14,
							paddingHorizontal: 24,
							borderRadius: 12,
							backgroundColor: 'transparent',
						}}
						onPress={handleBack}
					>
						<Text style={{ color: theme.primary, fontSize: 16, fontWeight: '600' }}>
							{isFirstStep ? 'Cancel' : '← Previous'}
						</Text>
					</TouchableOpacity>

					<TouchableOpacity
						style={{
							backgroundColor: theme.primary,
							flex: 1,
							paddingVertical: 14,
							borderRadius: 12,
							alignItems: 'center',
						}}
						onPress={handleNext}
					>
						<Text style={{ color: theme.textInverse, fontSize: 16, fontWeight: '600' }}>
							{isLastStep ? 'Start Uploading' : 'Next →'}
						</Text>
					</TouchableOpacity>
				</View>
			</View>
		</SafeAreaView>
	)
}