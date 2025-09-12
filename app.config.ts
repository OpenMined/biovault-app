import { ExpoConfig } from 'expo/config'

const IS_DEV = process.env.APP_VARIANT === 'development'
const IS_PREVIEW = process.env.APP_VARIANT === 'preview'

interface EnvironmentValues {
	name: string
	bundleIdentifier: string
	package: string
}

function getEnvironmentValues(): EnvironmentValues {
	if (IS_DEV) {
		return {
			name: 'BioVault Dev',
			bundleIdentifier: 'org.openmined.biovault.dev',
			package: 'org.openmined.biovault.dev',
		}
	}
	if (IS_PREVIEW) {
		return {
			name: 'BioVault Preview',
			bundleIdentifier: 'org.openmined.biovault.preview',
			package: 'org.openmined.biovault.preview',
		}
	}
	return {
		name: 'BioVault',
		bundleIdentifier: 'org.openmined.biovault',
		package: 'org.openmined.biovault',
	}
}

const config: ExpoConfig = {
	name: getEnvironmentValues().name,
	owner: 'openmined',
	slug: 'biovault',
	version: '0.1.0',
	orientation: 'portrait',
	icon: './assets/images/biovault-icon.png',
	scheme: 'biovaultapp',
	userInterfaceStyle: 'light',
	newArchEnabled: true,
	ios: {
		bundleIdentifier: getEnvironmentValues().bundleIdentifier,
		supportsTablet: true,
		infoPlist: {
			ITSAppUsesNonExemptEncryption: false,
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
		['react-native-bottom-tabs'],
		[
			'expo-asset',
			{
				assets: ['./assets/clinvar_23andme.sqlite'],
			},
		],
		['expo-secure-store'],
		[
			'expo-build-properties',
			{
				ios: {
					useFrameworks: 'static',
				},
			},
		],
	],
	experiments: {
		typedRoutes: true,
	},
}

export default config
