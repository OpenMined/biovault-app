import { getAppPreferenceSync, setAppPreferenceSync } from '@/lib/app-preferences'
import { parseLaunchIntentFromUrl } from '@/lib/launch-intents'

const DEFERRED_LAUNCH_URL_KEY = 'deferred_launch_url'

export function getDeferredLaunchUrlSync(): string | null {
	return getAppPreferenceSync(DEFERRED_LAUNCH_URL_KEY)
}

export function clearDeferredLaunchUrlSync() {
	setAppPreferenceSync(DEFERRED_LAUNCH_URL_KEY, null)
}

export function deferLaunchUrlSync(url: string) {
	if (!parseLaunchIntentFromUrl(url, 'web-query')) return
	setAppPreferenceSync(DEFERRED_LAUNCH_URL_KEY, url)
}
