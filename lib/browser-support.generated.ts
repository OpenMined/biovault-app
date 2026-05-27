// Generated from browser compatibility results.
// Update with: npm run update:browser-support

type GeneratedBrowserSupportFamily =
	| 'chromium'
	| 'firefox'
	| 'safari'
	| 'samsungInternet'
	| 'chromeIos'
	| 'firefoxIos'
	| 'unknown'

type GeneratedBrowserSupportPolicy = {
	minimumKnownGood: number | null
	latestKnownGood: number | null
	knownFailing: readonly number[]
}

export const GENERATED_BROWSER_SUPPORT_POLICY = {
	chromium: {
		minimumKnownGood: 97,
		latestKnownGood: 148,
		knownFailing: [
			94,
			96
		]
	},
	firefox: {
		minimumKnownGood: 127,
		latestKnownGood: 150,
		knownFailing: [
			99
		]
	},
	safari: {
		minimumKnownGood: 17,
		latestKnownGood: 26,
		knownFailing: [
			15
		]
	},
	samsungInternet: {
		minimumKnownGood: null,
		latestKnownGood: null,
		knownFailing: []
	},
	chromeIos: {
		minimumKnownGood: null,
		latestKnownGood: null,
		knownFailing: []
	},
	firefoxIos: {
		minimumKnownGood: null,
		latestKnownGood: null,
		knownFailing: []
	},
	unknown: {
		minimumKnownGood: null,
		latestKnownGood: null,
		knownFailing: []
	}
} as const satisfies Record<GeneratedBrowserSupportFamily, GeneratedBrowserSupportPolicy>
