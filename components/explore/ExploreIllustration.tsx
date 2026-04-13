import type { ExploreCategoryDefinition } from '@/lib/explore-categories'
import { omColors, omRadius } from '@/styles/brand'
import { StyleSheet, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'

export function ExploreIllustration({
	icon,
	framed = true,
	size = 44,
}: {
	framed?: boolean
	icon: ExploreCategoryDefinition['icon']
	size?: number
}) {
	const stroke =
		icon === 'eye'
			? omColors.teal500
			: icon === 'person-standing'
				? omColors.green500
				: icon === 'pill'
					? omColors.teal600
					: omColors.yellow200

	return (
		<View
			style={[
				styles.iconPanel,
				{ width: size, height: size },
				framed ? styles.iconPanelFramed : styles.iconPanelBare,
			]}
		>
			<Svg width={Math.round(size * 0.68)} height={Math.round(size * 0.68)} viewBox="0 0 24 24" fill="none">
				{icon === 'eye' ? (
					<>
						<Path
							d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"
							stroke={stroke}
							strokeWidth={2}
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
						<Circle cx="12" cy="12" r="3" stroke={stroke} strokeWidth={2} />
					</>
				) : null}
				{icon === 'person-standing' ? (
					<>
						<Circle cx="12" cy="5" r="1" stroke={stroke} strokeWidth={2} />
						<Path d="m9 20 3-6 3 6" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
						<Path d="m6 8 6 2 6-2" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
						<Path d="M12 10v4" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
					</>
				) : null}
				{icon === 'pill' ? (
					<>
						<Path
							d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"
							stroke={stroke}
							strokeWidth={2}
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
						<Path d="m8.5 8.5 7 7" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
					</>
				) : null}
				{icon === 'heart-pulse' ? (
					<>
						<Path
							d="M19.5 13.572 12 21l-7.5-7.428a5 5 0 1 1 7.5-6.566 5 5 0 1 1 7.5 6.572"
							stroke={stroke}
							strokeWidth={2}
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
						<Path d="M3.5 12h4l2-3 3 6 2-3h6" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
					</>
				) : null}
			</Svg>
		</View>
	)
}

const styles = StyleSheet.create({
	iconPanel: {
		borderRadius: omRadius.m,
		alignItems: 'center',
		justifyContent: 'center',
	},
	iconPanelFramed: {
		backgroundColor: omColors.grayscale850,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	iconPanelBare: {
		backgroundColor: 'transparent',
		borderWidth: 0,
	},
})
