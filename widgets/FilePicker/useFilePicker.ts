import { useCallback, useMemo, useRef, useState } from 'react'

import { backend } from './backend'
import type { Backend, FileRef, Inspection, PickResult } from './types'
import { needsReference } from './types'

export type FilePickerStatus =
	| 'idle'
	| 'picking'
	| 'inspecting'
	| 'needs_reference'
	| 'picking_reference'
	| 'ready'
	| 'error'

export type FilePickerState = {
	status: FilePickerStatus
	primary?: FileRef
	reference?: FileRef
	inspection?: Inspection
	error?: string
	backend: Backend
}

export type UseFilePickerApi = FilePickerState & {
	pick: () => Promise<void>
	pickReference: () => Promise<void>
	setFromDrop: (ref: FileRef) => Promise<void>
	setFromUrl: (url: string) => Promise<void>
	reset: () => void
	confirm: () => PickResult | null
}

export function useFilePicker(): UseFilePickerApi {
	const resolvedBackend = useMemo<Backend>(() => backend, [])
	const [state, setState] = useState<FilePickerState>({ status: 'idle', backend: resolvedBackend })
	const seq = useRef(0)

	const runInspect = useCallback(
		async (ref: FileRef, reference?: FileRef) => {
			const id = ++seq.current
			setState((s) => ({ ...s, status: 'inspecting', primary: ref, reference, error: undefined }))
			try {
				const inspection = await backend.inspect(ref, reference ? { reference } : undefined)
				if (seq.current !== id) return
				const nextStatus: FilePickerStatus = needsReference(inspection)
					? 'needs_reference'
					: 'ready'
				setState({ status: nextStatus, primary: ref, reference, inspection, backend })
			} catch (err) {
				if (seq.current !== id) return
				setState({
					status: 'error',
					primary: ref,
					reference,
					error: err instanceof Error ? err.message : String(err),
					backend,
				})
			}
		},
		[backend],
	)

	const pick = useCallback(async () => {
		setState((s) => ({ ...s, status: 'picking', error: undefined }))
		try {
			const ref = await backend.pickPrimary()
			if (!ref) {
				setState((s) => ({ ...s, status: 'idle' }))
				return
			}
			await runInspect(ref)
		} catch (err) {
			setState({
				status: 'error',
				error: err instanceof Error ? err.message : String(err),
				backend,
			})
		}
	}, [backend, runInspect])

	const pickReference = useCallback(async () => {
		setState((s) => ({ ...s, status: 'picking_reference', error: undefined }))
		try {
			const ref = await backend.pickReference()
			if (!ref) {
				setState((s) => ({ ...s, status: 'needs_reference' }))
				return
			}
			if (!state.primary) {
				setState({
					status: 'error',
					error: 'no primary file selected',
					backend,
				})
				return
			}
			await runInspect(state.primary, ref)
		} catch (err) {
			setState((s) => ({
				...s,
				status: 'error',
				error: err instanceof Error ? err.message : String(err),
			}))
		}
	}, [backend, runInspect, state.primary])

	const setFromDrop = useCallback(
		async (ref: FileRef) => {
			await runInspect(ref)
		},
		[runInspect],
	)

	const setFromUrl = useCallback(
		async (url: string) => {
			await runInspect({ kind: 'url', url })
		},
		[runInspect],
	)

	const reset = useCallback(() => {
		seq.current += 1
		setState({ status: 'idle', backend })
	}, [backend])

	const confirm = useCallback((): PickResult | null => {
		if (state.status !== 'ready' || !state.primary) return null
		return { primary: state.primary, reference: state.reference }
	}, [state])

	return { ...state, pick, pickReference, setFromDrop, setFromUrl, reset, confirm }
}
