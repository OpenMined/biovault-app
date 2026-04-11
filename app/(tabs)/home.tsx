import { OMText } from '@/components/ui/OMText'
import { bioVaultGradientAnchors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { MeshGradientView } from 'expo-mesh-gradient'
import { StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// ts-prune-ignore-next
export default function HomeScreen() {
	return (
		<View style={styles.screen}>
			<MeshGradientView
				style={styles.screenMesh}
				ignoresSafeArea
				columns={3}
				rows={3}
				colors={[
					bioVaultGradientAnchors.warmWhite,
					bioVaultGradientAnchors.softTeal,
					bioVaultGradientAnchors.fog,
					bioVaultGradientAnchors.warmWhite,
					bioVaultGradientAnchors.teal,
					bioVaultGradientAnchors.softGreen,
					bioVaultGradientAnchors.mist,
					bioVaultGradientAnchors.green,
					bioVaultGradientAnchors.lime,
				]}
				points={[
					[0, 0],
					[0.5, 0.04],
					[1, 0],
					[0.02, 0.52],
					[0.48, 0.44],
					[0.98, 0.5],
					[0, 1],
					[0.5, 0.98],
					[1, 1],
				]}
			/>
			<View style={styles.overlay} />

			<SafeAreaView style={styles.safeArea}>
				<View style={styles.content}>
					<View style={styles.hero}>
						<OMText variant="caption" style={styles.eyebrow}>
							HOME
						</OMText>
						<OMText variant="h3" style={styles.title}>
							BioVault Home
						</OMText>
						<OMText variant="body" style={styles.body}>
							This tab is the placeholder for the new redesign direction using the OpenMined brand
							system.
						</OMText>
					</View>

					<View style={styles.panel}>
						<OMText variant="headline" style={styles.panelTitle}>
							Coming next
						</OMText>
						<OMText variant="body" style={styles.panelBody}>
							New home surfaces, refreshed content hierarchy, and the next round of BioVault product
							polish will land here.
						</OMText>
					</View>
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
		opacity: 0.96,
	},
	overlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: 'rgba(252,252,253,0.2)',
	},
	safeArea: {
		flex: 1,
	},
	content: {
		flex: 1,
		padding: omSpacing.xl,
		justifyContent: 'center',
		gap: omSpacing.xl,
	},
	hero: {
		gap: omSpacing.m,
	},
	eyebrow: {
		alignSelf: 'flex-start',
		paddingHorizontal: omSpacing.s,
		paddingVertical: omSpacing.xs,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(252,252,253,0.32)',
		color: omTheme.textMuted,
		letterSpacing: 1,
	},
	title: {
		color: omTheme.textHeadline,
		maxWidth: 280,
	},
	body: {
		color: omTheme.textBody,
		maxWidth: 320,
		fontSize: 17,
		lineHeight: 24,
	},
	panel: {
		padding: omSpacing.xl,
		borderRadius: omRadius.l,
		backgroundColor: 'rgba(252,252,253,0.56)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.18)',
	},
	panelTitle: {
		color: omTheme.textHeadline,
	},
	panelBody: {
		marginTop: omSpacing.s,
		color: omTheme.textBody,
	},
})
