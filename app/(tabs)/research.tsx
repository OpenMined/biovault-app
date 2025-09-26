/**
 * Research tab - Funnel users to desktop BioVault app for collaborative genomics
 * Focus: Participant onboarding and desktop app benefits
 */

import { useAnalytics } from '@/hooks/useAnalytics'
import { useState } from 'react'
import { Alert, Linking, ScrollView, Text, TouchableOpacity, View, Modal, TextInput, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { layout, researchStyles } from '@/styles'
import { useTheme } from '@/contexts/ThemeContext'

interface DesktopBenefit {
	icon: string
	title: string
	description: string
}

// ts-prune-ignore-next
export default function ResearchScreen() {
	useAnalytics({
		trackScreenView: true,
		screenProperties: { screen: 'Research' },
	})
	const [showInstallGuide, setShowInstallGuide] = useState(false)
	const [showEmailModal, setShowEmailModal] = useState(false)
	const [email, setEmail] = useState('')
	const [isSubmitting, setIsSubmitting] = useState(false)
	const { theme } = useTheme()

	const desktopBenefits: DesktopBenefit[] = [
		{
			icon: '🔬',
			title: 'Advanced Analysis',
			description: 'Access larger reference databases and run complex genomic analyses',
		},
		{
			icon: '🤝',
			title: 'Research Collaboration',
			description: 'Allow researchers to run private NextFlow workflows on your data',
		},
		{
			icon: '🖥️',
			title: 'Full Computing Power',
			description: "Leverage your computer's resources for comprehensive genomic insights",
		},
		{
			icon: '🔒',
			title: 'Maximum Privacy',
			description: 'Data stays on your computer with secure enclave technology',
		},
		{
			icon: '🌐',
			title: 'Global Network',
			description: 'Connect to the worldwide BioVault research community',
		},
		{
			icon: '🆓',
			title: 'Free & Open Source',
			description: 'Apache 2.0 licensed with transparent, community-driven development',
		},
	]

	const handleInstallDesktop = () => {
		setShowEmailModal(true)
	}

	const handleEmailSubmit = async () => {
		if (!email || !email.includes('@')) {
			Alert.alert('Invalid Email', 'Please enter a valid email address')
			return
		}

		setIsSubmitting(true)
		try {
			const response = await fetch('https://biovault.net/api/waitlist', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: `email=${encodeURIComponent(email)}`,
			})

			if (response.ok) {
				Alert.alert(
					'Success!',
					'Thanks we will be in touch soon.',
					[
						{
							text: 'OK',
							onPress: () => {
								setShowEmailModal(false)
								setEmail('')
							}
						}
					]
				)
			} else {
				Alert.alert('Error', 'Something went wrong. Please try again later.')
			}
		} catch {
			Alert.alert('Error', 'Unable to connect to server. Please check your internet connection.')
		} finally {
			setIsSubmitting(false)
		}
	}

	const handleLearnMore = (feature: string) => {
		Alert.alert(
			`${feature} - Desktop Only`,
			'This feature requires the desktop BioVault app for secure execution and full privacy protection.',
			[
				{ text: 'Maybe Later', style: 'cancel' },
				{ text: 'Install Desktop App', onPress: handleInstallDesktop },
			]
		)
	}

	const renderDesktopPromotion = () => (
		<View style={styles.promoCard}>
			<View style={styles.promoHeader}>
				<Text style={styles.promoTitle}>BioVault Research</Text>
				<Text style={styles.promoSubtitle}>
					Collaborative genomics with privacy-first data science
				</Text>
			</View>

			<View style={styles.benefitsList}>
				{desktopBenefits.map((benefit, index) => (
					<TouchableOpacity
						key={index}
						style={styles.benefitCard}
						onPress={() => handleLearnMore(benefit.title)}
					>
						<View style={styles.benefitIconContainer}>
							<Text style={styles.benefitIcon}>{benefit.icon}</Text>
						</View>
						<View style={styles.benefitContent}>
							<Text style={styles.benefitTitle}>{benefit.title}</Text>
							<Text style={styles.benefitDescription}>{benefit.description}</Text>
						</View>
						<View style={styles.benefitArrow}>
							<Text style={styles.arrowText}>→</Text>
						</View>
					</TouchableOpacity>
				))}
			</View>

			<TouchableOpacity style={styles.installButton} onPress={handleInstallDesktop}>
				<Text style={styles.installButtonText}>Register Interest</Text>
			</TouchableOpacity>
		</View>
	)

	const renderInstallationGuide = () => {
		if (!showInstallGuide) return null

		return (
			<View style={styles.guideCard}>
				<View style={styles.guideHeader}>
					<Text style={styles.guideTitle}>Installation Guide</Text>
					<TouchableOpacity onPress={() => setShowInstallGuide(false)}>
						<Text style={styles.closeButton}>✕</Text>
					</TouchableOpacity>
				</View>

				<View style={styles.stepCard}>
					<Text style={styles.stepNumber}>1</Text>
					<View style={styles.stepContent}>
						<Text style={styles.stepTitle}>Visit BioVault.net</Text>
						<Text style={styles.stepDescription}>Download the desktop app for your platform</Text>
					</View>
				</View>

				<View style={styles.stepCard}>
					<Text style={styles.stepNumber}>2</Text>
					<View style={styles.stepContent}>
						<Text style={styles.stepTitle}>Install & Setup</Text>
						<Text style={styles.stepDescription}>
							Follow the installation wizard to set up SyftBox integration
						</Text>
					</View>
				</View>

				<View style={styles.stepCard}>
					<Text style={styles.stepNumber}>3</Text>
					<View style={styles.stepContent}>
						<Text style={styles.stepTitle}>Import Your Data</Text>
						<Text style={styles.stepDescription}>
							Transfer your genetic data from mobile to desktop securely
						</Text>
					</View>
				</View>

				<View style={styles.stepCard}>
					<Text style={styles.stepNumber}>4</Text>
					<View style={styles.stepContent}>
						<Text style={styles.stepTitle}>Join Research</Text>
						<Text style={styles.stepDescription}>
							Start collaborating with researchers worldwide
						</Text>
					</View>
				</View>

				<TouchableOpacity
					style={styles.visitWebsiteButton}
					onPress={() => Linking.openURL('https://biovault.net')}
				>
					<Text style={styles.visitWebsiteButtonText}>Visit BioVault.net</Text>
				</TouchableOpacity>
			</View>
		)
	}

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView
				style={styles.scrollView}
				contentContainerStyle={styles.scrollContent}
				showsVerticalScrollIndicator={false}
			>
				{/* Comment out SyftBox auth for now since features require desktop */}
				{/* {renderSyftBoxAuth()} */}

				{renderDesktopPromotion()}
				{renderInstallationGuide()}

				{/* Email Registration Modal */}
				<Modal
					visible={showEmailModal}
					animationType="fade"
					transparent={true}
					onRequestClose={() => setShowEmailModal(false)}
				>
					<View style={{
						flex: 1,
						justifyContent: 'center',
						alignItems: 'center',
						backgroundColor: 'rgba(0, 0, 0, 0.5)',
					}}>
						<View style={{
							backgroundColor: theme.background,
							borderRadius: 20,
							padding: 30,
							width: '85%',
							maxWidth: 400,
							shadowColor: '#000',
							shadowOffset: { width: 0, height: 4 },
							shadowOpacity: 0.25,
							shadowRadius: 12,
							elevation: 10,
						}}>
							<Text style={{
								fontSize: 24,
								fontWeight: '700',
								color: theme.textPrimary,
								marginBottom: 12,
								textAlign: 'center',
							}}>
								Join the Beta Waitlist
							</Text>
							<Text style={{
								fontSize: 14,
								color: theme.textSecondary,
								marginBottom: 20,
								textAlign: 'center',
								lineHeight: 20,
							}}>
								Be the first to know when BioVault Desktop is ready for collaborative genomics research
							</Text>
							<TextInput
								style={{
									height: 50,
									borderWidth: 1,
									borderColor: theme.border,
									borderRadius: 12,
									paddingHorizontal: 16,
									fontSize: 16,
									color: theme.textPrimary,
									backgroundColor: theme.surface,
									marginBottom: 20,
								}}
								placeholder="Enter your email for beta access"
								placeholderTextColor={theme.textSecondary}
								value={email}
								onChangeText={setEmail}
								keyboardType="email-address"
								autoCapitalize="none"
								autoCorrect={false}
								editable={!isSubmitting}
							/>
							<View style={{
								flexDirection: 'row',
								gap: 12,
							}}>
								<TouchableOpacity
									style={{
										flex: 1,
										paddingVertical: 14,
										borderRadius: 12,
										borderWidth: 2,
										borderColor: theme.border,
										alignItems: 'center',
									}}
									onPress={() => setShowEmailModal(false)}
									disabled={isSubmitting}
								>
									<Text style={{
										fontSize: 16,
										fontWeight: '600',
										color: theme.textPrimary,
									}}>
										Cancel
									</Text>
								</TouchableOpacity>
								<TouchableOpacity
									style={{
										flex: 1,
										backgroundColor: '#059669',
										paddingVertical: 14,
										borderRadius: 12,
										alignItems: 'center',
										opacity: isSubmitting ? 0.7 : 1,
									}}
									onPress={handleEmailSubmit}
									disabled={isSubmitting}
								>
									{isSubmitting ? (
										<ActivityIndicator color="white" />
									) : (
										<Text style={{
											fontSize: 16,
											fontWeight: '600',
											color: 'white',
										}}>
											Join Beta
										</Text>
									)}
								</TouchableOpacity>
							</View>
						</View>
					</View>
				</Modal>

				<View style={styles.networkOverview}>
					<Text style={styles.overviewTitle}>How BioVault Works</Text>

					<View style={styles.workflowCard}>
						<Text style={styles.workflowTitle}>For Participants (You)</Text>
						<Text style={styles.workflowStep}>🧬 Load your genetic data into the desktop app</Text>
						<Text style={styles.workflowStep}>
							🔒 Data stays on your computer - never leaves your device
						</Text>
						<Text style={styles.workflowStep}>
							👨‍🔬 Researchers run analyses locally on your machine
						</Text>
						<Text style={styles.workflowStep}>📊 Share insights, not raw data</Text>
					</View>

					<View style={styles.workflowCard}>
						<Text style={styles.workflowTitle}>For Researchers</Text>
						<Text style={styles.workflowStep}>📝 Submit NextFlow pipelines to participants</Text>
						<Text style={styles.workflowStep}>🔐 Secure execution in participant environments</Text>
						<Text style={styles.workflowStep}>🤝 Collaborate without data centralization</Text>
						<Text style={styles.workflowStep}>⚡ Leverage secure enclaves for joint analysis</Text>
					</View>
				</View>
			</ScrollView>
		</SafeAreaView>
	)
}

