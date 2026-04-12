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
						<OMText variant="h4" style={styles.cardTitle}>
							{title}
						</OMText>
						<OMText variant="body" style={styles.cardBody}>
							{body}
						</OMText>
					</View>
					<View style={styles.cardBadgeColumn}>
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
						{isPreviouslyRun ? (
							<View style={styles.ranBadge}>
								<OMText variant="caption" style={styles.ranBadgeText}>
									Already run
								</OMText>
							</View>
						) : null}
					</View>
				</View>
				<OMText variant="caption" style={styles.cardMeta}>
					{summary}
				</OMText>
				{recentRunLabel ? (
					<OMText variant="caption" style={styles.cardResultMeta}>
						{recentRunLabel}
					</OMText>
				) : null}
			</Pressable>
		</Link>
	)
}

const styles = StyleSheet.create({
	card: {
		paddingHorizontal: omSpacing.l,
		paddingVertical: omSpacing.l,
		borderRadius: omRadius.m,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
		gap: omSpacing.s,
	},
	cardPressed: {
		backgroundColor: 'rgba(255,255,255,0.04)',
	},
	cardHeader: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		justifyContent: 'space-between',
		gap: omSpacing.m,
	},
	cardTitleBlock: {
		flex: 1,
		gap: 4,
	},
	cardBadgeColumn: {
		alignItems: 'flex-end',
		gap: 4,
	},
	cardTitle: {
		color: omTheme.primaryText,
	},
	cardBody: {
		color: omColors.grayscale400,
		lineHeight: 20,
	},
	cardMeta: {
		color: omColors.grayscale500,
		lineHeight: 16,
	},
	cardResultMeta: {
		color: omColors.green500,
	},
	compatibilityBadge: {
		paddingHorizontal: omSpacing.s,
		paddingVertical: 4,
		borderRadius: omRadius.s,
		borderWidth: 1,
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
		borderRadius: omRadius.s,
		backgroundColor: 'rgba(83,190,169,0.12)',
		borderWidth: 1,
		borderColor: 'rgba(83,190,169,0.2)',
	},
	ranBadgeText: {
		color: omColors.green500,
	},
})
