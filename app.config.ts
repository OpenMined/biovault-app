import { ExpoConfig } from 'expo/config'

const IS_DEV = process.env.APP_VARIANT === 'development'
const IS_PREVIEW = process.env.APP_VARIANT === 'preview'

interface EnvironmentValues {
	name: string
	bundleIdentifier: string
	package: string
	appleTeamId: string
	appleTeamName: string
}

function getEnvironmentValues(): EnvironmentValues {
	if (IS_DEV) {
		return {
			name: 'BioVault Dev',
			bundleIdentifier: 'org.openmined.biovault.dev',
			package: 'org.openmined.biovault.dev',
			appleTeamName: "OpenMined Foundation",
			appleTeamId: "28PJ5N8D9X",
		}
	}
	if (IS_PREVIEW) {
		return {
			name: 'BioVault Preview',
			bundleIdentifier: 'org.openmined.biovault.preview',
			package: 'org.openmined.biovault.preview',
			appleTeamName: "OpenMined Foundation",
			appleTeamId: "28PJ5N8D9X",

		}
	}
	return {
		name: 'BioVault',
		bundleIdentifier: 'org.openmined.biovault',
		package: 'org.openmined.biovault',
		appleTeamName: "OpenMined Foundation",
		appleTeamId: "28PJ5N8D9X",
	}
}

const config: ExpoConfig = {
	name: getEnvironmentValues().name,
	owner: 'openmined',
	slug: 'biovault',
	version: '0.2.0',
	orientation: 'portrait',
	icon: './assets/images/biovault-icon.png',
	scheme: 'biovaultapp',
	userInterfaceStyle: 'light',
	newArchEnabled: true,
	ios: {
		bundleIdentifier: getEnvironmentValues().bundleIdentifier,
		appleTeamId: getEnvironmentValues().appleTeamId, // seems to require name not id
		supportsTablet: true,
		infoPlist: {
			ITSAppUsesNonExemptEncryption: false,
			UIFileSharingEnabled: true,
			LSSupportsOpeningDocumentsInPlace: true,
		},
	},
	android: {
		package: getEnvironmentValues().package,
		icon: './assets/images/biovault-icon.png',
		edgeToEdgeEnabled: true,
	},
	web: {
		bundler: 'metro',
		output: 'static',
		favicon: './assets/images/favicon.png',
	},
	extra: {
		eas: {
			projectId: '6e5fc48a-f9db-4c16-8810-21acf9d978b0',
		},
	},
	plugins: [
		'expo-font',
		'expo-sqlite',
		'expo-web-browser',
		'expo-router',
		[
			'expo-splash-screen',
			{
				image: './assets/images/splash-icon.png',
				imageWidth: 200,
				resizeMode: 'contain',
				backgroundColor: '#ffffff',
			},
		],
		[
			'expo-asset',
			{
				assets: ['./assets/clinvar_23andme.sqlite'],
			},
		],
		['expo-secure-store'],
	],
	experiments: {
		typedRoutes: true,
	},
}

export default config
