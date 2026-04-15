import { useCallback, useMemo, useRef, useState } from 'react'

import { backend } from './backend'
import type { Backend, FileRef, Inspection, PickResult } from './types'
import { fileRefName } from './types'

export type FilePickerStatus =
	| 'idle'
	| 'picking'
	| 'inspecting'
	| 'needs_reference'
	| 'needs_alignment'
	| 'picking_reference'
	| 'ready'
	| 'error'

export type FilePickerState = {
	status: FilePickerStatus
	primary?: FileRef
	reference?: FileRef
	inspection?: Inspection
	/** Inspection of the reference file itself (for display/matching). */
	referenceInspection?: Inspection
	error?: string
	backend: Backend
}

export type UseFilePickerApi = FilePickerState & {
	pick: () => Promise<void>
	pickReference: () => Promise<void>
	setFromDrop: (ref: FileRef) => Promise<void>
	setReferenceFromDrop: (ref: FileRef) => Promise<void>
	setFromUrl: (url: string) => Promise<void>
	reset: () => void
	confirm: () => PickResult | null
}

type SlotRouting =
	| { kind: 'reference'; inspection: Inspection }
	| { kind: 'alignment'; inspection: Inspection }
	| { kind: 'other'; inspection: Inspection }

function routeBySolo(inspection: Inspection): SlotRouting {
	if (inspection.detectedKind === 'reference_fasta') {
		return { kind: 'reference', inspection }
	}
	if (
		inspection.detectedKind === 'alignment_cram' ||
		inspection.detectedKind === 'alignment_bam'
	) {
		return { kind: 'alignment', inspection }
	}
	return { kind: 'other', inspection }
}

function statusFor(
	primary: FileRef | undefined,
	reference: FileRef | undefined,
	inspection: Inspection | undefined,
): FilePickerStatus {
	if (!primary && reference) return 'needs_alignment'
	if (primary && inspection) {
		const isAlignment =
			inspection.detectedKind === 'alignment_cram' || inspection.detectedKind === 'alignment_bam'
		if (isAlignment && !reference) return 'needs_reference'
	}
	if (primary && inspection) return 'ready'
	return 'idle'
}

export function useFilePicker(): UseFilePickerApi {
	const resolvedBackend = useMemo<Backend>(() => backend, [])
	const [state, setState] = useState<FilePickerState>({ status: 'idle', backend: resolvedBackend })
	const seq = useRef(0)
	const stateRef = useRef(state)
	stateRef.current = state

	const runInspect = useCallback(
		async (ref: FileRef, reference?: FileRef) => {
			const id = ++seq.current
			setState((s) => ({ ...s, status: 'inspecting', error: undefined }))
			try {
				const inspection = await backend.inspect(ref, reference ? { reference } : undefined)
				if (seq.current !== id) return inspection
				// eslint-disable-next-line no-console
				console.log('[FilePicker] inspection', inspection)
				return inspection
			} catch (err) {
				if (seq.current !== id) throw err
				setState({
					status: 'error',
					primary: ref,
					reference,
					error: err instanceof Error ? err.message : String(err),
					backend,
				})
				throw err
			}
		},
		[backend],
	)

	// Smart router: one file at a time comes in; we figure out whether it's an
	// alignment, a reference, or something else and slot it accordingly without
	// clobbering the opposite slot.
	const ingest = useCallback(
		async (ref: FileRef) => {
			let soloInspection: Inspection
			try {
				soloInspection = await runInspect(ref)
			} catch {
				return // error already surfaced in state
			}
			const route = routeBySolo(soloInspection)
			const existing = stateRef.current
			// eslint-disable-next-line no-console
			console.log('[FilePicker] ingest route', {
				name: fileRefName(ref),
				route: route.kind,
				hadPrimary: !!existing.primary,
				hadReference: !!existing.reference,
			})

			if (route.kind === 'reference') {
				// Reference slot gets this file; keep existing primary if any.
				const primary = existing.primary
				const referenceInspection = soloInspection
				if (primary) {
					// Re-inspect primary with new reference to compute match.
					try {
						const merged = await runInspect(primary, ref)
						setState({
							status: statusFor(primary, ref, merged),
							primary,
							reference: ref,
							inspection: merged,
							referenceInspection,
							backend,
						})
					} catch {
						/* err state already set */
					}
					return
				}
				setState({
					status: 'needs_alignment',
					primary: undefined,
					reference: ref,
					inspection: undefined,
					referenceInspection,
					backend,
				})
				return
			}

			if (route.kind === 'alignment') {
				// Alignment goes into primary. If a reference is waiting, pair them.
				const reference = existing.reference
				if (reference) {
					try {
						const merged = await runInspect(ref, reference)
						setState({
							status: statusFor(ref, reference, merged),
							primary: ref,
							reference,
							inspection: merged,
							referenceInspection: existing.referenceInspection,
							backend,
						})
					} catch {
						/* err state already set */
					}
					return
				}
				setState({
					status: 'needs_reference',
					primary: ref,
					reference: undefined,
					inspection: soloInspection,
					referenceInspection: undefined,
					backend,
				})
				return
			}

			// Plain primary (genotype, vcf, unknown). Clears any stale reference.
			setState({
				status: 'ready',
				primary: ref,
				reference: undefined,
				inspection: soloInspection,
				referenceInspection: undefined,
				backend,
			})
		},
		[backend, runInspect],
	)

	const pick = useCallback(async () => {
		setState((s) => ({ ...s, status: 'picking', error: undefined }))
		try {
			const ref = await backend.pickPrimary()
			if (!ref) {
				setState((s) => ({ ...s, status: s.primary || s.reference ? s.status : 'idle' }))
				return
			}
			await ingest(ref)
		} catch (err) {
			setState({
				status: 'error',
				error: err instanceof Error ? err.message : String(err),
				backend,
			})
		}
	}, [backend, ingest])

	const pickReference = useCallback(async () => {
		setState((s) => ({ ...s, status: 'picking_reference', error: undefined }))
		try {
			const ref = await backend.pickReference()
			if (!ref) {
				setState((s) => ({ ...s, status: statusFor(s.primary, s.reference, s.inspection) }))
				return
			}
			await ingest(ref)
		} catch (err) {
			setState((s) => ({
				...s,
				status: 'error',
				error: err instanceof Error ? err.message : String(err),
			}))
		}
	}, [backend, ingest])

	const setFromDrop = useCallback(
		async (ref: FileRef) => {
			await ingest(ref)
		},
		[ingest],
	)

	// Kept for backwards-compat with existing FilePicker component wiring; the
	// smart router makes this identical to setFromDrop.
	const setReferenceFromDrop = useCallback(
		async (ref: FileRef) => {
			await ingest(ref)
		},
		[ingest],
	)

	const setFromUrl = useCallback(
		async (url: string) => {
			await ingest({ kind: 'url', url })
		},
		[ingest],
	)

	const reset = useCallback(() => {
		seq.current += 1
		setState({ status: 'idle', backend })
	}, [backend])

	const confirm = useCallback((): PickResult | null => {
		if (state.status !== 'ready' || !state.primary) return null
		return { primary: state.primary, reference: state.reference }
	}, [state])

	return {
		...state,
		pick,
		pickReference,
		setFromDrop,
		setReferenceFromDrop,
		setFromUrl,
		reset,
		confirm,
	}
}
