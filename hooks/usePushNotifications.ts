import { useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { useRouter } from 'expo-router'

interface PushNotificationState {
	expoPushToken?: string
	notification?: Notifications.Notification
}

const notificationsAreSupported =
	Platform.OS !== 'web' &&
	typeof Notifications.getLastNotificationResponse === 'function' &&
	typeof Notifications.addNotificationReceivedListener === 'function' &&
	typeof Notifications.addNotificationResponseReceivedListener === 'function'

if (notificationsAreSupported) {
	Notifications.setNotificationHandler({
		handleNotification: async () => ({
			shouldPlaySound: false,
			shouldSetBadge: true,
			shouldShowBanner: true,
			shouldShowList: true,
		}),
	})
}

async function registerForPushNotificationsAsync(): Promise<string | undefined> {
	if (!notificationsAreSupported) {
		return undefined
	}

	if (Platform.OS === 'android') {
		await Notifications.setNotificationChannelAsync('default', {
			name: 'default',
			importance: Notifications.AndroidImportance.MAX,
			vibrationPattern: [0, 250, 250, 250],
			lightColor: '#FF231F7C',
		})
	}

	if (!Device.isDevice) {
		return undefined
	}

	type PermissionStatusShape = {
		granted?: boolean
		status?: string
		ios?: {
			status?: Notifications.IosAuthorizationStatus
		}
	}

	const permissions = (await Notifications.getPermissionsAsync()) as PermissionStatusShape
	let finalStatus = permissions.granted ? 'granted' : permissions.status

	if (finalStatus !== 'granted') {
		const request = (await Notifications.requestPermissionsAsync()) as PermissionStatusShape
		finalStatus = request.granted ? 'granted' : request.status
	}

	const allowsProvisional =
		permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL

	if (finalStatus !== 'granted' && !allowsProvisional) {
		return undefined
	}

	const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
	if (!projectId) {
		console.error('Push notification project ID not found.')
		return undefined
	}

	try {
		const token = await Notifications.getExpoPushTokenAsync({ projectId })
		return token.data
	} catch (error) {
		console.error('Error getting push token:', error)
		return undefined
	}
}

function extractNotificationUrl(notification: Notifications.Notification): string | undefined {
	const url = notification.request.content.data?.url
	return typeof url === 'string' ? url : undefined
}

async function registerDeviceTokenWithServer(token: string): Promise<void> {
	try {
		const response = await fetch('https://biovault.net/api/device-token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				push_token: token,
			}),
		})

		if (!response.ok) {
			console.error('Failed to register device token with server:', response.status)
		}
	} catch (error) {
		console.error('Failed to register device token with server:', error)
	}
}

export function usePushNotifications(): PushNotificationState {
	const [expoPushToken, setExpoPushToken] = useState<string | undefined>()
	const [notification, setNotification] = useState<Notifications.Notification | undefined>()
	const isNavigatingRef = useRef(false)
	const router = useRouter()

	useEffect(() => {
		if (!notificationsAreSupported) {
			return
		}

		let isMounted = true

		registerForPushNotificationsAsync().then((token) => {
			if (isMounted) {
				setExpoPushToken(token)
				if (token) {
					console.log('Expo push token:', token)
					void registerDeviceTokenWithServer(token)
				}
			}
		})

		const redirect = (incomingNotification: Notifications.Notification) => {
			if (isNavigatingRef.current) {
				return
			}

			const url = extractNotificationUrl(incomingNotification)
			if (!url) {
				return
			}

			isNavigatingRef.current = true

			try {
				router.push(url as any)
			} catch (error) {
				console.error('Error handling notification navigation:', error)
			} finally {
				setTimeout(() => {
					isNavigatingRef.current = false
				}, 1000)
			}
		}

		const lastResponse = Notifications.getLastNotificationResponse()
		if (lastResponse?.notification) {
			redirect(lastResponse.notification)
		}

		const notificationListener = Notifications.addNotificationReceivedListener(
			(receivedNotification) => {
				setNotification(receivedNotification)
			}
		)

		const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
			redirect(response.notification)
		})

		return () => {
			isMounted = false
			notificationListener.remove()
			responseListener.remove()
		}
	}, [router])

	return {
		expoPushToken,
		notification,
	}
}
