import { useEffect, useState } from 'react'
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { APP_BUILD_ID } from '@/lib/app-build-id'

const BUILD_ID = APP_BUILD_ID

const VERSION_URL = '/version.json'
const POLL_MS = 60_000

async function fetchDeployedBuildId(): Promise<string | null> {
	try {
		const res = await fetch(VERSION_URL, { cache: 'no-store' })
		if (!res.ok) return null
		const data = (await res.json()) as { buildId?: string }
		return typeof data.buildId === 'string' ? data.buildId : null
	} catch {
		return null
	}
}

// ts-prune-ignore-next
export function BuildBadge() {
	const [updateAvailable, setUpdateAvailable] = useState(false)

	useEffect(() => {
		if (Platform.OS !== 'web') return
		let cancelled = false

		const check = async () => {
			const deployed = await fetchDeployedBuildId()
			if (!cancelled && deployed && deployed !== BUILD_ID) {
				setUpdateAvailable(true)
			}
		}

		check()
		const id = setInterval(check, POLL_MS)
		return () => {
			cancelled = true
			clearInterval(id)
		}
	}, [])

	const reload = () => {
		if (Platform.OS === 'web') {
			window.location.reload()
		} else {
			Linking.openURL('https://app.biovault.net/web/').catch(() => {})
		}
	}

	return (
		<View pointerEvents="box-none" style={styles.container}>
			<Pressable
				onPress={reload}
				style={[styles.badge, updateAvailable && styles.badgeUpdate]}
				accessibilityRole="button"
				accessibilityLabel={
					updateAvailable
						? 'A new version is available. Tap to reload.'
						: `Build ${BUILD_ID}`
				}
			>
				<Text style={[styles.text, updateAvailable && styles.textUpdate]}>
					{updateAvailable ? `Update available · reload` : BUILD_ID}
				</Text>
			</Pressable>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		position: 'absolute',
		right: 8,
		bottom: 8,
		zIndex: 9999,
	},
	badge: {
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 6,
		backgroundColor: 'rgba(255,255,255,0.06)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.10)',
		opacity: 0.55,
	},
	badgeUpdate: {
		backgroundColor: '#53bea9',
		borderColor: '#53bea9',
		opacity: 1,
	},
	text: {
		fontSize: 10,
		color: '#f7f4ef',
		fontVariant: ['tabular-nums'],
	},
	textUpdate: {
		color: '#17161d',
		fontWeight: '700',
	},
})
