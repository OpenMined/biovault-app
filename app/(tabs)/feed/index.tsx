import { OMText } from '@/components/ui/OMText'
import { listStoredNotifications, type StoredNotification } from '@/lib/notification-store'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { useFocusEffect } from '@react-navigation/native'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAnalytics } from '@/hooks/useAnalytics'
import { OMButton } from '@/components/ui/OMButton'

const NOTIFICATIONS_PAGE_SIZE = 10

function formatTimestamp(timestamp: string, now: number) {
	const date = new Date(timestamp)
	const currentTime = new Date(now)
	const diffMs = currentTime.getTime() - date.getTime()
	const diffSeconds = Math.max(0, Math.floor(diffMs / 1000))
	const diffMinutes = Math.floor(diffSeconds / 60)
	const diffHours = Math.floor(diffMinutes / 60)

	if (!Number.isFinite(date.getTime())) {
		return ''
	}

	if (diffSeconds < 60) {
		return `${diffSeconds}s ago`
	}

	if (diffMinutes < 60) {
		return `${diffMinutes}m ago`
	}

	if (diffHours < 6) {
		return `${diffHours}h ago`
	}

	const timeLabel = new Intl.DateTimeFormat(undefined, {
		timeStyle: 'short',
	}).format(date)

	const startOfToday = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate())
	const startOfItemDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
	const dayDiff = Math.round(
		(startOfToday.getTime() - startOfItemDay.getTime()) / (1000 * 60 * 60 * 24)
	)

	if (dayDiff === 0) {
		return `Today at ${timeLabel}`
	}

	if (dayDiff === 1) {
		return `Yesterday at ${timeLabel}`
	}

	const dateLabel = new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		year: date.getFullYear() === currentTime.getFullYear() ? undefined : 'numeric',
	}).format(date)

	return `${dateLabel} at ${timeLabel}`
}

function NotificationRow({ item, now }: { item: StoredNotification; now: number }) {
	const canOpen = Boolean(item.url)
	const title = item.subtitle?.trim() ? `${item.title} - ${item.subtitle}` : item.title

	return (
		<Pressable
			disabled={!canOpen}
			onPress={() => {
				if (item.url) {
					router.push(item.url as any)
				}
			}}
			style={({ pressed }) => [styles.card, canOpen ? styles.cardInteractive : null, pressed ? styles.cardPressed : null]}
		>
			<View style={styles.cardTopRow}>
				<OMText numberOfLines={1} variant="headline" style={styles.cardTitle}>
					{title}
				</OMText>
				<OMText numberOfLines={1} variant="caption" style={styles.metaText}>
					{formatTimestamp(item.receivedAt, now)}
				</OMText>
			</View>
			<View style={styles.cardFooter}>
				<OMText numberOfLines={1} variant="caption" style={styles.cardBody}>
					{item.body}
				</OMText>
				{item.url ? (
					<OMText variant="subtitle" style={styles.cardAction}>
						Tap to View
					</OMText>
				) : null}
			</View>
		</Pressable>
	)
}

