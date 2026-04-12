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
					{isPreviouslyRun && recentRunLabel ? (
						<View style={styles.ranBadge}>
							<OMText numberOfLines={1} variant="caption" style={styles.ranBadgeText}>
								{recentRunLabel}
							</OMText>
						</View>
					) : null}
				</View>
			</Pressable>
		</Link>
	)
}

const styles = StyleSheet.create({
	card: {
		paddingHorizontal: omSpacing.l,
		paddingVertical: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,255,255,0.04)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
		gap: omSpacing.s,
	},
	cardPressed: {
		backgroundColor: 'rgba(255,255,255,0.06)',
		borderColor: 'rgba(255,255,255,0.14)',
	},
	cardHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.m,
	},
	cardTitleBlock: {
		flex: 1,
		gap: 4,
		minWidth: 0,
	},
	cardTitle: {
		color: omTheme.primaryText,
	},
	cardBody: {
		color: omColors.grayscale500,
	},
	cardFooter: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.m,
	},
	cardMeta: {
		flex: 1,
		color: omColors.grayscale500,
	},
	compatibilityBadge: {
		paddingHorizontal: omSpacing.s,
		paddingVertical: 4,
		borderRadius: omRadius.full,
		borderWidth: 1,
		flexShrink: 0,
	},
	compatibilityBadgeGood: {
		backgroundColor: 'rgba(83,190,169,0.12)',
		borderColor: 'rgba(83,190,169,0.2)',
	},
	compatibilityBadgeNeutral: {
		backgroundColor: 'rgba(82,168,197,0.12)',
		borderColor: 'rgba(82,168,197,0.2)',
	},
	compatibilityBadgeWeak: {
		backgroundColor: 'rgba(247,151,99,0.12)',
		borderColor: 'rgba(247,151,99,0.2)',
	},
	compatibilityBadgeText: {
		color: omTheme.primaryText,
	},
	ranBadge: {
		paddingHorizontal: omSpacing.s,
		paddingVertical: 4,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(83,190,169,0.12)',
		borderWidth: 1,
		borderColor: 'rgba(83,190,169,0.2)',
		flexShrink: 0,
	},
	ranBadgeText: {
		color: omColors.green500,
	},
})
