import { OMText } from '@/components/ui/OMText'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { Link, type Href } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'

type BadgeTone = 'good' | 'neutral' | 'weak'

type Props = {
	badgeLabel: string
	badgeTone: BadgeTone
	body: string
	href: Href
	isPreviouslyRun: boolean
	recentRunLabel?: string | null
	summary: string
	title: string
}

export function ExploreAssayCard({
	badgeLabel,
	badgeTone,
	body,
	href,
	isPreviouslyRun,
	recentRunLabel,
	summary,
	title,
}: Props) {
	return (
		<Link href={href} asChild>
			<Pressable style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}>
				<View style={styles.cardHeader}>
					<View style={styles.cardTitleBlock}>
						<OMText numberOfLines={1} variant="headline" style={styles.cardTitle}>
							{title}
						</OMText>
						<OMText numberOfLines={1} variant="caption" style={styles.cardBody}>
							{body}
						</OMText>
					</View>
					<View
						style={[
							styles.compatibilityBadge,
							badgeTone === 'good'
								? styles.compatibilityBadgeGood
								: badgeTone === 'weak'
									? styles.compatibilityBadgeWeak
									: styles.compatibilityBadgeNeutral,
						]}
					>
						<OMText variant="caption" style={styles.compatibilityBadgeText}>
							{badgeLabel}
						</OMText>
					</View>
				</View>
				<View style={styles.cardFooter}>
					<OMText numberOfLines={1} variant="caption" style={styles.cardMeta}>
						{summary}
					</OMText>
					<View style={[styles.ranBadge, !(isPreviouslyRun && recentRunLabel) ? styles.ranBadgeHidden : null]}>
						<OMText numberOfLines={1} variant="caption" style={styles.ranBadgeText}>
							{isPreviouslyRun && recentRunLabel ? recentRunLabel : 'Ran 00/00/0000'}
						</OMText>
					</View>
				</View>
			</Pressable>
		</Link>
	)
}

const styles = StyleSheet.create({
	card: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,255,255,0.035)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.07)',
		gap: omSpacing.s,
	},
	cardPressed: {
		backgroundColor: 'rgba(255,255,255,0.05)',
		borderColor: 'rgba(255,255,255,0.12)',
	},
	cardHeader: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		justifyContent: 'space-between',
		gap: omSpacing.s,
	},
	cardTitleBlock: {
		flex: 1,
		gap: 2,
		minWidth: 0,
	},
	cardTitle: {
		color: omTheme.primaryText,
		fontSize: 19,
		lineHeight: 23,
	},
	cardBody: {
		color: omColors.grayscale550,
	},
	cardFooter: {
		flexDirection: 'row',
		alignItems: 'flex-end',
		justifyContent: 'space-between',
		gap: omSpacing.s,
		paddingTop: 2,
	},
	cardMeta: {
		flex: 1,
		color: omColors.grayscale500,
		lineHeight: 16,
	},
	compatibilityBadge: {
		paddingHorizontal: omSpacing.s,
		paddingVertical: 3,
		borderRadius: omRadius.full,
		borderWidth: 1,
		flexShrink: 0,
	},
	compatibilityBadgeGood: {
		backgroundColor: 'rgba(83,190,169,0.1)',
		borderColor: 'rgba(83,190,169,0.18)',
	},
	compatibilityBadgeNeutral: {
		backgroundColor: 'rgba(82,168,197,0.1)',
		borderColor: 'rgba(82,168,197,0.18)',
	},
	compatibilityBadgeWeak: {
		backgroundColor: 'rgba(247,151,99,0.1)',
		borderColor: 'rgba(247,151,99,0.18)',
	},
	compatibilityBadgeText: {
		color: omColors.grayscale150,
	},
	ranBadge: {
		paddingHorizontal: omSpacing.s,
		paddingVertical: 3,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(255,255,255,0.05)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
		flexShrink: 0,
		minWidth: 96,
		alignItems: 'center',
	},
	ranBadgeHidden: {
		opacity: 0,
	},
	ranBadgeText: {
		color: omColors.grayscale400,
	},
})
