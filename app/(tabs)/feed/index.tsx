import { OMButton } from '@/components/ui/OMButton'
import { OMIcon } from '@/components/ui/OMIcon'
import { OMText } from '@/components/ui/OMText'
import {
	clearStoredNotifications,
	listStoredNotifications,
	type StoredNotification,
} from '@/lib/notification-store'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { useFocusEffect } from '@react-navigation/native'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
	Alert,
	Pressable,
	ScrollView,
	StyleSheet,
	View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAnalytics } from '@/hooks/useAnalytics'

const NOTIFICATIONS_PAGE_SIZE = 5

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

	return (
		<Pressable
			disabled={!canOpen}
			onPress={() => {
				if (item.url) {
					router.push(item.url as any)
				}
			}}
			style={({ pressed }) => [
				styles.row,
				canOpen ? styles.rowInteractive : null,
				pressed ? styles.rowPressed : null,
			]}
		>
			<View style={styles.rowIcon}>
				<OMIcon name="notifications" size={18} tone="inverse" containerTone="dark" />
			</View>
			<View style={styles.rowContent}>
				<View style={styles.rowHeader}>
					<OMText variant="headline" style={styles.rowTitle}>
						{item.title}
					</OMText>
					<OMText variant="caption" style={styles.rowMeta}>
						{formatTimestamp(item.receivedAt, now)}
					</OMText>
				</View>
				{item.subtitle ? (
					<OMText variant="caption" style={styles.rowSubtitle}>
						{item.subtitle}
					</OMText>
				) : null}
				<OMText variant="body" style={styles.rowBody}>
					{item.body}
				</OMText>
				{item.url ? (
					<View style={styles.rowFooter}>
						<OMText variant="subtitle" style={styles.rowAction}>
							Open
						</OMText>
					</View>
				) : null}
			</View>
		</Pressable>
	)
}

export default function FeedScreen() {
	const [notifications, setNotifications] = useState<StoredNotification[]>([])
	const [now, setNow] = useState(() => Date.now())
	const [visibleCount, setVisibleCount] = useState(NOTIFICATIONS_PAGE_SIZE)

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
		<SafeAreaView style={styles.safeArea}>
			<ScrollView
				style={styles.screen}
				contentContainerStyle={styles.content}
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
						<View style={styles.actions}>
							<OMButton
								label="Clear All"
								variant="secondary"
								iconName="trash-outline"
								onPress={() => {
									Alert.alert('Clear notifications?', 'This removes the local notification history on this device.', [
										{ text: 'Cancel', style: 'cancel' },
										{
											text: 'Clear',
											style: 'destructive',
											onPress: () => {
												void clearStoredNotifications().then(() => {
													setNotifications([])
													setVisibleCount(NOTIFICATIONS_PAGE_SIZE)
												})
											},
										},
									])
								}}
								style={styles.clearButton}
							/>
						</View>

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
						<View style={styles.emptyIcon}>
							<OMIcon name="notifications-off-outline" size={24} tone="accent" containerTone="soft" />
						</View>
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
		paddingBottom: omSpacing.xxxl,
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
	actions: {
		alignItems: 'flex-end',
	},
	clearButton: {
		minHeight: 40,
		paddingHorizontal: omSpacing.l,
		paddingVertical: omSpacing.s,
	},
	stack: {
		gap: omSpacing.m,
	},
	paginationActions: {
		alignItems: 'center',
	},
	paginationButton: {
		minWidth: 160,
	},
	row: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: omSpacing.m,
		padding: omSpacing.xl,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
	},
	rowInteractive: {
		backgroundColor: omColors.grayscale700,
	},
	rowPressed: {
		opacity: 0.88,
	},
	rowIcon: {
		paddingTop: 2,
	},
	rowContent: {
		flex: 1,
		gap: omSpacing.xs,
	},
	rowHeader: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		justifyContent: 'space-between',
		gap: omSpacing.m,
	},
	rowTitle: {
		flex: 1,
		color: omTheme.primaryText,
	},
	rowMeta: {
		color: omColors.grayscale500,
	},
	rowSubtitle: {
		color: omTheme.accent,
		letterSpacing: 0.3,
	},
	rowBody: {
		color: omColors.grayscale400,
	},
	rowFooter: {
		marginTop: omSpacing.s,
	},
	rowAction: {
		color: omTheme.accent,
	},
	emptyCard: {
		padding: omSpacing.xxl,
		borderRadius: omRadius.xl,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		alignItems: 'center',
		gap: omSpacing.s,
	},
	emptyIcon: {
		marginBottom: omSpacing.s,
	},
	emptyTitle: {
		color: omTheme.primaryText,
	},
	emptyBody: {
		color: omColors.grayscale400,
		textAlign: 'center',
	},
})
