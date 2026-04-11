import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

const notificationsAreSupported =
	Platform.OS !== 'web' && typeof Notifications.scheduleNotificationAsync === 'function'

export async function scheduleTestFinishedNotification(testTitle: string, slug: string) {
	if (!notificationsAreSupported) {
		return
	}

	try {
		await Notifications.scheduleNotificationAsync({
			content: {
				title: `${testTitle} finished`,
				body: 'Tap to view results.',
				data: {
					url: `/tests/${slug}`,
				},
				sound: false,
			},
			trigger: null,
		})
	} catch (error) {
		console.error('Failed to schedule test completion notification:', error)
	}
}
