import { Asset } from 'expo-asset'
import { readAsStringAsync } from 'expo-file-system'
import { Platform } from 'react-native'

const apol1ScriptAsset = require('../../exvitae/assays/risk/APOL1/apol1.py')
const apol1G0G0FixtureAsset = require('../../tests/fixtures/apol1-g0g0.txt')

async function loadTextAsset(assetModule: number): Promise<string> {
	const asset = Asset.fromModule(assetModule)
	if (Platform.OS === 'web') {
		const response = await fetch(asset.uri)
		if (!response.ok) throw new Error(`Failed to load asset ${asset.uri}: ${response.status}`)
		return response.text()
	}
	await asset.downloadAsync()
	const uri = asset.localUri ?? asset.uri
	return readAsStringAsync(uri)
}

export function loadBundledApol1Script(): Promise<string> {
	return loadTextAsset(apol1ScriptAsset)
}

export function loadApol1G0G0Fixture(): Promise<string> {
	return loadTextAsset(apol1G0G0FixtureAsset)
}

