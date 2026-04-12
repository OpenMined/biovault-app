import { OMCard } from '@/components/ui/OMCard'
import { OMText } from '@/components/ui/OMText'
import { omRadius, omSpacing, omSurfaces, omTheme } from '@/styles/brand'
// import { MeshGradientView } from 'expo-mesh-gradient'
import { StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function TestGradientScreen() {
	return (
		<View style={styles.screen}>
			{/*
			<MeshGradientView
				style={styles.screenMesh}
				ignoresSafeArea
				columns={3}
				rows={3}
				colors={[
					omGradients.orangeRed[0],
					omGradients.redViolet[0],
					omGradients.violetBlue[0],
					omGradients.goldOrange[0],
					'#f4f3f6',
					omGradients.tealGreen[0],
					omGradients.goldOrange[1],
					omGradients.greenLime[0],
					omGradients.limeYellow[1],
				]}
				points={[
					[0, 0],
					[0.5, 0.02],
					[1, 0],
					[0.04, 0.5],
					[0.52, 0.48],
					[0.96, 0.46],
					[0, 1],
					[0.5, 0.98],
					[1, 1],
				]}
			/>
			*/}
			<View style={styles.screenOverlay} />

			<SafeAreaView style={styles.safeArea}>
				<View style={styles.content}>
					<OMCard style={styles.heroCard}>
						<OMText variant="subtitle" tone="accent">
							TEST GRADIENT
						</OMText>
						<OMText variant="h3" style={styles.title}>
							Previous onboarding background
						</OMText>
						<OMText variant="body" style={styles.body}>
							This preserves the earlier OM gradient-family mesh version before the anchor-color switch.
						</OMText>
					</OMCard>

					<OMCard style={styles.noteCard}>
						<OMText variant="headline">Palette</OMText>
						<OMText variant="body" style={styles.body}>
							`orangeRed`, `redViolet`, `violetBlue`, `goldOrange`, `tealGreen`, `greenLime`,
							`limeYellow`, with a pale OM neutral center.
						</OMText>
					</OMCard>
				</View>
			</SafeAreaView>
		</View>
	)
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: omTheme.background,
	},
	screenMesh: {
		position: 'absolute',
		top: -48,
		right: -48,
		bottom: -48,
		left: -48,
		opacity: 0.9,
	},
	screenOverlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: 'rgba(252,252,253,0.18)',
	},
	safeArea: {
		flex: 1,
	},
	content: {
		flex: 1,
		justifyContent: 'center',
		padding: omSpacing.xl,
		gap: omSpacing.l,
	},
	heroCard: {
		padding: omSpacing.xl,
		borderRadius: omRadius.xl,
		backgroundColor: omSurfaces.glassStrong,
		borderColor: omSurfaces.glassBorder,
	},
	noteCard: {
		padding: omSpacing.l,
		backgroundColor: omSurfaces.glass,
		borderColor: omSurfaces.glassBorder,
	},
	title: {
		marginTop: omSpacing.s,
		color: omTheme.textHeadline,
	},
	body: {
		marginTop: omSpacing.s,
		color: omTheme.textBody,
	},
})
