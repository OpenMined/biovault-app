/**
 * Pipelines - NextFlow pipeline management and execution (Web only)
 * Based on BioVault CLI pipeline functionality
 */

import React, { useState } from 'react'
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

interface Pipeline {
	id: string
	name: string
	description: string
	author: string
	version: string
	dataTypes: string[]
	estimatedTime: string
	complexity: 'simple' | 'moderate' | 'complex'
	category: 'analysis' | 'qc' | 'annotation' | 'research'
}

export default function Pipelines() {
	const [selectedCategory, setSelectedCategory] = useState<string>('all')

	const pipelines: Pipeline[] = [
		{
			id: 'gwas-basic',
			name: 'Basic GWAS Analysis',
			description: 'Genome-wide association study for common variants',
			author: 'BioVault Team',
			version: '1.2.0',
			dataTypes: ['VCF', 'Phenotype'],
			estimatedTime: '30-60 minutes',
			complexity: 'simple',
			category: 'analysis',
		},
		{
			id: 'pharmacogenomics',
			name: 'Pharmacogenomics Panel',
			description: 'Drug response prediction based on genetic variants',
			author: 'PharmGKB Consortium',
			version: '2.1.0',
			dataTypes: ['23andMe', 'AncestryDNA', 'VCF'],
			estimatedTime: '15-30 minutes',
			complexity: 'simple',
			category: 'analysis',
		},
		{
			id: 'quality-control',
			name: 'Genetic Data QC',
			description: 'Quality control and validation of genetic datasets',
			author: 'QC-Tools',
			version: '1.0.3',
			dataTypes: ['VCF', 'FASTQ', 'BAM'],
			estimatedTime: '45-90 minutes',
			complexity: 'moderate',
			category: 'qc',
		},
		{
			id: 'rare-variants',
			name: 'Rare Variant Analysis',
			description: 'Identification and annotation of rare genetic variants',
			author: 'Rare Disease Foundation',
			version: '1.5.2',
			dataTypes: ['WGS', 'Exome', 'VCF'],
			estimatedTime: '2-4 hours',
			complexity: 'complex',
			category: 'research',
		},
		{
			id: 'ancestry-deep',
			name: 'Deep Ancestry Analysis',
			description: 'Comprehensive ancestry and population genetics analysis',
			author: 'Population Genomics Lab',
			version: '3.0.1',
			dataTypes: ['VCF', '23andMe', 'AncestryDNA'],
			estimatedTime: '1-2 hours',
			complexity: 'moderate',
			category: 'analysis',
		},
	]

	const categories = [
		{ id: 'all', name: 'All Pipelines', icon: '📋' },
		{ id: 'analysis', name: 'Analysis', icon: '🔬' },
		{ id: 'qc', name: 'Quality Control', icon: '✅' },
		{ id: 'annotation', name: 'Annotation', icon: '📝' },
		{ id: 'research', name: 'Research', icon: '🧬' },
	]

	const filteredPipelines =
		selectedCategory === 'all'
			? pipelines
			: pipelines.filter((p) => p.category === selectedCategory)

	const getComplexityColor = (complexity: string) => {
		switch (complexity) {
			case 'simple':
				return '#4CAF50'
			case 'moderate':
				return '#FF9800'
			case 'complex':
				return '#F44336'
			default:
				return '#999'
		}
	}

	const handleRunPipeline = (pipeline: Pipeline) => {
		Alert.alert(
			'Run Pipeline',
			`Execute "${pipeline.name}" on your genetic data? This will run locally on your computer.`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{ text: 'Run Pipeline', onPress: () => console.log(`Running ${pipeline.id}`) },
			]
		)
	}

	const handleViewPipeline = (pipeline: Pipeline) => {
		Alert.alert(
			pipeline.name,
			`${pipeline.description}\n\nAuthor: ${pipeline.author}\nVersion: ${pipeline.version}\nEstimated Time: ${pipeline.estimatedTime}`,
			[{ text: 'OK' }]
		)
	}

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView style={styles.scrollView}>
				<View style={styles.header}>
					<Text style={styles.title}>NextFlow Pipelines</Text>
					<Text style={styles.subtitle}>
						Discover and run genomic analysis pipelines on your data
					</Text>
				</View>

				<View style={styles.categoriesCard}>
					<Text style={styles.categoriesTitle}>Categories</Text>
					<View style={styles.categoriesGrid}>
						{categories.map((category) => (
							<TouchableOpacity
								key={category.id}
								style={[
									styles.categoryChip,
									selectedCategory === category.id && styles.categoryChipActive,
								]}
								onPress={() => setSelectedCategory(category.id)}
							>
								<Text style={styles.categoryIcon}>{category.icon}</Text>
								<Text
									style={[
										styles.categoryText,
										selectedCategory === category.id && styles.categoryTextActive,
									]}
								>
									{category.name}
								</Text>
							</TouchableOpacity>
						))}
					</View>
				</View>

				<View style={styles.pipelinesSection}>
					<Text style={styles.sectionTitle}>Available Pipelines ({filteredPipelines.length})</Text>

					{filteredPipelines.map((pipeline) => (
						<View key={pipeline.id} style={styles.pipelineCard}>
							<View style={styles.pipelineHeader}>
								<View style={styles.pipelineInfo}>
									<Text style={styles.pipelineName}>{pipeline.name}</Text>
									<Text style={styles.pipelineAuthor}>by {pipeline.author}</Text>
								</View>
								<View style={styles.pipelineMeta}>
									<Text style={styles.pipelineVersion}>v{pipeline.version}</Text>
									<View
										style={[
											styles.complexityBadge,
											{ backgroundColor: getComplexityColor(pipeline.complexity) },
										]}
									>
										<Text style={styles.complexityText}>{pipeline.complexity}</Text>
									</View>
								</View>
							</View>

							<Text style={styles.pipelineDescription}>{pipeline.description}</Text>

							<View style={styles.dataTypesContainer}>
								<Text style={styles.dataTypesLabel}>Data Types:</Text>
								{pipeline.dataTypes.map((type, index) => (
									<View key={index} style={styles.dataTypeChip}>
										<Text style={styles.dataTypeText}>{type}</Text>
									</View>
								))}
							</View>

							<View style={styles.pipelineFooter}>
								<Text style={styles.estimatedTime}>⏱️ {pipeline.estimatedTime}</Text>
								<View style={styles.pipelineActions}>
									<TouchableOpacity
										style={styles.viewButton}
										onPress={() => handleViewPipeline(pipeline)}
									>
										<Text style={styles.viewButtonText}>View Details</Text>
									</TouchableOpacity>
									<TouchableOpacity
										style={styles.runButton}
										onPress={() => handleRunPipeline(pipeline)}
									>
										<Text style={styles.runButtonText}>Run Pipeline</Text>
									</TouchableOpacity>
								</View>
							</View>
						</View>
					))}
				</View>

				<View style={styles.infoCard}>
					<Text style={styles.infoTitle}>🔧 About NextFlow Pipelines</Text>
					<Text style={styles.infoText}>
						• Pipelines are containerized workflows that run on your computer
					</Text>
					<Text style={styles.infoText}>• Your genetic data never leaves your device</Text>
					<Text style={styles.infoText}>
						• Results can be shared with researchers while keeping data private
					</Text>
					<Text style={styles.infoText}>• All pipelines are open-source and peer-reviewed</Text>
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
	categoriesCard: {
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
	categoriesTitle: {
		fontSize: 18,
		fontWeight: '700',
		color: '#333',
		marginBottom: 16,
	},
	categoriesGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
	},
	categoryChip: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: '#f8f9fa',
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 20,
		borderWidth: 1,
		borderColor: '#e0e0e0',
	},
	categoryChipActive: {
		backgroundColor: '#4CAF50',
		borderColor: '#4CAF50',
	},
	categoryIcon: {
		fontSize: 14,
		marginRight: 6,
	},
	categoryText: {
		fontSize: 14,
		color: '#666',
		fontWeight: '500',
	},
	categoryTextActive: {
		color: 'white',
		fontWeight: '600',
	},
	pipelinesSection: {
		marginHorizontal: 20,
		marginBottom: 20,
	},
	sectionTitle: {
		fontSize: 20,
		fontWeight: '700',
		color: '#333',
		marginBottom: 16,
	},
	pipelineCard: {
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
	pipelineHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
		marginBottom: 12,
	},
	pipelineInfo: {
		flex: 1,
	},
	pipelineName: {
		fontSize: 18,
		fontWeight: '700',
		color: '#333',
		marginBottom: 4,
	},
	pipelineAuthor: {
		fontSize: 14,
		color: '#666',
	},
	pipelineMeta: {
		alignItems: 'flex-end',
	},
	pipelineVersion: {
		fontSize: 12,
		color: '#999',
		marginBottom: 6,
	},
	complexityBadge: {
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 12,
	},
	complexityText: {
		fontSize: 10,
		fontWeight: '700',
		color: 'white',
	},
	pipelineDescription: {
		fontSize: 14,
		color: '#333',
		marginBottom: 16,
		lineHeight: 20,
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
	pipelineFooter: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	estimatedTime: {
		fontSize: 14,
		color: '#666',
		flex: 1,
	},
	pipelineActions: {
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
	runButton: {
		backgroundColor: '#4CAF50',
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 8,
	},
	runButtonText: {
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