export default function FeedScreen() {
	const [notifications, setNotifications] = useState<StoredNotification[]>([])
	const [now, setNow] = useState(() => Date.now())
	const [visibleCount, setVisibleCount] = useState(NOTIFICATIONS_PAGE_SIZE)
	const insets = useSafeAreaInsets()

	useAnalytics({
		trackScreenView: true,
		screenProperties: { screen: 'Notifications' },
	})

	const loadNotifications = useCallback(() => {
		void listStoredNotifications()
			.then((nextNotifications) => {
				setNotifications(nextNotifications)
				setVisibleCount(NOTIFICATIONS_PAGE_SIZE)
			})
			.catch(console.error)
	}, [])

	useFocusEffect(
		useCallback(() => {
			loadNotifications()
		}, [loadNotifications])
	)

	useEffect(() => {
		const interval = setInterval(() => {
			setNow(Date.now())
		}, 1000)

		return () => {
			clearInterval(interval)
		}
	}, [])

	const visibleNotifications = notifications.slice(0, visibleCount)
	const hasMoreNotifications = notifications.length > visibleCount

	return (
		<SafeAreaView style={styles.safeArea} edges={['top']}>
			<ScrollView
				style={styles.screen}
				contentContainerStyle={[
					styles.content,
					{ paddingBottom: omSpacing.xxxl + insets.bottom + 72 },
				]}
				showsVerticalScrollIndicator={false}
			>
				<View style={styles.hero}>
					<OMText variant="caption" style={styles.eyebrow}>
						NOTIFICATIONS
					</OMText>
					<OMText variant="h3" style={styles.title}>
						Notifications
					</OMText>
					<OMText variant="body" style={styles.body}>
						Push notifications received on this device are stored locally and shown here.
					</OMText>
				</View>

				{notifications.length > 0 ? (
					<>
						<View style={styles.stack}>
							{visibleNotifications.map((item) => (
								<NotificationRow key={item.id} item={item} now={now} />
							))}
						</View>

						{hasMoreNotifications ? (
							<View style={styles.paginationActions}>
								<OMButton
									label={`Show ${Math.min(NOTIFICATIONS_PAGE_SIZE, notifications.length - visibleCount)} More`}
									variant="secondary"
									onPress={() => {
										setVisibleCount((current) =>
											Math.min(current + NOTIFICATIONS_PAGE_SIZE, notifications.length)
										)
									}}
									style={styles.paginationButton}
								/>
							</View>
						) : notifications.length > NOTIFICATIONS_PAGE_SIZE ? (
							<View style={styles.paginationActions}>
								<OMButton
									label="Show Less"
									variant="secondary"
									onPress={() => {
										setVisibleCount(NOTIFICATIONS_PAGE_SIZE)
									}}
									style={styles.paginationButton}
								/>
							</View>
						) : null}
					</>
				) : (
					<View style={styles.emptyCard}>
						<OMText variant="headline" style={styles.emptyTitle}>
							No notifications yet
						</OMText>
						<OMText variant="body" style={styles.emptyBody}>
							When this device receives a push notification, it will appear here as a tidy activity list.
						</OMText>
					</View>
				)}
			</ScrollView>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: omColors.grayscale850,
	},
	screen: {
		flex: 1,
		backgroundColor: omColors.grayscale850,
	},
	content: {
		padding: omSpacing.xl,
		gap: omSpacing.xl,
	},
	hero: {
		gap: omSpacing.m,
		paddingTop: omSpacing.m,
	},
	eyebrow: {
		alignSelf: 'flex-start',
		paddingHorizontal: omSpacing.s,
		paddingVertical: omSpacing.xs,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,255,255,0.08)',
		color: omColors.grayscale400,
		letterSpacing: 1,
	},
	title: {
		color: omTheme.primaryText,
		maxWidth: 340,
	},
	body: {
		color: omColors.grayscale400,
		maxWidth: 360,
		fontSize: 17,
		lineHeight: 24,
	},
	stack: {
		gap: omSpacing.xs,
	},
	paginationActions: {
		alignItems: 'center',
	},
	paginationButton: {
		minWidth: 160,
	},
	card: {
		paddingHorizontal: omSpacing.l,
		paddingVertical: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,255,255,0.04)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
		gap: omSpacing.s,
	},
	cardInteractive: {
		borderColor: 'rgba(255,255,255,0.08)',
	},
	cardPressed: {
		backgroundColor: 'rgba(255,255,255,0.06)',
		borderColor: 'rgba(255,255,255,0.14)',
	},
	cardTopRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.m,
	},
	cardTitle: {
		flex: 1,
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
	cardAction: {
		color: omTheme.accent,
	},
	metaText: {
		color: omColors.grayscale500,
		flexShrink: 0,
	},
	emptyCard: {
		padding: omSpacing.xl,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		gap: omSpacing.s,
	},
	emptyTitle: {
		color: omTheme.primaryText,
	},
	emptyBody: {
		color: omColors.grayscale400,
	},
})
