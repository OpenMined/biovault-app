import { OMText } from '@/components/ui/OMText'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { Asset } from 'expo-asset'
import { Pressable, StyleSheet, View } from 'react-native'
import { SvgUri } from 'react-native-svg'

type Props = {
	fileName: string
	isHighlighted?: boolean
	onPress: () => void
	chevronDirection?: 'down' | 'up'
}

const chevronDownUri = Asset.fromModule(require('../../assets/images/chevron-down.svg')).uri
const chevronUpUri = Asset.fromModule(require('../../assets/images/chevron-up.svg')).uri

export function ExploreActiveFileBar({
	fileName,
	isHighlighted = false,
	onPress,
	chevronDirection = 'down',
}: Props) {
	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [
				styles.container,
				isHighlighted ? styles.containerHighlighted : null,
				pressed ? styles.containerPressed : null,
			]}
		>
			<View style={styles.textRow}>
				<OMText variant="subtitle" style={styles.label}>
					Selected:
				</OMText>
				<OMText variant="headline" style={styles.value} numberOfLines={1} ellipsizeMode="tail">
					{fileName}
				</OMText>
			</View>
			<View style={styles.chevronWrap}>
				<SvgUri
					uri={chevronDirection === 'up' ? chevronUpUri : chevronDownUri}
					width={16}
					height={16}
					color={omColors.grayscale400}
				/>
			</View>
		</Pressable>
	)
}

const styles = StyleSheet.create({
	container: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.s,
		paddingHorizontal: omSpacing.m,
		paddingVertical: 10,
		borderRadius: omRadius.m,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	containerPressed: {
		backgroundColor: omColors.grayscale700,
		borderColor: 'rgba(255,255,255,0.12)',
	},
	containerHighlighted: {
		backgroundColor: 'rgba(82,168,197,0.12)',
		borderColor: 'rgba(82,168,197,0.75)',
		shadowColor: omColors.teal500,
		shadowOpacity: 0.3,
		shadowRadius: 20,
		shadowOffset: { width: 0, height: 0 },
		elevation: 10,
	},
	textRow: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		gap: omSpacing.xs,
		minWidth: 0,
	},
	label: {
		color: omColors.grayscale400,
		flexShrink: 0,
		fontSize: 16,
		lineHeight: 20,
	},
	value: {
		color: omTheme.primaryText,
		fontSize: 16,
		lineHeight: 20,
		flex: 1,
		minWidth: 0,
		textAlign: 'right',
	},
	chevronWrap: {
		paddingLeft: omSpacing.xs,
	},
})