const styles = {
	...researchStyles,
	container: layout.screenContainer,
	scrollView: {
		flex: 1,
	},
	scrollContent: layout.scrollContent,
	header: layout.headerSection,
	title: {
		fontSize: 28,
		fontWeight: '700' as const,
		color: '#333',
		marginBottom: 4,
	},
	subtitle: {
		fontSize: 16,
		color: '#666',
		lineHeight: 22,
	},
	// Supported Formats Styles
	supportedFormats: {
		marginHorizontal: 20,
		marginBottom: 20,
	},
	formatsTitle: {
		fontSize: 18,
		fontWeight: '600',
		color: '#333',
		marginBottom: 12,
	},
	formatsGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
	},
	formatChip: {
		backgroundColor: 'white',
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: '#e0e0e0',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 2,
		elevation: 2,
	},
	formatText: {
		fontSize: 12,
		color: '#666',
		fontWeight: '500',
	},
	// Coming Soon Styles
	comingSoonCard: {
		backgroundColor: '#f3e5f5',
		marginHorizontal: 20,
		marginBottom: 20,
		padding: 20,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: '#9c27b0',
	},
	comingSoonTitle: {
		fontSize: 18,
		fontWeight: '700',
		color: '#6a1b9a',
		marginBottom: 12,
	},
	comingSoonDescription: {
		fontSize: 14,
		color: '#6a1b9a',
		lineHeight: 20,
	},
	// CTA Section Styles
	ctaSection: {
		alignItems: 'center',
		paddingHorizontal: 20,
		paddingVertical: 20,
	},
	primaryCTA: {
		backgroundColor: '#4CAF50',
		paddingHorizontal: 32,
		paddingVertical: 16,
		borderRadius: 12,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 8,
		elevation: 4,
	},
	primaryCTAText: {
		fontSize: 18,
		fontWeight: '700',
		color: 'white',
	},
}
