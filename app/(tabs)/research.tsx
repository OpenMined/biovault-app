/**
 * Research tab - Funnel users to desktop BioVault app for collaborative genomics
 * Focus: Participant onboarding and desktop app benefits
 */

import React, { useState } from 'react'
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

interface DesktopBenefit {
	icon: string
	title: string
	description: string
}

// ts-prune-ignore-next
export default function ResearchScreen() {
	const [showInstallGuide, setShowInstallGuide] = useState(false)

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
		Alert.alert(
			'Install Biovault Desktop',
			'Ready to unlock the full power of collaborative genomics?',
			[
				{ text: 'Not Now', style: 'cancel' },
				{ text: 'Installation Guide', onPress: () => setShowInstallGuide(true) },
				{ text: 'Visit BioVault.net', onPress: () => Linking.openURL('https://biovault.net') },
			]
		)
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
				<Text style={styles.promoTitle}>🖥️ Unlock Full BioVault Power</Text>
				<Text style={styles.promoSubtitle}>
					Install the desktop app to participate in collaborative genomics research
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
				<Text style={styles.installButtonText}>🚀 Install Biovault Desktop</Text>
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
				<View style={styles.header}>
					<Text style={styles.title}>BioVault Research</Text>
					<Text style={styles.subtitle}>
						Collaborative genomics with privacy-first data science
					</Text>
				</View>

				{/* Comment out SyftBox auth for now since features require desktop */}
				{/* {renderSyftBoxAuth()} */}

				{renderDesktopPromotion()}
				{renderInstallationGuide()}

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

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#f5f5f5',
	},
	scrollView: {
		flex: 1,
	},
	scrollContent: {
		flexGrow: 1,
		paddingBottom: 100, // Increased padding for Android tab bar
	},
	header: {
		padding: 20,
		paddingBottom: 16,
	},
	title: {
		fontSize: 28,
		fontWeight: '700',
		color: '#333',
		marginBottom: 4,
	},
	subtitle: {
		fontSize: 16,
		color: '#666',
		lineHeight: 22,
	},
	// Desktop Promotion Styles
	promoCard: {
		backgroundColor: 'white',
		marginHorizontal: 20,
		marginBottom: 20,
		padding: 24,
		borderRadius: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	promoHeader: {
		alignItems: 'center',
		marginBottom: 24,
	},
	promoTitle: {
		fontSize: 24,
		fontWeight: '700',
		color: '#333',
		marginBottom: 8,
		textAlign: 'center',
	},
	promoSubtitle: {
		fontSize: 16,
		color: '#666',
		textAlign: 'center',
		lineHeight: 22,
	},
	benefitsList: {
		marginBottom: 24,
	},
	benefitCard: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: 'white',
		padding: 16,
		borderRadius: 12,
		marginBottom: 12,
		borderWidth: 1,
		borderColor: '#e0e0e0',
	},
	benefitIconContainer: {
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: '#f0f8f0',
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 12,
	},
	benefitIcon: {
		fontSize: 20,
	},
	benefitContent: {
		flex: 1,
	},
	benefitTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#333',
		marginBottom: 2,
	},
	benefitDescription: {
		fontSize: 13,
		color: '#666',
		lineHeight: 18,
	},
	benefitArrow: {
		width: 24,
		height: 24,
		borderRadius: 12,
		backgroundColor: '#4CAF50',
		justifyContent: 'center',
		alignItems: 'center',
		marginLeft: 8,
	},
	arrowText: {
		fontSize: 12,
		color: 'white',
		fontWeight: '600',
	},
	installButton: {
		backgroundColor: '#4CAF50',
		paddingVertical: 16,
		borderRadius: 12,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 8,
		elevation: 4,
	},
	installButtonText: {
		fontSize: 18,
		fontWeight: '700',
		color: 'white',
	},
	// Installation Guide Styles
	guideCard: {
		backgroundColor: 'white',
		marginHorizontal: 20,
		marginBottom: 20,
		padding: 20,
		borderRadius: 16,
		borderWidth: 2,
		borderColor: '#4CAF50',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	guideHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 20,
	},
	guideTitle: {
		fontSize: 20,
		fontWeight: '700',
		color: '#333',
	},
	closeButton: {
		fontSize: 18,
		color: '#666',
		fontWeight: '600',
	},
	stepCard: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		marginBottom: 16,
	},
	stepNumber: {
		width: 28,
		height: 28,
		borderRadius: 14,
		backgroundColor: '#4CAF50',
		color: 'white',
		fontSize: 14,
		fontWeight: '700',
		textAlign: 'center',
		lineHeight: 28,
		marginRight: 12,
	},
	stepContent: {
		flex: 1,
	},
	stepTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#333',
		marginBottom: 4,
	},
	stepDescription: {
		fontSize: 14,
		color: '#666',
		lineHeight: 18,
	},
	visitWebsiteButton: {
		backgroundColor: '#4CAF50',
		paddingVertical: 12,
		borderRadius: 8,
		alignItems: 'center',
		marginTop: 8,
	},
	visitWebsiteButtonText: {
		color: 'white',
		fontSize: 16,
		fontWeight: '600',
	},
	// Network Overview Styles
	networkOverview: {
		marginHorizontal: 20,
		marginBottom: 20,
	},
	overviewTitle: {
		fontSize: 20,
		fontWeight: '700',
		color: '#333',
		marginBottom: 16,
	},
	workflowCard: {
		backgroundColor: 'white',
		padding: 20,
		borderRadius: 12,
		marginBottom: 12,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	workflowTitle: {
		fontSize: 16,
		fontWeight: '700',
		color: '#333',
		marginBottom: 12,
	},
	workflowStep: {
		fontSize: 14,
		color: '#666',
		marginBottom: 8,
		lineHeight: 18,
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
})
