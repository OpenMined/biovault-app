import { Platform } from 'react-native'

/**
 * Platform-specific key-value storage utility
 * - On web: uses localStorage
 * - On native: uses expo-sqlite/kv-store
 */
export const Storage = (() => {
	if (Platform.OS === 'web') {
		// Web implementation using localStorage
		return {
			getItemSync: (key: string): string | null => {
				try {
					return localStorage.getItem(key)
				} catch (e) {
					console.warn('localStorage.getItem error:', e)
					return null
				}
			},
			setItemSync: (key: string, value: string): void => {
				try {
					localStorage.setItem(key, value)
				} catch (e) {
					console.warn('localStorage.setItem error:', e)
				}
			},
			removeItemSync: (key: string): void => {
				try {
					localStorage.removeItem(key)
				} catch (e) {
					console.warn('localStorage.removeItem error:', e)
				}
			},
		}
	} else {
		// Native implementation using expo-sqlite/kv-store
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const KVStore = require('expo-sqlite/kv-store')
		const store = KVStore.default || KVStore

		return {
			getItemSync: store.getItemSync.bind(store),
			setItemSync: store.setItemSync.bind(store),
			removeItemSync: store.removeItemSync.bind(store),
		}
	}
})()
