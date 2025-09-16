/**
 * Biobanks - Browse and connect to biobanks on the BioVault network (Web only)
 * Based on 'bv biobank list' CLI functionality
 */

import React, { useState } from 'react'
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

interface Biobank {
	id: string
	name: string
	institution: string
	location: string
	participantCount: number
	dataTypes: string[]
	focus: string[]
	lastUpdate: string
	isPublic: boolean
}

export default function Biobanks() {
	const [selectedFilter, setSelectedFilter] = useState<string>('all')

	const biobanks: Biobank[] = [
		{
			id: 'stanford-biobank',
			name: 'Stanford Genomics Biobank',
			institution: 'Stanford University',
			location: 'Stanford, CA',
			participantCount: 15420,
			dataTypes: ['WGS', 'Exome', 'Phenotype', 'Clinical'],
			focus: ['Rare Diseases', 'Pharmacogenomics', 'Cancer'],
			lastUpdate: '2024-01-15',
			isPublic: true,
		},
		{
			id: 'broad-biobank',
			name: 'Broad Institute Biobank',
			institution: 'Broad Institute',
			location: 'Boston, MA',
			participantCount: 28750,
			dataTypes: ['VCF', 'GWAS', 'Phenotype'],
			focus: ['Population Genetics', 'Complex Traits'],
			lastUpdate: '2024-01-16',
			isPublic: true,
		},
		{
			id: 'uk-biobank',
			name: 'UK Biobank Collaborative',
			institution: 'UK Biobank',
			location: 'Manchester, UK',
			participantCount: 125000,
			dataTypes: ['WGS', 'Array', 'Phenotype', 'Imaging'],
			focus: ['Population Health', 'Aging', 'Disease Prevention'],
			lastUpdate: '2024-01-14',
			isPublic: false,
		},
		{
			id: 'rare-disease-network',
			name: 'Global Rare Disease Network',
			institution: 'Rare Disease Foundation',
			location: 'Global',
			participantCount: 8930,
			dataTypes: ['WGS', 'Exome', 'Clinical', 'Phenotype'],
			focus: ['Rare Diseases', 'Undiagnosed Cases'],
			lastUpdate: '2024-01-16',
			isPublic: true,
		},
	]

	const filters = [
		{ id: 'all', name: 'All Biobanks', icon: '🏦' },
		{ id: 'public', name: 'Public', icon: '🌐' },
		{ id: 'rare-disease', name: 'Rare Disease', icon: '🧬' },
		{ id: 'population', name: 'Population', icon: '👥' },
	]

	const filteredBiobanks =
		selectedFilter === 'all'
			? biobanks
			: selectedFilter === 'public'
			? biobanks.filter((b) => b.isPublic)
			: biobanks.filter((b) =>
					b.focus.some((f) => f.toLowerCase().includes(selectedFilter.replace('-', ' ')))
			  )

	const handleConnectToBiobank = (biobank: Biobank) => {
		Alert.alert(
			'Connect to Biobank',
			`Request access to ${biobank.name}? This will send a collaboration request to the biobank administrators.`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{ text: 'Send Request', onPress: () => console.log(`Connecting to ${biobank.id}`) },
			]
		)
	}

	const handleViewBiobank = (biobank: Biobank) => {
		Alert.alert(
			biobank.name,
			`Institution: ${biobank.institution}\nLocation: ${
				biobank.location
			}\nParticipants: ${biobank.participantCount.toLocaleString()}\nFocus Areas: ${biobank.focus.join(
				', '
			)}`,
			[{ text: 'OK' }]
		)
	}

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView style={styles.scrollView}>
				<View style={styles.header}>
					<Text style={styles.title}>BioVault Biobanks</Text>
					<Text style={styles.subtitle}>
						Discover and connect to biobanks participating in the BioVault network
					</Text>
				</View>

				<View style={styles.filtersCard}>
					<Text style={styles.filtersTitle}>Filter Biobanks</Text>
					<View style={styles.filtersGrid}>
						{filters.map((filter) => (
							<TouchableOpacity
								key={filter.id}
								style={[styles.filterChip, selectedFilter === filter.id && styles.filterChipActive]}
								onPress={() => setSelectedFilter(filter.id)}
							>
								<Text style={styles.filterIcon}>{filter.icon}</Text>
								<Text
									style={[
										styles.filterText,
										selectedFilter === filter.id && styles.filterTextActive,
									]}
								>
									{filter.name}
								</Text>
							</TouchableOpacity>
						))}
					</View>
				</View>

				<View style={styles.biobanksSection}>
					<Text style={styles.sectionTitle}>Available Biobanks ({filteredBiobanks.length})</Text>

					{filteredBiobanks.map((biobank) => (
						<View key={biobank.id} style={styles.biobankCard}>
							<View style={styles.biobankHeader}>
								<View style={styles.biobankInfo}>
									<Text style={styles.biobankName}>{biobank.name}</Text>
									<Text style={styles.biobankInstitution}>{biobank.institution}</Text>
									<Text style={styles.biobankLocation}>📍 {biobank.location}</Text>
								</View>
								<View style={styles.biobankMeta}>
									<Text style={styles.participantCount}>
										{biobank.participantCount.toLocaleString()} participants
									</Text>
									{biobank.isPublic && (
										<View style={styles.publicBadge}>
											<Text style={styles.publicBadgeText}>PUBLIC</Text>
										</View>
									)}
								</View>
							</View>

							<View style={styles.focusContainer}>
								<Text style={styles.focusLabel}>Focus Areas:</Text>
								{biobank.focus.map((focus, index) => (
									<View key={index} style={styles.focusChip}>
										<Text style={styles.focusText}>{focus}</Text>
									</View>
								))}
							</View>

							<View style={styles.dataTypesContainer}>
								<Text style={styles.dataTypesLabel}>Data Types:</Text>
								{biobank.dataTypes.map((type, index) => (
									<View key={index} style={styles.dataTypeChip}>
										<Text style={styles.dataTypeText}>{type}</Text>
									</View>
								))}
							</View>

							<View style={styles.biobankFooter}>
								<Text style={styles.lastUpdate}>
									Last updated: {new Date(biobank.lastUpdate).toLocaleDateString()}
								</Text>
								<View style={styles.biobankActions}>
									<TouchableOpacity
										style={styles.viewButton}
										onPress={() => handleViewBiobank(biobank)}
									>
										<Text style={styles.viewButtonText}>View Details</Text>
									</TouchableOpacity>
									<TouchableOpacity
										style={styles.connectButton}
										onPress={() => handleConnectToBiobank(biobank)}
									>
										<Text style={styles.connectButtonText}>Connect</Text>
									</TouchableOpacity>
								</View>
							</View>
						</View>
					))}
				</View>

				<View style={styles.infoCard}>
					<Text style={styles.infoTitle}>🏦 About Biobanks</Text>
					<Text style={styles.infoText}>
						• Biobanks are collections of genetic data from research institutions
					</Text>
					<Text style={styles.infoText}>
						• Connect to biobanks to participate in large-scale studies
					</Text>
					<Text style={styles.infoText}>
						• All collaborations maintain data privacy and user control
					</Text>
					<Text style={styles.infoText}>
						• Researchers can perform joint analysis without data sharing
					</Text>
				</View>
			</ScrollView>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#f5f5f5',
		paddingTop: Platform.OS === 'web' ? 60 : 0, // Add padding for web tab bar
	},
	scrollView: {
		flex: 1,
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
	filtersCard: {
		backgroundColor: 'white',
		marginHorizontal: 20,
		marginBottom: 20,
		padding: 20,
		borderRadius: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	filtersTitle: {
		fontSize: 18,
		fontWeight: '700',
		color: '#333',
		marginBottom: 16,
	},
	filtersGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
	},
	filterChip: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: '#f8f9fa',
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 20,
		borderWidth: 1,
		borderColor: '#e0e0e0',
	},
	filterChipActive: {
		backgroundColor: '#4CAF50',
		borderColor: '#4CAF50',
	},
	filterIcon: {
		fontSize: 14,
		marginRight: 6,
	},
	filterText: {
		fontSize: 14,
		color: '#666',
		fontWeight: '500',
	},
	filterTextActive: {
		color: 'white',
		fontWeight: '600',
	},
	biobanksSection: {
		marginHorizontal: 20,
		marginBottom: 20,
	},
	sectionTitle: {
		fontSize: 20,
		fontWeight: '700',
		color: '#333',
		marginBottom: 16,
	},
	biobankCard: {
		backgroundColor: 'white',
		padding: 20,
		borderRadius: 12,
		marginBottom: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	biobankHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
		marginBottom: 16,
	},
	biobankInfo: {
		flex: 1,
	},
	biobankName: {
		fontSize: 18,
		fontWeight: '700',
		color: '#333',
		marginBottom: 4,
	},
	biobankInstitution: {
		fontSize: 16,
		color: '#666',
		marginBottom: 4,
	},
	biobankLocation: {
		fontSize: 14,
		color: '#999',
	},
	biobankMeta: {
		alignItems: 'flex-end',
	},
	participantCount: {
		fontSize: 14,
		color: '#4CAF50',
		fontWeight: '600',
		marginBottom: 8,
	},
	publicBadge: {
		backgroundColor: '#2196f3',
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 12,
	},
	publicBadgeText: {
		fontSize: 10,
		fontWeight: '700',
		color: 'white',
	},
	focusContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		flexWrap: 'wrap',
		marginBottom: 12,
		gap: 8,
	},
	focusLabel: {
		fontSize: 12,
		color: '#666',
		fontWeight: '600',
		marginRight: 4,
	},
	focusChip: {
		backgroundColor: '#fff3cd',
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 12,
	},
	focusText: {
		fontSize: 10,
		color: '#856404',
		fontWeight: '600',
	},
	dataTypesContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		flexWrap: 'wrap',
		marginBottom: 16,
		gap: 8,
	},
	dataTypesLabel: {
		fontSize: 12,
		color: '#666',
		fontWeight: '600',
		marginRight: 4,
	},
	dataTypeChip: {
		backgroundColor: '#e3f2fd',
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 12,
	},
	dataTypeText: {
		fontSize: 10,
		color: '#1976d2',
		fontWeight: '600',
	},
	biobankFooter: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	lastUpdate: {
		fontSize: 12,
		color: '#999',
		flex: 1,
	},
	biobankActions: {
		flexDirection: 'row',
		gap: 8,
	},
	viewButton: {
		backgroundColor: '#e3f2fd',
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 8,
	},
	viewButtonText: {
		color: '#1976d2',
		fontSize: 14,
		fontWeight: '600',
	},
	connectButton: {
		backgroundColor: '#4CAF50',
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 8,
	},
	connectButtonText: {
		color: 'white',
		fontSize: 14,
		fontWeight: '600',
	},
	infoCard: {
		backgroundColor: '#e8f5e8',
		marginHorizontal: 20,
		marginBottom: 20,
		padding: 20,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: '#4CAF50',
	},
	infoTitle: {
		fontSize: 16,
		fontWeight: '700',
		color: '#2e7d32',
		marginBottom: 12,
	},
	infoText: {
		fontSize: 14,
		color: '#2e7d32',
		marginBottom: 6,
		lineHeight: 18,
	},
})
