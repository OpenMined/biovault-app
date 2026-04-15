import { OMText } from '@/components/ui/OMText'
import { omColors, omSpacing, omTheme } from '@/styles/brand'
import { FilePicker, type PickResult } from '@/widgets/FilePicker'
import { router } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// ts-prune-ignore-next
export default function FilePickerScreen() {
	const [confirmed, setConfirmed] = useState<PickResult | null>(null)

	return (
		<SafeAreaView style={styles.safeArea} edges={['top']}>
			<ScrollView contentContainerStyle={styles.content}>
				<View style={styles.header}>
					<Pressable onPress={() => router.back()}>
						<OMText variant="subtitle" style={styles.back}>
							← Back
						</OMText>
					</Pressable>
					<OMText variant="h3" style={styles.title}>
						Add a genomic file
					</OMText>
					<OMText variant="body" style={styles.body}>
						We run heuristics on a small sample of the file to identify it before you commit to storing or linking it.
					</OMText>
				</View>

				<FilePicker onConfirm={setConfirmed} />

				{confirmed ? (
					<View style={styles.confirmed} testID="file-picker-confirmed">
						<OMText variant="headline" style={styles.confirmedTitle}>
							Saved ✓
						</OMText>
						<OMText variant="body" style={styles.body}>
							{confirmed.primary.kind === 'handle' || confirmed.primary.kind === 'path'
								? 'File will be referenced in place.'
								: 'A copy will be kept in app storage.'}
						</OMText>
					</View>
				) : null}
			</ScrollView>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: omColors.grayscale850 },
	content: { padding: omSpacing.xl, gap: omSpacing.xl, paddingBottom: omSpacing.xxxl },
	header: { gap: omSpacing.s },
	back: { color: omTheme.accent },
	title: { color: omTheme.primaryText },
	body: { color: omColors.grayscale300 },
	confirmed: {
		padding: omSpacing.l,
		gap: omSpacing.s,
		borderRadius: 16,
		backgroundColor: 'rgba(83,190,169,0.1)',
		borderWidth: 1,
		borderColor: 'rgba(83,190,169,0.3)',
	},
	confirmedTitle: { color: omTheme.accent },
})
