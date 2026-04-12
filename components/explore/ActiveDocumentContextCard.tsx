import { OMText } from '@/components/ui/OMText'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { Pressable, StyleSheet, View } from 'react-native'

type Props = {
	body: string
	buttonLabel: string
	label: string
	onPress: () => void
	title: string
}

export function ActiveDocumentContextCard({ body, buttonLabel, label, onPress, title }: Props) {
	return (
		<View style={styles.contextCard}>
			<View style={styles.contextText}>
				<OMText variant="subtitle" style={styles.contextLabel}>
					{label}
				</OMText>
				<OMText variant="headline" style={styles.contextTitle}>
					{title}
				</OMText>
				<OMText variant="body" style={styles.contextBody}>
					{body}
				</OMText>
			</View>
			<Pressable onPress={onPress} style={({ pressed }) => [styles.contextButton, pressed ? styles.contextButtonPressed : null]}>
				<OMText variant="subtitle" style={styles.contextButtonText}>
					{buttonLabel}
				</OMText>
			</Pressable>
		</View>
	)
}

const styles = StyleSheet.create({
	contextCard: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.m,
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	contextText: {
		flex: 1,
		gap: omSpacing.xs,
	},
	contextLabel: {
		color: omColors.grayscale500,
		textTransform: 'uppercase',
		letterSpacing: 0.6,
	},
	contextTitle: {
		color: omTheme.primaryText,
	},
	contextBody: {
		color: omColors.grayscale400,
	},
	contextButton: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(82,168,197,0.14)',
		borderWidth: 1,
		borderColor: 'rgba(82,168,197,0.24)',
	},
	contextButtonPressed: {
		opacity: 0.9,
	},
	contextButtonText: {
		color: omColors.teal500,
	},
})
