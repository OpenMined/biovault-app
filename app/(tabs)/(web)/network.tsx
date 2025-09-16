/**
 * Network - BioVault network participants and collaboration (Web only)
 * Based on SyftBox network functionality and participant discovery
 */

import React, { useState } from 'react'
import {
	Alert,
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

interface NetworkParticipant {
	id: string
	email: string
	location: string
	dataTypes: string[]
	lastSeen: string
	isOnline: boolean
	researchAreas: string[]
	publicKey: string
	variantCount?: number
}

export default function Network() {
	const [searchQuery, setSearchQuery] = useState('')
	const [selectedFilter, setSelectedFilter] = useState<string>('all')

	const participants: NetworkParticipant[] = [
		{
			id: 'participant_001',
			email: 'research@stanford.edu',
			location: 'Stanford, CA',
			dataTypes: ['VCF', 'Phenotype', 'GWAS'],
			lastSeen: '2 hours ago',
			isOnline: true,
			researchAreas: ['Rare Diseases', 'Neurogenetics'],
			publicKey: 'syft://research@stanford.edu#genomics',
			variantCount: 4200000,
		},
		{
			id: 'participant_002',
			email: 'genomics@broadinstitute.org',
			location: 'Boston, MA',
			dataTypes: ['23andMe', 'AncestryDNA', 'Exome'],
			lastSeen: '5 minutes ago',
			isOnline: true,
			researchAreas: ['Population Genetics', 'Complex Traits'],
			publicKey: 'syft://genomics@broadinstitute.org#population',
			variantCount: 650000,
		},
		{
			id: 'participant_003',
			email: 'patient@raredisease.org',
			location: 'London, UK',
			dataTypes: ['WGS', 'Clinical', 'Phenotype'],
			lastSeen: '1 day ago',
			isOnline: false,
			researchAreas: ['Rare Diseases', 'Undiagnosed'],
			publicKey: 'syft://patient@raredisease.org#clinical',
			variantCount: 5100000,
		},
		{
			id: 'participant_004',
			email: 'lab@pharmgenetics.com',
			location: 'Basel, Switzerland',
			dataTypes: ['Pharmacogenomics', '23andMe', 'Clinical'],
			lastSeen: '30 minutes ago',
			isOnline: true,
			researchAreas: ['Drug Response', 'Precision Medicine'],
			publicKey: 'syft://lab@pharmgenetics.com#pharma',
			variantCount: 890000,
		},
	]

	const filters = [
		{ id: 'all', name: 'All Participants' },
		{ id: 'online', name: 'Online Now' },
		{ id: 'researchers', name: 'Researchers' },
		{ id: 'patients', name: 'Patients' },
	]

	const filteredParticipants = participants.filter((p) => {
		const matchesSearch =
			searchQuery === '' ||
			p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
			p.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
			p.researchAreas.some((area) => area.toLowerCase().includes(searchQuery.toLowerCase()))

		const matchesFilter =
			selectedFilter === 'all' ||
			(selectedFilter === 'online' && p.isOnline) ||
			(selectedFilter === 'researchers' && p.email.includes('edu')) ||
			p.email.includes('org') ||
			(selectedFilter === 'patients' && p.email.includes('patient'))

		return matchesSearch && matchesFilter
	})

	const handleConnectToParticipant = (participant: NetworkParticipant) => {
		Alert.alert('Connect to Participant', `Send collaboration request to ${participant.email}?`, [
			{ text: 'Cancel', style: 'cancel' },
			{ text: 'Send Request', onPress: () => console.log(`Connecting to ${participant.id}`) },
		])
	}

	const handleViewProfile = (participant: NetworkParticipant) => {
		Alert.alert(
			'Participant Profile',
			`Email: ${participant.email}\nLocation: ${
				participant.location
			}\nResearch Areas: ${participant.researchAreas.join(', ')}\nPublic Key: ${
				participant.publicKey
			}`,
			[{ text: 'OK' }]
		)
	}

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView style={styles.scrollView}>
				<View style={styles.header}>
					<Text style={styles.title}>Network Participants</Text>
					<Text style={styles.subtitle}>
						Discover and collaborate with researchers and participants on the BioVault network
					</Text>
				</View>

				<View style={styles.searchCard}>
					<TextInput
						style={styles.searchInput}
						placeholder="Search participants, locations, or research areas..."
						value={searchQuery}
						onChangeText={setSearchQuery}
						clearButtonMode="while-editing"
					/>

					<View style={styles.filtersContainer}>
						{filters.map((filter) => (
							<TouchableOpacity
								key={filter.id}
								style={[styles.filterChip, selectedFilter === filter.id && styles.filterChipActive]}
								onPress={() => setSelectedFilter(filter.id)}
							>
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

				<View style={styles.participantsSection}>
					<Text style={styles.sectionTitle}>
						Available Participants ({filteredParticipants.length})
					</Text>

					{filteredParticipants.map((participant) => (
						<View key={participant.id} style={styles.participantCard}>
							<View style={styles.participantHeader}>
								<View style={styles.participantInfo}>
									<View style={styles.participantEmailRow}>
										<Text style={styles.participantEmail}>{participant.email}</Text>
										<View
											style={[
												styles.onlineIndicator,
												{ backgroundColor: participant.isOnline ? '#4CAF50' : '#999' },
											]}
										/>
									</View>
									<Text style={styles.participantLocation}>📍 {participant.location}</Text>
									<Text style={styles.lastSeen}>Last seen: {participant.lastSeen}</Text>
								</View>
							</View>

							<View style={styles.researchAreasContainer}>
								<Text style={styles.researchAreasLabel}>Research Areas:</Text>
								{participant.researchAreas.map((area, index) => (
									<View key={index} style={styles.researchAreaChip}>
										<Text style={styles.researchAreaText}>{area}</Text>
									</View>
								))}
							</View>

							<View style={styles.dataTypesContainer}>
								<Text style={styles.dataTypesLabel}>Data Types:</Text>
								{participant.dataTypes.map((type, index) => (
									<View key={index} style={styles.dataTypeChip}>
										<Text style={styles.dataTypeText}>{type}</Text>
									</View>
								))}
							</View>

							{participant.variantCount && (
								<Text style={styles.variantCount}>
									🧬 {participant.variantCount.toLocaleString()} variants available
								</Text>
							)}

							<View style={styles.participantFooter}>
								<Text style={styles.publicKey}>Key: {participant.publicKey}</Text>
								<View style={styles.participantActions}>
									<TouchableOpacity
										style={styles.viewProfileButton}
										onPress={() => handleViewProfile(participant)}
									>
										<Text style={styles.viewProfileButtonText}>View Profile</Text>
									</TouchableOpacity>
									<TouchableOpacity
										style={styles.connectButton}
										onPress={() => handleConnectToParticipant(participant)}
									>
										<Text style={styles.connectButtonText}>Connect</Text>
									</TouchableOpacity>
								</View>
							</View>
						</View>
					))}
				</View>

				<View style={styles.infoCard}>
					<Text style={styles.infoTitle}>🌐 About the BioVault Network</Text>
					<Text style={styles.infoText}>
						• Participants publish variants to relay servers with public keys
					</Text>
					<Text style={styles.infoText}>• End-to-end encrypted communication via SyftBox</Text>
					<Text style={styles.infoText}>• No open ports needed - works behind firewalls</Text>
					<Text style={styles.infoText}>• Data stays on participants' devices</Text>
					<Text style={styles.infoText}>• Collaborate without requiring data uploads</Text>
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
	searchCard: {
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
	searchInput: {
		height: 44,
		borderWidth: 1,
		borderColor: '#e0e0e0',
		borderRadius: 12,
		paddingHorizontal: 16,
		fontSize: 16,
		backgroundColor: '#f8f9fa',
		marginBottom: 16,
	},
	filtersContainer: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
	},
	filterChip: {
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
	filterText: {
		fontSize: 14,
		color: '#666',
		fontWeight: '500',
	},
	filterTextActive: {
		color: 'white',
		fontWeight: '600',
	},
	participantsSection: {
		marginHorizontal: 20,
		marginBottom: 20,
	},
	sectionTitle: {
		fontSize: 20,
		fontWeight: '700',
		color: '#333',
		marginBottom: 16,
	},
	participantCard: {
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
	participantHeader: {
		marginBottom: 16,
	},
	participantInfo: {
		flex: 1,
	},
	participantEmailRow: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 4,
	},
	participantEmail: {
		fontSize: 18,
		fontWeight: '700',
		color: '#333',
		flex: 1,
	},
	onlineIndicator: {
		width: 10,
		height: 10,
		borderRadius: 5,
		marginLeft: 8,
	},
	participantLocation: {
		fontSize: 14,
		color: '#666',
		marginBottom: 4,
	},
	lastSeen: {
		fontSize: 12,
		color: '#999',
	},
	researchAreasContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		flexWrap: 'wrap',
		marginBottom: 12,
		gap: 8,
	},
	researchAreasLabel: {
		fontSize: 12,
		color: '#666',
		fontWeight: '600',
		marginRight: 4,
	},
	researchAreaChip: {
		backgroundColor: '#fff3cd',
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 12,
	},
	researchAreaText: {
		fontSize: 10,
		color: '#856404',
		fontWeight: '600',
	},
	dataTypesContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		flexWrap: 'wrap',
		marginBottom: 12,
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
	variantCount: {
		fontSize: 14,
		color: '#4CAF50',
		fontWeight: '600',
		marginBottom: 16,
	},
	participantFooter: {
		borderTopWidth: 1,
		borderTopColor: '#f0f0f0',
		paddingTop: 16,
	},
	publicKey: {
		fontSize: 12,
		color: '#999',
		fontFamily: 'monospace',
		marginBottom: 12,
	},
	participantActions: {
		flexDirection: 'row',
		gap: 8,
	},
	viewProfileButton: {
		backgroundColor: '#e3f2fd',
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 8,
		flex: 1,
		alignItems: 'center',
	},
	viewProfileButtonText: {
		color: '#1976d2',
		fontSize: 14,
		fontWeight: '600',
	},
	connectButton: {
		backgroundColor: '#4CAF50',
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 8,
		flex: 1,
		alignItems: 'center',
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
