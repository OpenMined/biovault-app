import {
	getAppPreferenceSync,
	setAppPreferenceSync,
	subscribeToAppPreference,
} from '@/lib/app-preferences'
import { useEffect, useState } from 'react'
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

export function useColorSchemePreference(): ColorSchemePreference {
	const [pref, setPref] = useState<ColorSchemePreference>(readPreferenceSync)
	useEffect(
		() =>
			subscribeToAppPreference(PREF_KEY, (value) => {
				setPref(value === 'light' || value === 'dark' ? value : 'system')
			}),
		[],
	)
	return pref
}

export function useColorScheme(): ColorScheme {
	const pref = useColorSchemePreference()
	const system = useSystemColorScheme()
	if (pref === 'light' || pref === 'dark') return pref
	return system === 'dark' ? 'dark' : 'light'
}
