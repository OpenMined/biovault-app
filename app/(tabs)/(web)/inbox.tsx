/**
 * Inbox - Research submissions and pipeline management (Web only)
 * Based on 'bv inbox' CLI functionality
 */

import React, { useState } from 'react'
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

interface Submission {
	id: string
	project: string
	researcher: string
	status: 'pending' | 'running' | 'completed' | 'failed'
	submittedAt: string
	description: string
	dataTypes: string[]
	estimatedTime: string
	resultPath?: string
}

export default function Inbox() {
	const [submissions] = useState<Submission[]>([
		{
			id: 'sub_001',
			project: 'rare-disease-gwas',
			researcher: 'dr.smith@stanford.edu',
			status: 'completed',
			submittedAt: '2024-01-15T10:30:00Z',
			description: 'GWAS analysis for rare neurological disorders using your VCF data',
			dataTypes: ['VCF', 'Phenotype'],
			estimatedTime: '2 hours',
			resultPath: './rare-disease-gwas/results',
		},
		{
			id: 'sub_002',
			project: 'pharmacogenomics-study',
			researcher: 'lab@pharmagenetics.com',
			status: 'pending',
			submittedAt: '2024-01-16T09:15:00Z',
			description: 'Drug response prediction analysis using 23andMe data',
			dataTypes: ['23andMe', 'Clinical'],
			estimatedTime: '45 minutes',
		},
		{
			id: 'sub_003',
			project: 'alzheimers-risk-analysis',
			researcher: 'neuro@broadinstitute.org',
			status: 'running',
			submittedAt: '2024-01-16T14:20:00Z',
			description: "Alzheimer's disease risk assessment using whole genome data",
			dataTypes: ['WGS', 'Phenotype'],
			estimatedTime: '3 hours',
		},
	])

	const handleAcceptSubmission = (submissionId: string) => {
		Alert.alert(
			'Accept Research Submission',
			'This will run the NextFlow pipeline on your computer. Your data stays local and only results are shared.',
			[
				{ text: 'Cancel', style: 'cancel' },
				{ text: 'Accept & Run', onPress: () => console.log(`Accepting ${submissionId}`) },
			]
		)
	}

	const handleDeclineSubmission = (submissionId: string) => {
		Alert.alert('Decline Submission', 'Are you sure you want to decline this research request?', [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Decline',
				style: 'destructive',
				onPress: () => console.log(`Declining ${submissionId}`),
			},
		])
	}

	const handleViewResults = (submission: Submission) => {
		Alert.alert('View Results', `Results are available at: ${submission.resultPath}`, [
			{ text: 'OK' },
			{ text: 'Open Folder', onPress: () => console.log('Opening results folder') },
		])
	}

	const getStatusColor = (status: string) => {
		switch (status) {
			case 'pending':
				return '#ffc107'
			case 'running':
				return '#2196f3'
			case 'completed':
				return '#4caf50'
			case 'failed':
				return '#f44336'
			default:
				return '#999'
		}
	}

	const renderSubmission = (submission: Submission) => (
		<View key={submission.id} style={styles.submissionCard}>
			<View style={styles.submissionHeader}>
				<Text style={styles.projectName}>{submission.project}</Text>
				<View style={[styles.statusBadge, { backgroundColor: getStatusColor(submission.status) }]}>
					<Text style={styles.statusText}>{submission.status.toUpperCase()}</Text>
				</View>
			</View>

			<Text style={styles.researcherName}>👨‍🔬 {submission.researcher}</Text>
			<Text style={styles.submissionDescription}>{submission.description}</Text>

			<View style={styles.dataTypesContainer}>
				{submission.dataTypes.map((type, index) => (
					<View key={index} style={styles.dataTypeChip}>
						<Text style={styles.dataTypeText}>{type}</Text>
					</View>
				))}
			</View>

			<View style={styles.submissionFooter}>
				<Text style={styles.submissionTime}>
					⏱️ {submission.estimatedTime} • {new Date(submission.submittedAt).toLocaleDateString()}
				</Text>

				<View style={styles.submissionActions}>
					{submission.status === 'pending' && (
						<>
							<TouchableOpacity
								style={styles.acceptButton}
								onPress={() => handleAcceptSubmission(submission.id)}
							>
								<Text style={styles.acceptButtonText}>Accept</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={styles.declineButton}
								onPress={() => handleDeclineSubmission(submission.id)}
							>
								<Text style={styles.declineButtonText}>Decline</Text>
							</TouchableOpacity>
						</>
					)}
					{submission.status === 'completed' && submission.resultPath && (
						<TouchableOpacity
							style={styles.viewResultsButton}
							onPress={() => handleViewResults(submission)}
						>
							<Text style={styles.viewResultsButtonText}>View Results</Text>
						</TouchableOpacity>
					)}
					{submission.status === 'running' && (
						<Text style={styles.runningText}>🔄 Processing...</Text>
					)}
				</View>
			</View>
		</View>
	)

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView style={styles.scrollView}>
				<View style={styles.header}>
					<Text style={styles.title}>Research Inbox</Text>
					<Text style={styles.subtitle}>
						Manage incoming research submissions and NextFlow pipeline requests
					</Text>
				</View>

				<View style={styles.summaryCard}>
					<Text style={styles.summaryTitle}>📊 Submission Summary</Text>
					<View style={styles.summaryGrid}>
						<View style={styles.summaryItem}>
							<Text style={styles.summaryNumber}>
								{submissions.filter((s) => s.status === 'pending').length}
							</Text>
							<Text style={styles.summaryLabel}>Pending</Text>
						</View>
						<View style={styles.summaryItem}>
							<Text style={styles.summaryNumber}>
								{submissions.filter((s) => s.status === 'running').length}
							</Text>
							<Text style={styles.summaryLabel}>Running</Text>
						</View>
						<View style={styles.summaryItem}>
							<Text style={styles.summaryNumber}>
								{submissions.filter((s) => s.status === 'completed').length}
							</Text>
							<Text style={styles.summaryLabel}>Completed</Text>
						</View>
					</View>
				</View>

				<View style={styles.submissionsSection}>
					<Text style={styles.sectionTitle}>Recent Submissions</Text>
					{submissions.map(renderSubmission)}
				</View>

				<View style={styles.infoCard}>
					<Text style={styles.infoTitle}>💡 How Research Submissions Work</Text>
					<Text style={styles.infoText}>
						• Researchers submit NextFlow pipelines to analyze your data
					</Text>
					<Text style={styles.infoText}>
						• You review and approve each submission before it runs
					</Text>
					<Text style={styles.infoText}>• Pipelines execute locally on your computer</Text>
					<Text style={styles.infoText}>• Only analysis results are shared, never raw data</Text>
					<Text style={styles.infoText}>
						• You maintain full control over your genetic information
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
	summaryCard: {
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
	summaryTitle: {
		fontSize: 18,
		fontWeight: '700',
		color: '#333',
		marginBottom: 16,
	},
	summaryGrid: {
		flexDirection: 'row',
		justifyContent: 'space-around',
	},
	summaryItem: {
		alignItems: 'center',
	},
	summaryNumber: {
		fontSize: 24,
		fontWeight: '700',
		color: '#4CAF50',
		marginBottom: 4,
	},
	summaryLabel: {
		fontSize: 12,
		color: '#666',
	},
	submissionsSection: {
		marginHorizontal: 20,
		marginBottom: 20,
	},
	sectionTitle: {
		fontSize: 20,
		fontWeight: '700',
		color: '#333',
		marginBottom: 16,
	},
	submissionCard: {
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
	submissionHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 12,
	},
	projectName: {
		fontSize: 18,
		fontWeight: '700',
		color: '#333',
		flex: 1,
	},
	statusBadge: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 16,
	},
	statusText: {
		fontSize: 12,
		fontWeight: '700',
		color: 'white',
	},
	researcherName: {
		fontSize: 16,
		color: '#666',
		marginBottom: 8,
	},
	submissionDescription: {
		fontSize: 14,
		color: '#333',
		marginBottom: 16,
		lineHeight: 20,
	},
	dataTypesContainer: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		marginBottom: 16,
		gap: 8,
	},
	dataTypeChip: {
		backgroundColor: '#e3f2fd',
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 12,
	},
	dataTypeText: {
		fontSize: 12,
		color: '#1976d2',
		fontWeight: '600',
	},
	submissionFooter: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	submissionTime: {
		fontSize: 14,
		color: '#999',
		flex: 1,
	},
	submissionActions: {
		flexDirection: 'row',
		gap: 8,
	},
	acceptButton: {
		backgroundColor: '#4CAF50',
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 8,
	},
	acceptButtonText: {
		color: 'white',
		fontSize: 14,
		fontWeight: '600',
	},
	declineButton: {
		backgroundColor: '#f44336',
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 8,
	},
	declineButtonText: {
		color: 'white',
		fontSize: 14,
		fontWeight: '600',
	},
	viewResultsButton: {
		backgroundColor: '#2196f3',
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 8,
	},
	viewResultsButtonText: {
		color: 'white',
		fontSize: 14,
		fontWeight: '600',
	},
	runningText: {
		fontSize: 14,
		color: '#2196f3',
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
