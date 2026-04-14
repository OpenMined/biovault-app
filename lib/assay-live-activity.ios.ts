import type { TestRunProgress } from '@/lib/test-runner'
import AssayRunActivity, { type AssayRunActivityProps } from '@/widgets/AssayRunActivity'
import type { LiveActivity } from 'expo-widgets'

let currentActivity: LiveActivity<AssayRunActivityProps> | null = null
let lastSignature: string | null = null

function toActivityProps(assayTitle: string, progress: TestRunProgress): AssayRunActivityProps {
	const elapsedSeconds = Math.max(0, Math.floor(progress.elapsedMs / 1000))
	const progressLabel =
		progress.total !== null
			? `${progress.completed ?? 0}/${progress.total}`
			: progress.completed !== null
				? `${progress.completed}`
				: 'working'

	return {
		assayTitle,
		elapsedSeconds,
		phaseLabel: progress.phase.replace(/_/g, ' '),
		progressLabel,
		statusLabel: progress.phase === 'complete' ? 'Run complete' : 'Assay running',
	}
}

function isMissingActivityError(error: unknown) {
	if (!(error instanceof Error)) {
		return false
	}

	return /can't find live activity|failed to start live activity|nssupportsliveactivities/i.test(error.message)
}

export async function syncAssayRunLiveActivity(assayTitle: string, progress: TestRunProgress) {
	const nextProps = toActivityProps(assayTitle, progress)
	const signature = JSON.stringify(nextProps)
	if (signature === lastSignature) {
		return
	}
	lastSignature = signature

	if (!currentActivity) {
		try {
			currentActivity = AssayRunActivity.start(nextProps, 'biovaultapp://tests')
		} catch (error) {
			if (!isMissingActivityError(error)) {
				throw error
			}
			currentActivity = null
		}
		return
	}

	try {
		await currentActivity.update(nextProps)
	} catch (error) {
		if (!isMissingActivityError(error)) {
			throw error
		}
		currentActivity = null
	}
}

export async function endAssayRunLiveActivity(assayTitle?: string, progress?: TestRunProgress) {
	if (!currentActivity) {
		lastSignature = null
		return
	}

	try {
		if (assayTitle && progress) {
			await currentActivity.end('default', toActivityProps(assayTitle, progress), new Date())
		} else {
			await currentActivity.end('default')
		}
	} catch (error) {
		if (!isMissingActivityError(error)) {
			throw error
		}
	} finally {
		currentActivity = null
		lastSignature = null
	}
}
