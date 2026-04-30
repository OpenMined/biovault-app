import { OMText } from '@/components/ui/OMText'
import { loadApol1G0G0Fixture, loadBundledApol1Script } from '@/lib/lab/bundled-assay-assets'
import { runFile } from '@/modules/expo-bioscript'
import { omColors, omRadius, omSpacing } from '@/styles/brand'
import { useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type Status = 'idle' | 'running' | 'passed' | 'failed'

export default function TestBioscriptScreen() {
	const params = useLocalSearchParams<{ autorun?: string }>()
	const [status, setStatus] = useState<Status>('idle')
	const [output, setOutput] = useState('')
	const [error, setError] = useState('')

	const runSmoke = async () => {
		setStatus('running')
		setOutput('')
		setError('')
		try {
			const [scriptContents, inputContents] = await Promise.all([
				loadBundledApol1Script(),
				loadApol1G0G0Fixture(),
			])
			const result = await runFile({
				scriptPath: 'apol1.py',
				scriptContents,
				inputFile: 'apol1-g0g0.txt',
				inputContents,
				outputFile: 'assay-output.tsv',
				participantId: 'native-e2e',
				inputFormat: 'text',
				maxDurationMs: 30_000,
				maxMemoryBytes: 128 * 1024 * 1024,
				maxAllocations: 1_000_000,
				maxRecursionDepth: 512,
			})
			const text = result.outputText ?? result.outputFiles?.['assay-output.tsv'] ?? ''
			setOutput(text)
			setStatus(text.includes('G0/G0') ? 'passed' : 'failed')
			if (!text.includes('G0/G0')) {
				setError(`Expected G0/G0 in output, got: ${text || '<empty>'}`)
			}
		} catch (err) {
			setStatus('failed')
			setError(err instanceof Error ? err.message : String(err))
		}
	}

	useEffect(() => {
		if (params.autorun === '1' && status === 'idle') {
			void runSmoke()
		}
	}, [params.autorun, status])

	return (
		<SafeAreaView style={styles.safe}>
			<View style={styles.container}>
				<OMText variant="h3" style={styles.title}>
					BioScript E2E
				</OMText>
				<OMText testID="bioscript-e2e-status" variant="body" style={styles.status}>
					{status}
				</OMText>
				<Pressable
					disabled={status === 'running'}
					onPress={() => void runSmoke()}
					style={[styles.button, status === 'running' ? styles.buttonDisabled : null]}
				>
					{status === 'running' ? <ActivityIndicator color={omColors.grayscale00} size="small" /> : null}
					<OMText variant="subtitle" style={styles.buttonText}>
						Run BioScript Smoke
					</OMText>
				</Pressable>
				{output ? (
					<View testID="bioscript-e2e-output" style={styles.block}>
						<OMText variant="body" style={styles.monospace}>
							{output}
						</OMText>
					</View>
				) : null}
				{error ? (
					<View testID="bioscript-e2e-error" style={styles.errorBlock}>
						<OMText variant="caption" style={styles.errorText}>
							{error}
						</OMText>
					</View>
				) : null}
			</View>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	safe: {
		backgroundColor: omColors.grayscale850,
		flex: 1,
	},
	container: {
		flex: 1,
		gap: omSpacing.l,
		justifyContent: 'center',
		padding: omSpacing.xl,
	},
	title: {
		color: omColors.grayscale00,
	},
	status: {
		color: omColors.grayscale300,
		textTransform: 'uppercase',
	},
	button: {
		alignItems: 'center',
		backgroundColor: omColors.green500,
		borderRadius: omRadius.m,
		flexDirection: 'row',
		gap: omSpacing.s,
		justifyContent: 'center',
		minHeight: 48,
		paddingHorizontal: omSpacing.l,
	},
	buttonDisabled: {
		opacity: 0.72,
	},
	buttonText: {
		color: omColors.grayscale00,
	},
	block: {
		backgroundColor: omColors.grayscale750,
		borderColor: omColors.grayscale700,
		borderRadius: omRadius.m,
		borderWidth: 1,
		padding: omSpacing.m,
	},
	monospace: {
		color: omColors.grayscale50,
		fontFamily: 'monospace',
	},
	errorBlock: {
		backgroundColor: '#4a1f2a',
		borderColor: '#c75065',
		borderRadius: omRadius.m,
		borderWidth: 1,
		padding: omSpacing.m,
	},
	errorText: {
		color: '#ffdce3',
	},
})
