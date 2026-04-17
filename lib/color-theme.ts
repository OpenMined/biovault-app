import {
	getAppPreferenceSync,
	setAppPreferenceSync,
	subscribeToAppPreference,
} from '@/lib/app-preferences'
import { useSyncExternalStore } from 'react'
import { useColorScheme as useSystemColorScheme } from 'react-native'

export type ColorScheme = 'light' | 'dark'
export type ColorSchemePreference = ColorScheme | 'system'

const PREF_KEY = 'colorSchemePreference'

function readPreferenceSync(): ColorSchemePreference {
	const raw = getAppPreferenceSync(PREF_KEY)
	return raw === 'light' || raw === 'dark' ? raw : 'system'
}

export function getColorSchemePreferenceSync(): ColorSchemePreference {
	return readPreferenceSync()
}

export function setColorSchemePreferenceSync(pref: ColorSchemePreference) {
	setAppPreferenceSync(PREF_KEY, pref === 'system' ? null : pref)
}

export function cycleColorSchemePreferenceSync() {
	const curr = readPreferenceSync()
	const next: ColorSchemePreference =
		curr === 'system' ? 'light' : curr === 'light' ? 'dark' : 'system'
	setColorSchemePreferenceSync(next)
	return next
}

export function toggleColorSchemePreferenceSync(currentScheme: ColorScheme) {
	const pref = readPreferenceSync()
	const effectiveScheme: ColorScheme =
		pref === 'light' || pref === 'dark' ? pref : currentScheme
	const next: ColorScheme = effectiveScheme === 'dark' ? 'light' : 'dark'
	setColorSchemePreferenceSync(next)
	return next
}

export function useColorSchemePreference(): ColorSchemePreference {
	return useSyncExternalStore(
		(listener) =>
			subscribeToAppPreference(PREF_KEY, () => {
				listener()
			}),
		readPreferenceSync,
		readPreferenceSync,
	)
}

export function useColorScheme(): ColorScheme {
	const pref = useColorSchemePreference()
	const system = useSystemColorScheme()
	if (pref === 'light' || pref === 'dark') return pref
	return system === 'dark' ? 'dark' : 'light'
}
