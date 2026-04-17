import { OMText } from '@/components/ui/OMText'
import { LAB_SAMPLE_PRESETS } from '@/lib/lab/sample-data'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { Link } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function ExamplesScreen() {
	return (
		<SafeAreaView style={styles.safeArea} edges={['top']}>
			<ScrollView contentContainerStyle={styles.content}>
				<View style={styles.hero}>
					<OMText variant="h3" style={styles.title}>
						Try example assays
					</OMText>
					<OMText variant="body" style={styles.body}>
						Open a ready-made example and load its assay plus test files directly into the lab from GitHub or built-in sample data.
					</OMText>
				</View>

				<View style={styles.grid}>
					{LAB_SAMPLE_PRESETS.map((preset) => (
						<View key={preset.id} style={styles.card}>
							<OMText variant="caption" style={styles.kicker}>
								{preset.inputKindLabel}
							</OMText>
							<OMText variant="headline" style={styles.cardTitle}>
								{preset.title}
							</OMText>
							<OMText variant="body" style={styles.cardBody}>
								{preset.description}
							</OMText>
							<OMText variant="caption" style={styles.meta}>
								Genome: {preset.genomeLabel}
							</OMText>
							<OMText variant="caption" style={styles.meta}>
								Assay: {preset.assayLabel}
							</OMText>
							<Link href={{ pathname: '/', params: { example: preset.id } }} asChild>
								<Pressable style={styles.button}>
									<OMText variant="subtitle" style={styles.buttonText}>
										Open in lab
									</OMText>
								</Pressable>
							</Link>
						</View>
					))}
				</View>
			</ScrollView>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: omColors.grayscale850,
	},
	content: {
		padding: omSpacing.xl,
		paddingBottom: omSpacing.xxxl,
		gap: omSpacing.xl,
		maxWidth: 960,
		width: '100%',
		alignSelf: 'center',
	},
	hero: {
		gap: omSpacing.m,
		paddingTop: omSpacing.m,
	},
	title: {
		color: omTheme.primaryText,
	},
	body: {
		color: omColors.grayscale300,
		maxWidth: 680,
	},
	grid: {
		gap: omSpacing.m,
	},
	card: {
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		gap: omSpacing.s,
	},
	kicker: {
		color: omTheme.accent,
		letterSpacing: 0.8,
	},
	cardTitle: {
		color: omTheme.primaryText,
	},
	cardBody: {
		color: omColors.grayscale300,
	},
	meta: {
		color: omColors.grayscale500,
	},
	button: {
		alignSelf: 'flex-start',
		marginTop: omSpacing.s,
		paddingHorizontal: omSpacing.l,
		paddingVertical: omSpacing.m,
		borderRadius: omRadius.full,
		backgroundColor: omTheme.accent,
	},
	buttonText: {
		color: omColors.grayscale850,
	},
})
