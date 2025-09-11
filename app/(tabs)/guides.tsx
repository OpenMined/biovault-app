/**
 * Guides tab - help, documentation, and educational content
 */

import React from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Link } from 'expo-router'

export default function GuidesScreen() {
	const openLink = (url: string) => {
		Linking.openURL(url)
	}

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView style={styles.scrollView}>
				<View style={styles.header}>
					<Text style={styles.title}>Guides & Help</Text>
					<Text style={styles.subtitle}>Learn how to use Biovault and understand your results</Text>
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>🚀 Getting Started</Text>

					<View style={styles.guideCard}>
						<Text style={styles.guideTitle}>1. Download Your DNA Data</Text>
						<Text style={styles.guideText}>
							Visit your genetic testing provider and download your raw genetic data. Most providers
							offer this as a ZIP file containing your variant information.
						</Text>
						<TouchableOpacity
							style={styles.linkButton}
							onPress={() => openLink('https://you.23andme.com/tools/data/download/')}
						>
							<Text style={styles.linkText}>23andMe Download →</Text>
						</TouchableOpacity>
					</View>

					<View style={styles.guideCard}>
						<Text style={styles.guideTitle}>2. Upload to Biovault</Text>
						<Text style={styles.guideText}>
							Go to the "My DNA" tab and upload your ZIP file. We'll parse it and store it securely
							on your device - nothing is uploaded to the cloud.
						</Text>
					</View>

					<View style={styles.guideCard}>
						<Text style={styles.guideTitle}>3. View Your Analysis</Text>
						<Text style={styles.guideText}>
							Check your results to see matches between your variants and known clinical
							significance from ClinVar. Results are grouped by gene for easier understanding.
						</Text>
					</View>

					<View style={styles.guideCard}>
						<Text style={styles.guideTitle}>4. Invite Experts (Coming Soon)</Text>
						<Text style={styles.guideText}>
							Use the Network tab to securely invite clinicians and genetic counselors to analyze
							your data locally on your device.
						</Text>
					</View>
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>📖 Understanding Your Results</Text>

					<View style={styles.guideCard}>
						<Text style={styles.guideTitle}>Clinical Significance Explained</Text>

						<View style={styles.tagExamples}>
							<View style={[styles.exampleTag, { backgroundColor: '#f44336' }]}>
								<Text style={styles.exampleTagText}>Pathogenic</Text>
							</View>
							<Text style={styles.tagDescription}>
								Strong evidence this variant causes disease. High confidence finding.
							</Text>
						</View>

						<View style={styles.tagExamples}>
							<View style={[styles.exampleTag, { backgroundColor: '#ff9800' }]}>
								<Text style={styles.exampleTagText}>Likely Pathogenic</Text>
							</View>
							<Text style={styles.tagDescription}>
								Probably causes disease but evidence isn't as strong as "Pathogenic".
							</Text>
						</View>

						<View style={styles.tagExamples}>
							<View style={[styles.exampleTag, { backgroundColor: '#e91e63' }]}>
								<Text style={styles.exampleTagText}>Conflicting</Text>
							</View>
							<Text style={styles.tagDescription}>
								Different studies disagree about this variant's significance.
							</Text>
						</View>

						<View style={styles.tagExamples}>
							<View style={[styles.exampleTag, { backgroundColor: '#9e9e9e' }]}>
								<Text style={styles.exampleTagText}>Uncertain</Text>
							</View>
							<Text style={styles.tagDescription}>
								Unknown clinical significance. Not enough evidence either way.
							</Text>
						</View>

						<View style={styles.tagExamples}>
							<View style={[styles.exampleTag, { backgroundColor: '#4caf50' }]}>
								<Text style={styles.exampleTagText}>Benign</Text>
							</View>
							<Text style={styles.tagDescription}>
								Evidence shows this variant does not cause disease.
							</Text>
						</View>
					</View>

					<View style={styles.guideCard}>
						<Text style={styles.guideTitle}>Multiple Findings</Text>
						<Text style={styles.guideText}>
							It's common to have variants in multiple genes. Research shows about 1 in 10 people
							with positive genetic findings have multiple molecular diagnoses.
						</Text>
						<Text style={styles.guideText}>
							Each gene group shows your variants for that specific gene, along with associated
							conditions and clinical significance.
						</Text>
					</View>

					<View style={styles.guideCard}>
						<Text style={styles.guideTitle}>What the Numbers Mean</Text>
						<Text style={styles.guideText}>
							• <Text style={styles.bold}>Total Variants</Text>: All genetic positions in your file
						</Text>
						<Text style={styles.guideText}>
							• <Text style={styles.bold}>rsIDs</Text>: Variants with standard database identifiers
						</Text>
						<Text style={styles.guideText}>
							• <Text style={styles.bold}>Matches</Text>: Your variants found in ClinVar database
						</Text>
						<Text style={styles.guideText}>
							• <Text style={styles.bold}>Genes</Text>: Number of different genes with findings
						</Text>
					</View>
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>🔒 Privacy & Security</Text>

					<View style={styles.guideCard}>
						<Text style={styles.guideTitle}>Your Data Stays Local</Text>
						<Text style={styles.guideText}>
							All genetic data processing happens on your device. Your DNA information never leaves
							your phone or gets uploaded to servers.
						</Text>
					</View>

					<View style={styles.guideCard}>
						<Text style={styles.guideTitle}>Secure Storage</Text>
						<Text style={styles.guideText}>
							Uploaded files are stored in encrypted SQLite databases locally. You can delete them
							anytime from your device storage.
						</Text>
					</View>

					<View style={styles.guideCard}>
						<Text style={styles.guideTitle}>Expert Collaboration</Text>
						<Text style={styles.guideText}>
							When inviting experts, they connect remotely to analyze data on your computer. No data
							transfer occurs - analysis happens where your data lives.
						</Text>
					</View>
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>⚠️ Important Disclaimers</Text>

					<View style={styles.disclaimerCard}>
						<Text style={styles.disclaimerTitle}>Not Medical Advice</Text>
						<Text style={styles.disclaimerText}>
							This app is for educational and research purposes only. Results should not be used for
							medical decisions. Always consult with a healthcare professional or genetic counselor
							before making health-related decisions.
						</Text>
					</View>

					<View style={styles.disclaimerCard}>
						<Text style={styles.disclaimerTitle}>Data Limitations</Text>
						<Text style={styles.disclaimerText}>
							Consumer genetic tests like 23andMe only test a small subset of your genome. Many
							medically relevant variants are not included in these tests. This analysis is not
							comprehensive.
						</Text>
					</View>

					<View style={styles.disclaimerCard}>
						<Text style={styles.disclaimerTitle}>Research Context</Text>
						<Text style={styles.disclaimerText}>
							ClinVar data comes from research studies and clinical labs. Interpretations can change
							over time as new evidence emerges. Results should be interpreted by qualified
							professionals.
						</Text>
					</View>
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>🔗 Learn More</Text>

					<TouchableOpacity
						style={styles.linkCard}
						onPress={() => openLink('https://www.ncbi.nlm.nih.gov/clinvar/')}
					>
						<Text style={styles.linkTitle}>ClinVar Database</Text>
						<Text style={styles.linkDescription}>
							Learn about the clinical variant database we use for matching
						</Text>
					</TouchableOpacity>

					<TouchableOpacity
						style={styles.linkCard}
						onPress={() => openLink('https://www.genome.gov/genetics-glossary')}
					>
						<Text style={styles.linkTitle}>Genetics Glossary</Text>
						<Text style={styles.linkDescription}>Understand genetic terminology and concepts</Text>
					</TouchableOpacity>

					<TouchableOpacity
						style={styles.linkCard}
						onPress={() => openLink('https://www.nsgc.org/page/find-a-gc')}
					>
						<Text style={styles.linkTitle}>Find a Genetic Counselor</Text>
						<Text style={styles.linkDescription}>
							Connect with certified genetic counselors for professional guidance
						</Text>
					</TouchableOpacity>

					<TouchableOpacity
						style={styles.linkCard}
						onPress={() => openLink('https://biovault.net/')}
					>
						<Text style={styles.linkTitle}>BioVault Network</Text>
						<Text style={styles.linkDescription}>
							Learn about the collaborative genomics platform
						</Text>
					</TouchableOpacity>
				</View>

				<View style={styles.footer}>
					<Text style={styles.footerText}>
						BioVault is open source and built by the OpenMined community
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
	guideCard: {
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
	guideTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#333',
		marginBottom: 8,
	},
	guideText: {
		fontSize: 14,
		color: '#666',
		lineHeight: 20,
		marginBottom: 8,
	},
	bold: {
		fontWeight: '600',
		color: '#333',
	},
	linkButton: {
		backgroundColor: '#e3f2fd',
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 6,
		alignSelf: 'flex-start',
	},
	linkText: {
		fontSize: 14,
		color: '#1976d2',
		fontWeight: '600',
	},
	tagExamples: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 12,
	},
	exampleTag: {
		paddingHorizontal: 8,
		paddingVertical: 2,
		borderRadius: 12,
		marginRight: 12,
		minWidth: 90,
		alignItems: 'center',
	},
	exampleTagText: {
		fontSize: 10,
		fontWeight: '600',
		color: 'white',
	},
	tagDescription: {
		fontSize: 12,
		color: '#666',
		flex: 1,
		lineHeight: 16,
	},
	disclaimerCard: {
		backgroundColor: '#fff3cd',
		marginHorizontal: 20,
		marginVertical: 6,
		padding: 16,
		borderRadius: 12,
		borderLeftWidth: 4,
		borderLeftColor: '#ffc107',
	},
	disclaimerTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#856404',
		marginBottom: 8,
	},
	disclaimerText: {
		fontSize: 14,
		color: '#856404',
		lineHeight: 20,
	},
	linkCard: {
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
	linkTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#1976d2',
		marginBottom: 4,
	},
	linkDescription: {
		fontSize: 14,
		color: '#666',
		lineHeight: 18,
	},
	footer: {
		padding: 20,
		alignItems: 'center',
	},
	footerText: {
		fontSize: 12,
		color: '#999',
		textAlign: 'center',
	},
})
