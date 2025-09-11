/**
 * Analyze tab - BioVault collaborative genomics network
 * Aligned with biovault.net messaging and features
 */

import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Link } from 'expo-router'
import { listUserGenomeDatabases, type UserGenomeDatabase } from '@/lib/fast-genome-storage'

export default function AnalyzeScreen() {
	const [userDatabases, setUserDatabases] = useState<UserGenomeDatabase[]>([])
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		loadUserDatabases()
	}, [])

	const loadUserDatabases = async () => {
		try {
			const databases = await listUserGenomeDatabases()
			setUserDatabases(databases)
		} catch (error) {
			console.error('Failed to load user databases:', error)
		} finally {
			setLoading(false)
		}
	}

	const handleJoinNetwork = () => {
		Alert.alert(
			'Join BioVault Network',
			'Connect to the collaborative genomics network for research participation and expert analysis.',
			[
				{ text: 'Cancel', style: 'cancel' },
				{ text: 'Learn More', onPress: () => Linking.openURL('https://biovault.net/') },
			]
		)
	}

	const handleInviteExpert = () => {
		Alert.alert(
			'Invite Expert',
			'Generate a secure link for clinicians and experts to analyze your data locally on your device.',
			[{ text: 'Coming Soon' }]
		)
	}

	const openLink = (url: string) => {
		Linking.openURL(url)
	}

	if (userDatabases.length === 0) {
		return (
			<SafeAreaView style={styles.container}>
				<ScrollView style={styles.scrollView}>
					<View style={styles.header}>
						<Text style={styles.title}>BioVault Network</Text>
						<Text style={styles.subtitle}>
							Free, open-source, permissionless network for collaborative genomics
						</Text>
					</View>

					<View style={styles.networkCard}>
						<Text style={styles.networkTitle}>🌐 Collaborative Genomics</Text>
						<Text style={styles.networkText}>
							Share insights without ever sharing raw data. Built with end-to-end encryption, secure
							enclaves, and data visitation.
						</Text>
					</View>

					{renderNetworkFeatures()}
				</ScrollView>
			</SafeAreaView>
		)
	}

	function renderNetworkFeatures() {
		return (
			<>
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Network Features</Text>

					<View style={styles.featureCard}>
						<Text style={styles.featureTitle}>🔒 End-to-End Encryption</Text>
						<Text style={styles.featureText}>
							Encrypted messages via relay servers, no open ports needed. Data stays on your device.
						</Text>
					</View>

					<View style={styles.featureCard}>
						<Text style={styles.featureTitle}>⚡ Secure Enclaves</Text>
						<Text style={styles.featureText}>
							Perform joint analysis between datasets without centralizing data using secure
							enclaves.
						</Text>
					</View>

					<View style={styles.featureCard}>
						<Text style={styles.featureTitle}>🌐 Open Network</Text>
						<Text style={styles.featureText}>
							Built on SyftBox - permissionless collaboration without approval processes.
						</Text>
					</View>

					<View style={styles.featureCard}>
						<Text style={styles.featureTitle}>🔓 Open Source</Text>
						<Text style={styles.featureText}>
							Apache 2.0 licensed. Transparent, community-driven development.
						</Text>
					</View>
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Supported Data Formats</Text>

					<View style={styles.formatsGrid}>
						<View style={styles.formatChip}>
							<Text style={styles.formatText}>VCFs</Text>
						</View>
						<View style={styles.formatChip}>
							<Text style={styles.formatText}>23andMe</Text>
						</View>
						<View style={styles.formatChip}>
							<Text style={styles.formatText}>AncestryDNA</Text>
						</View>
						<View style={styles.formatChip}>
							<Text style={styles.formatText}>MyHeritage</Text>
						</View>
						<View style={styles.formatChip}>
							<Text style={styles.formatText}>Sequencing.com</Text>
						</View>
						<View style={styles.formatChip}>
							<Text style={styles.formatText}>Dante Labs</Text>
						</View>
						<View style={styles.formatChip}>
							<Text style={styles.formatText}>CariGenetics</Text>
						</View>
						<View style={styles.formatChip}>
							<Text style={styles.formatText}>FASTQ</Text>
						</View>
						<View style={styles.formatChip}>
							<Text style={styles.formatText}>BAM/CRAM</Text>
						</View>
					</View>
				</View>
			</>
		)
	}

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView style={styles.scrollView}>
				<View style={styles.header}>
					<Text style={styles.title}>BioVault Network</Text>
					<Text style={styles.subtitle}>
						Collaborative genomics with privacy-first data visitation
					</Text>
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Your Data</Text>

					{userDatabases.map((database, index) => (
						<View key={index} style={styles.dataFileCard}>
							<View style={styles.fileHeader}>
								<Text style={styles.fileName}>{database.fileName}</Text>
								<View style={styles.readyBadge}>
									<Text style={styles.readyBadgeText}>Ready for Analysis</Text>
								</View>
							</View>

							<View style={styles.fileStats}>
								<Text style={styles.fileStatText}>
									{database.totalVariants.toLocaleString()} variants ready for collaboration
								</Text>
								<Text style={styles.fileStatText}>
									Uploaded {new Date(database.uploadDate).toLocaleDateString()}
								</Text>
							</View>

							<View style={styles.actionButtons}>
								<TouchableOpacity style={styles.inviteButton} onPress={handleInviteExpert}>
									<Text style={styles.inviteButtonText}>👨‍⚕️ Invite Expert</Text>
								</TouchableOpacity>

								<TouchableOpacity style={styles.networkButton} onPress={handleJoinNetwork}>
									<Text style={styles.networkButtonText}>🌐 Join Network</Text>
								</TouchableOpacity>
							</View>
						</View>
					))}
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>How BioVault Works</Text>

					<View style={styles.howItWorksCard}>
						<Text style={styles.howItWorksTitle}>For Participants</Text>
						<Text style={styles.bulletPoint}>• Get free ClinVar updates without sharing data</Text>
						<Text style={styles.bulletPoint}>
							• Invite clinicians to analyze data on your computer securely
						</Text>
						<Text style={styles.bulletPoint}>
							• Participate in research while maintaining data control
						</Text>
					</View>

					<View style={styles.howItWorksCard}>
						<Text style={styles.howItWorksTitle}>For Researchers</Text>
						<Text style={styles.bulletPoint}>• Submit NextFlow pipelines to participants</Text>
						<Text style={styles.bulletPoint}>
							• Perform joins between datasets using Secure Enclaves
						</Text>
						<Text style={styles.bulletPoint}>
							• No need to safeguard sensitive data that's never shared
						</Text>
					</View>
				</View>

				{renderNetworkFeatures()}

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Built on SyftBox</Text>

					<View style={styles.syftboxCard}>
						<Text style={styles.syftboxTitle}>🔧 SyftBox Network</Text>
						<Text style={styles.syftboxText}>
							Open-source network for privacy-first, offline-capable data science. Works on mobile
							devices and home computers that can go offline.
						</Text>
						<TouchableOpacity
							style={styles.linkButton}
							onPress={() => openLink('https://syftbox.net/')}
						>
							<Text style={styles.linkText}>Learn about SyftBox →</Text>
						</TouchableOpacity>
					</View>
				</View>

				<View style={styles.ctaSection}>
					<TouchableOpacity
						style={styles.joinBetaButton}
						onPress={() => openLink('https://biovault.net/')}
					>
						<Text style={styles.joinBetaText}>Join Beta Network</Text>
					</TouchableOpacity>
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
	header: {
		padding: 20,
		paddingBottom: 10,
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
	networkCard: {
		backgroundColor: '#e8f5e8',
		marginHorizontal: 20,
		marginVertical: 10,
		padding: 20,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: '#4CAF50',
	},
	networkTitle: {
		fontSize: 18,
		fontWeight: '600',
		color: '#2e7d32',
		marginBottom: 8,
	},
	networkText: {
		fontSize: 14,
		color: '#2e7d32',
		lineHeight: 20,
	},
	emptyCard: {
		backgroundColor: 'white',
		marginHorizontal: 20,
		marginVertical: 10,
		padding: 24,
		borderRadius: 12,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	emptyTitle: {
		fontSize: 20,
		fontWeight: '600',
		color: '#333',
		marginBottom: 8,
	},
	emptyText: {
		fontSize: 14,
		color: '#666',
		textAlign: 'center',
		marginBottom: 20,
		lineHeight: 20,
	},
	uploadButton: {
		backgroundColor: '#4CAF50',
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 8,
	},
	uploadButtonText: {
		color: 'white',
		fontSize: 16,
		fontWeight: '600',
	},
	section: {
		marginBottom: 24,
	},
	sectionTitle: {
		fontSize: 20,
		fontWeight: '600',
		color: '#333',
		marginBottom: 12,
		marginHorizontal: 20,
	},
	dataFileCard: {
		backgroundColor: 'white',
		marginHorizontal: 20,
		marginVertical: 6,
		padding: 16,
		borderRadius: 12,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	fileHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 8,
	},
	fileName: {
		fontSize: 16,
		fontWeight: '600',
		color: '#333',
		flex: 1,
	},
	readyBadge: {
		backgroundColor: '#4CAF50',
		paddingHorizontal: 8,
		paddingVertical: 2,
		borderRadius: 12,
	},
	readyBadgeText: {
		fontSize: 10,
		fontWeight: '600',
		color: 'white',
	},
	fileStats: {
		marginBottom: 12,
	},
	fileStatText: {
		fontSize: 12,
		color: '#666',
		marginBottom: 2,
	},
	actionButtons: {
		flexDirection: 'row',
		gap: 8,
	},
	inviteButton: {
		backgroundColor: '#e3f2fd',
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 6,
		flex: 1,
		alignItems: 'center',
	},
	inviteButtonText: {
		fontSize: 12,
		color: '#1976d2',
		fontWeight: '600',
	},
	networkButton: {
		backgroundColor: '#e8f5e8',
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 6,
		flex: 1,
		alignItems: 'center',
	},
	networkButtonText: {
		fontSize: 12,
		color: '#2e7d32',
		fontWeight: '600',
	},
	howItWorksCard: {
		backgroundColor: 'white',
		marginHorizontal: 20,
		marginVertical: 6,
		padding: 16,
		borderRadius: 12,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	howItWorksTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#333',
		marginBottom: 8,
	},
	bulletPoint: {
		fontSize: 14,
		color: '#666',
		lineHeight: 20,
		marginBottom: 4,
	},
	featureCard: {
		backgroundColor: 'white',
		marginHorizontal: 20,
		marginVertical: 6,
		padding: 16,
		borderRadius: 12,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	featureTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#333',
		marginBottom: 6,
	},
	featureText: {
		fontSize: 14,
		color: '#666',
		lineHeight: 18,
	},
	formatsGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		marginHorizontal: 20,
		gap: 8,
	},
	formatChip: {
		backgroundColor: 'white',
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: '#e0e0e0',
	},
	formatText: {
		fontSize: 12,
		color: '#666',
		fontWeight: '500',
	},
	syftboxCard: {
		backgroundColor: '#f3e5f5',
		marginHorizontal: 20,
		marginVertical: 6,
		padding: 16,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: '#9c27b0',
	},
	syftboxTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#6a1b9a',
		marginBottom: 8,
	},
	syftboxText: {
		fontSize: 14,
		color: '#6a1b9a',
		lineHeight: 18,
		marginBottom: 12,
	},
	linkButton: {
		backgroundColor: 'rgba(156, 39, 176, 0.1)',
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 6,
		alignSelf: 'flex-start',
	},
	linkText: {
		fontSize: 14,
		color: '#6a1b9a',
		fontWeight: '600',
	},
	ctaSection: {
		paddingHorizontal: 20,
		paddingVertical: 20,
		alignItems: 'center',
	},
	joinBetaButton: {
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
	joinBetaText: {
		fontSize: 18,
		fontWeight: '700',
		color: 'white',
	},
})
