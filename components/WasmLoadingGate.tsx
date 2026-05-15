import { warmupBioscriptRuntime } from '@/modules/expo-bioscript'
import {
	subscribeWasmProgress,
	type WasmProgressSnapshot,
} from '@/modules/expo-bioscript/src/webRuntimeProgress'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
	ActivityIndicator,
	Animated,
	Easing,
	Platform,
	StyleSheet,
	Text,
	View,
} from 'react-native'

const IS_WEB = Platform.OS === 'web'
// Never trap the user if warmup hangs.
const SAFETY_TIMEOUT_MS = 30_000

function mb(bytes: number): string {
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function WasmLoadingGate({ children }: { children: ReactNode }) {
	const [ready, setReady] = useState(!IS_WEB)
	const [snapshot, setSnapshot] = useState<WasmProgressSnapshot | null>(null)
	const shimmer = useRef(new Animated.Value(0)).current

	useEffect(() => {
		if (!IS_WEB) return
		let done = false
		const finish = () => {
			if (done) return
			done = true
			setReady(true)
		}

		const unsubscribe = subscribeWasmProgress((next) => {
			setSnapshot(next)
			if (next.done && !next.failed) finish()
		})

		const safetyTimer = setTimeout(finish, SAFETY_TIMEOUT_MS)

		warmupBioscriptRuntime()
			.catch((error) => {
				console.warn('[bioscript] web runtime warmup failed', error)
			})
			.finally(finish)

		return () => {
			unsubscribe()
			clearTimeout(safetyTimer)
		}
	}, [])

	const overlayVisible = IS_WEB && !ready
	// Phase 1 = generic boot loader. Phase 2 = real WASM download bar, once a
	// download task has actually started reporting.
	const wasmActive = !!snapshot && snapshot.tasks.length > 0
	const indeterminate = !snapshot || snapshot.fraction == null

	useEffect(() => {
		if (!overlayVisible || !wasmActive || !indeterminate) return
		const loop = Animated.loop(
			Animated.timing(shimmer, {
				toValue: 1,
				duration: 1100,
				easing: Easing.inOut(Easing.ease),
				useNativeDriver: Platform.OS !== 'web',
			}),
		)
		loop.start()
		return () => loop.stop()
	}, [overlayVisible, wasmActive, indeterminate, shimmer])

	return (
		<View style={styles.root}>
			{children}
			{overlayVisible ? (
				<View style={styles.overlay} accessibilityRole="progressbar">
					<Text style={styles.brand}>BioVault</Text>

					{!wasmActive ? (
						<>
							<Text style={styles.title}>Starting up</Text>
							<ActivityIndicator size="large" color="#53bea9" style={styles.spinner} />
							<Text style={styles.detail}>Loading…</Text>
						</>
					) : (
						<>
							<Text style={styles.title}>Preparing analysis engine</Text>
							<View style={styles.track}>
								{indeterminate ? (
									<Animated.View
										style={[
											styles.barIndeterminate,
											{
												opacity: shimmer.interpolate({
													inputRange: [0, 0.5, 1],
													outputRange: [0.35, 1, 0.35],
												}),
											},
										]}
									/>
								) : (
									<View
										style={[
											styles.barFill,
											{ width: `${Math.round((snapshot?.fraction ?? 0) * 100)}%` },
										]}
									/>
								)}
							</View>
							{snapshot && snapshot.fraction != null ? (
								<Text style={styles.percent}>{Math.round(snapshot.fraction * 100)}%</Text>
							) : null}
							<Text style={styles.detail}>
								{snapshot && snapshot.loaded > 0
									? snapshot.total
										? `${mb(snapshot.loaded)} / ${mb(snapshot.total)}`
										: mb(snapshot.loaded)
									: 'Downloading WebAssembly…'}
							</Text>
						</>
					)}

					<Text style={styles.subtle}>Runs locally — your data never leaves this browser.</Text>
				</View>
			) : null}
		</View>
	)
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	overlay: {
		...StyleSheet.absoluteFillObject,
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: 32,
		backgroundColor: '#272532',
		zIndex: 10000,
	},
	brand: {
		color: '#53bea9',
		fontSize: 13,
		fontWeight: '700',
		letterSpacing: 2,
		textTransform: 'uppercase',
		marginBottom: 14,
	},
	title: {
		color: '#f7f4ef',
		fontSize: 20,
		fontWeight: '700',
		marginBottom: 22,
	},
	spinner: {
		marginBottom: 8,
	},
	track: {
		width: '100%',
		maxWidth: 360,
		height: 8,
		borderRadius: 999,
		backgroundColor: 'rgba(255,255,255,0.10)',
		overflow: 'hidden',
	},
	barFill: {
		height: '100%',
		borderRadius: 999,
		backgroundColor: '#53bea9',
	},
	barIndeterminate: {
		height: '100%',
		width: '40%',
		borderRadius: 999,
		backgroundColor: '#53bea9',
	},
	percent: {
		color: '#f7f4ef',
		fontSize: 28,
		fontWeight: '800',
		marginTop: 16,
		fontVariant: ['tabular-nums'],
	},
	detail: {
		color: 'rgba(247,244,239,0.7)',
		fontSize: 13,
		marginTop: 6,
		fontVariant: ['tabular-nums'],
	},
	subtle: {
		color: 'rgba(247,244,239,0.4)',
		fontSize: 12,
		marginTop: 8,
	},
})
