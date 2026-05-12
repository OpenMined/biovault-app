import { OMText } from '@/components/ui/OMText'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { Asset } from 'expo-asset'
import { Pressable, StyleSheet, View } from 'react-native'
import { PlatformSvgUri } from '@/components/ui/PlatformSvgUri'

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
				<OMText variant="headline" style={styles.value} numberOfLines={1} ellipsizeMode="tail">
					{fileName}
				</OMText>
			</View>
			<View style={styles.chevronWrap}>
				<PlatformSvgUri
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
		minHeight: 44,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.s,
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.xs,
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
	},
	textRow: {
		flex: 1,
		minWidth: 0,
		justifyContent: 'center',
	},
	value: {
		color: omTheme.primaryText,
		fontSize: 17,
		lineHeight: 20,
		minWidth: 0,
	},
	chevronWrap: {
		paddingLeft: omSpacing.xs,
		opacity: 0.8,
	},
})
