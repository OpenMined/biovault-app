import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native'

import { OMText } from '@/components/ui/OMText'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'

import { useFilePicker } from './useFilePicker'
import type { FileRef, Inspection, PickResult } from './types'
import { fileRefName, fileRefSize } from './types'

type FilePickerProps = {
	onConfirm?: (result: PickResult, inspection?: Inspection) => void
}

export function FilePicker({ onConfirm }: FilePickerProps) {
	const picker = useFilePicker()
	const [urlValue, setUrlValue] = useState('')
	const [dragActive, setDragActive] = useState(false)
	const dropRef = useRef<View>(null)

	// Stable refs so the drag listeners don't have to re-bind on every render.
	// We look at `status` through a ref too so the listener can route the next
	// drop to the reference slot when the widget is waiting for one.
	const setFromDropRef = useRef(picker.setFromDrop)
	const setReferenceFromDropRef = useRef(picker.setReferenceFromDrop)
	const statusRef = useRef(picker.status)
	useEffect(() => {
		setFromDropRef.current = picker.setFromDrop
		setReferenceFromDropRef.current = picker.setReferenceFromDrop
		statusRef.current = picker.status
	}, [picker.setFromDrop, picker.setReferenceFromDrop, picker.status])

	// Web drag-drop: listen at window level so the whole page reacts. Use a
	// depth counter to distinguish entering a child element from leaving the
	// window entirely. preventDefault on dragover is mandatory or the browser
	// navigates to the dropped file instead of delivering the drop event.
	useEffect(() => {
		if (Platform.OS !== 'web') return
		// eslint-disable-next-line no-console
		console.log('[FilePicker] attaching window drag listeners')
		let depth = 0
		const hasFiles = (e: DragEvent) => {
			const types = e.dataTransfer?.types
			if (!types) return false
			// DataTransferItemList / DOMStringList — both are array-like. Some
			// browsers expose `contains`, others only numeric indexing.
			for (let i = 0; i < types.length; i += 1) {
				if (types[i] === 'Files') return true
			}
			return false
		}
		const stop = (e: Event) => {
			e.preventDefault()
			e.stopPropagation()
		}
		const onDragEnter = (e: DragEvent) => {
			if (!hasFiles(e)) return
			stop(e)
			depth += 1
			setDragActive(true)
		}
		const onDragOver = (e: DragEvent) => {
			if (!hasFiles(e)) return
			stop(e)
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
			setDragActive(true)
		}
		const onDragLeave = (e: DragEvent) => {
			if (!hasFiles(e)) return
			stop(e)
			depth = Math.max(0, depth - 1)
			if (depth === 0) setDragActive(false)
		}
		const onDrop = async (e: DragEvent) => {
			const dt = e.dataTransfer
			// Capture synchronously — Chrome neutralizes DataTransferItemList after
			// the sync part of the handler returns, so any `await` must happen
			// after we've already grabbed what we need.
			const syncFile = dt?.files?.[0] ?? null
			const syncItems = Array.from(dt?.items ?? [])
			// eslint-disable-next-line no-console
			console.log('[FilePicker] drop', {
				types: Array.from(dt?.types ?? []),
				files: dt?.files?.length ?? 0,
				firstName: syncFile?.name,
				itemKinds: syncItems.map((i) => i.kind),
			})
			stop(e)
			depth = 0
			setDragActive(false)
			if (!dt) return

			// Try the FileSystemHandle path first (keeps a live reference on
			// Chromium). If any step fails, fall back to the sync File we already
			// captured.
			const asReference = statusRef.current === 'needs_reference'
			const deliver = asReference ? setReferenceFromDropRef.current : setFromDropRef.current

			for (const item of syncItems) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const getHandle = (item as any).getAsFileSystemHandle as
					| (() => Promise<FileSystemHandle>)
					| undefined
				if (typeof getHandle !== 'function') continue
				try {
					const handle = await getHandle.call(item)
					if (handle && handle.kind === 'file') {
						const fh = handle as FileSystemFileHandle
						const f = await fh.getFile()
						// eslint-disable-next-line no-console
						console.log('[FilePicker] drop → handle path', { name: f.name, asReference })
						await deliver({ kind: 'handle', handle: fh, name: f.name, size: f.size })
						return
					}
				} catch (err) {
					// eslint-disable-next-line no-console
					console.log('[FilePicker] getAsFileSystemHandle failed', err)
				}
			}
			if (syncFile) {
				// eslint-disable-next-line no-console
				console.log('[FilePicker] drop → blob fallback', { name: syncFile.name, asReference })
				await deliver({ kind: 'blob', file: syncFile })
				return
			}
			// eslint-disable-next-line no-console
			console.warn('[FilePicker] drop produced no file')
		}
		window.addEventListener('dragenter', onDragEnter)
		window.addEventListener('dragover', onDragOver)
		window.addEventListener('dragleave', onDragLeave)
		window.addEventListener('drop', onDrop)
		return () => {
			window.removeEventListener('dragenter', onDragEnter)
			window.removeEventListener('dragover', onDragOver)
			window.removeEventListener('dragleave', onDragLeave)
			window.removeEventListener('drop', onDrop)
		}
	}, [])

	const submitUrl = useCallback(() => {
		const url = urlValue.trim()
		if (!url) return
		void picker.setFromUrl(url)
	}, [picker, urlValue])

	const confirm = useCallback(() => {
		const result = picker.confirm()
		if (result) onConfirm?.(result, picker.inspection)
	}, [onConfirm, picker])

	return (
		<View style={styles.root} testID="file-picker">
			<View style={styles.debugBadge} testID="file-picker-status-badge">
				<OMText variant="caption" style={styles.debugBadgeText}>
					status: {picker.status}
					{picker.primary ? ` · ${fileRefName(picker.primary)}` : ''}
					{picker.error ? ` · err: ${picker.error}` : ''}
				</OMText>
			</View>
			{Platform.OS === 'web' && dragActive ? (
				<View
					style={styles.dragOverlay}
					pointerEvents="none"
					testID="file-picker-drag-overlay"
				>
					<View style={styles.dragOverlayInner}>
						<OMText variant="h3" style={styles.dragOverlayTitle}>
							{picker.status === 'needs_reference'
								? 'Drop to add reference FASTA'
								: 'Drop anywhere to add this file'}
						</OMText>
						<OMText variant="body" style={styles.dragOverlayBody}>
							{picker.status === 'needs_reference'
								? 'We\u2019ll keep your alignment file and pair it with this reference.'
								: 'Release to inspect it with the heuristics engine.'}
						</OMText>
					</View>
				</View>
			) : null}
			<View
				ref={dropRef}
				style={[styles.dropZone, dragActive ? styles.dropZoneActive : null]}
				testID="file-picker-drop"
			>
				<OMText variant="headline" style={styles.dropTitle}>
					Add a genomic file
				</OMText>
				<OMText variant="body" style={styles.dropBody}>
					{picker.backend.supportsDragDrop
						? 'Drop a file, or pick one below. We only read a sample to identify it.'
						: 'Pick a file below. We only read a sample to identify it.'}
				</OMText>
				<Pressable
					style={styles.pickButton}
					onPress={() => void picker.pick()}
					testID="file-picker-pick"
				>
					<OMText variant="subtitle" style={styles.pickButtonText}>
						{picker.status === 'picking' ? 'Opening…' : 'Choose file'}
					</OMText>
				</Pressable>
				{picker.backend.supportsUrlInput ? (
					<View style={styles.urlRow}>
						<TextInput
							value={urlValue}
							onChangeText={setUrlValue}
							placeholder="or paste a URL to a file"
							placeholderTextColor={omColors.grayscale500}
							style={styles.urlInput}
							autoCapitalize="none"
							autoCorrect={false}
							testID="file-picker-url"
						/>
						<Pressable onPress={submitUrl} style={styles.urlButton} testID="file-picker-url-submit">
							<OMText variant="subtitle" style={styles.pickButtonText}>
								Load
							</OMText>
						</Pressable>
					</View>
				) : null}
			</View>

			{picker.status === 'inspecting' ? (
				<View style={styles.infoCard} testID="file-picker-inspecting">
					<OMText variant="body" style={styles.infoText}>
						Inspecting {picker.primary ? fileRefName(picker.primary) : 'file'}…
					</OMText>
				</View>
			) : null}

			{picker.status === 'error' ? (
				<View style={[styles.infoCard, styles.errorCard]} testID="file-picker-error">
					<OMText variant="headline" style={styles.errorTitle}>
						Something went wrong
					</OMText>
					<OMText variant="body" style={styles.infoText}>
						{picker.error}
					</OMText>
					<Pressable onPress={picker.reset} style={styles.secondaryButton}>
						<OMText variant="subtitle" style={styles.pickButtonText}>
							Try again
						</OMText>
					</Pressable>
				</View>
			) : null}

			{picker.inspection ? (
				<InspectionCard
					inspection={picker.inspection}
					primary={picker.primary}
					reference={picker.reference}
				/>
			) : null}

			{picker.status === 'needs_reference' ? (
				<View style={styles.infoCard} testID="file-picker-needs-reference">
					<OMText variant="headline" style={styles.infoTitle}>
						Reference file required
					</OMText>
					<OMText variant="body" style={styles.infoText}>
						CRAM/BAM alignments need a matching reference FASTA to be readable.
					</OMText>
					<Pressable
						onPress={() => void picker.pickReference()}
						style={styles.pickButton}
						testID="file-picker-pick-reference"
					>
						<OMText variant="subtitle" style={styles.pickButtonText}>
							Choose reference (.fa/.fasta)
						</OMText>
					</Pressable>
				</View>
			) : null}

			{picker.status === 'needs_alignment' ? (
				<View style={styles.infoCard} testID="file-picker-needs-alignment">
					<OMText variant="headline" style={styles.infoTitle}>
						Alignment file required
					</OMText>
					<OMText variant="body" style={styles.infoText}>
						{picker.reference ? `Got reference ${fileRefName(picker.reference)}.` : ''}{' '}
						Now drop (or choose) the matching CRAM or BAM.
					</OMText>
					<Pressable
						onPress={() => void picker.pick()}
						style={styles.pickButton}
						testID="file-picker-pick-alignment"
					>
						<OMText variant="subtitle" style={styles.pickButtonText}>
							Choose alignment (.cram/.bam)
						</OMText>
					</Pressable>
				</View>
			) : null}

			{picker.referenceInspection && !picker.inspection ? (
				<InspectionCard inspection={picker.referenceInspection} primary={picker.reference} />
			) : null}

			{picker.status === 'ready' ? (
				<View style={styles.confirmRow} testID="file-picker-ready">
					<Pressable onPress={picker.reset} style={styles.secondaryButton}>
						<OMText variant="subtitle" style={styles.pickButtonText}>
							Cancel
						</OMText>
					</Pressable>
					<Pressable onPress={confirm} style={styles.confirmButton} testID="file-picker-confirm">
						<OMText variant="subtitle" style={styles.pickButtonText}>
							{picker.backend.linksInPlace ? 'Keep reference to file' : 'Save a copy'}
						</OMText>
					</Pressable>
				</View>
			) : null}
		</View>
	)
}

function InspectionCard({
	inspection,
	primary,
	reference,
}: {
	inspection: Inspection
	primary?: FileRef
	reference?: FileRef
}) {
	const size = primary ? fileRefSize(primary) : inspection.sizeBytes
	return (
		<View style={styles.inspectionCard} testID="file-picker-inspection">
			<Row label="File" value={inspection.fileName} />
			{primary ? (
				<Row label="Storage" value={renderStorage(primary)} testID="inspection-storage" />
			) : null}
			{inspection.selectedEntry ? <Row label="Zip entry" value={inspection.selectedEntry} /> : null}
			<Row label="Type" value={renderKind(inspection.detectedKind)} testID="inspection-kind" />
			<Row
				label="Confidence"
				value={inspection.confidence.replace('_', ' ')}
				testID="inspection-confidence"
			/>
			<Row label="Container" value={inspection.container} />
			{inspection.source ? (
				<>
					<Row
						label="Vendor"
						value={`${inspection.source.vendor}${inspection.source.platformVersion ? ` ${inspection.source.platformVersion}` : ''}`}
						testID="inspection-vendor"
					/>
					<Row
						label="Vendor confidence"
						value={inspection.source.confidence.replace('_', ' ')}
					/>
					{inspection.source.evidence.length > 0 ? (
						<Row
							label="Vendor evidence"
							value={inspection.source.evidence.join(' · ')}
						/>
					) : null}
				</>
			) : null}
			{inspection.assembly ? (
				<Row label="Assembly" value={inspection.assembly.toUpperCase()} />
			) : null}
			{inspection.phased !== undefined ? (
				<Row label="Phased" value={inspection.phased ? 'yes' : 'no'} />
			) : null}
			{size ? <Row label="Size" value={formatSize(size)} /> : null}
			{inspection.hasIndex !== undefined ? (
				<Row label="Has index" value={inspection.hasIndex ? 'yes' : 'no'} />
			) : null}
			{reference ? <Row label="Reference" value={fileRefName(reference)} /> : null}
			{inspection.referenceMatches !== undefined ? (
				<Row
					label="Reference matches"
					value={inspection.referenceMatches ? 'yes' : 'no'}
				/>
			) : null}
			{inspection.evidence.length > 0 ? (
				<Row label="Evidence" value={inspection.evidence.join(' · ')} />
			) : null}
			{inspection.warnings.length > 0 ? (
				<Row label="Warnings" value={inspection.warnings.join(' · ')} />
			) : null}
			<Row label="Inspected in" value={`${inspection.durationMs} ms`} />
		</View>
	)
}

function Row({ label, value, testID }: { label: string; value: string; testID?: string }) {
	return (
		<View style={styles.row}>
			<OMText variant="caption" style={styles.rowLabel}>
				{label}
			</OMText>
			<OMText variant="body" style={styles.rowValue} testID={testID}>
				{value}
			</OMText>
		</View>
	)
}

function renderStorage(ref: FileRef): string {
	switch (ref.kind) {
		case 'handle':
			return 'Linked in place (FileSystemFileHandle — no copy)'
		case 'path':
			return 'Linked in place (file path — no copy)'
		case 'blob':
			return 'Copied into browser memory (File)'
		case 'url':
			return 'Remote URL (will download on use)'
	}
}

function renderKind(kind: Inspection['detectedKind']): string {
	switch (kind) {
		case 'genotype_text':
			return 'Genotype (text)'
		case 'vcf':
			return 'VCF'
		case 'bcf':
			return 'BCF'
		case 'alignment_cram':
			return 'CRAM alignment'
		case 'alignment_bam':
			return 'BAM alignment'
		case 'reference_fasta':
			return 'Reference FASTA'
		default:
			return 'Unknown'
	}
}

function formatSize(bytes: number): string {
	if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`
	if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`
	if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`
	return `${bytes} B`
}

const styles = StyleSheet.create({
	root: {
		gap: omSpacing.l,
	},
	debugBadge: {
		padding: omSpacing.s,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,200,50,0.12)',
		borderWidth: 1,
		borderColor: 'rgba(255,200,50,0.4)',
	},
	debugBadgeText: {
		color: '#ffd36b',
		fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
	},
	dragOverlay: {
		position: 'absolute',
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		...(({ zIndex: 9999 } as any) as object),
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		// Use CSS fixed positioning on web so the overlay covers the viewport even
		// when the page is scrolled. React Native ignores this key.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		...(Platform.OS === 'web' ? ({ position: 'fixed' } as any) : null),
		backgroundColor: 'rgba(5, 15, 20, 0.72)',
		alignItems: 'center',
		justifyContent: 'center',
		padding: omSpacing.xxl,
	},
	dragOverlayInner: {
		padding: omSpacing.xxl,
		borderRadius: omRadius.l,
		borderWidth: 3,
		borderStyle: 'dashed',
		borderColor: omTheme.accent,
		backgroundColor: 'rgba(83,190,169,0.12)',
		gap: omSpacing.m,
		alignItems: 'center',
	},
	dragOverlayTitle: {
		color: omTheme.accent,
		textAlign: 'center',
	},
	dragOverlayBody: {
		color: '#ffffff',
		textAlign: 'center',
	},
	dropZone: {
		minHeight: 260,
		padding: omSpacing.xxl,
		borderRadius: omRadius.l,
		borderWidth: 2,
		borderStyle: 'dashed',
		borderColor: 'rgba(255,255,255,0.22)',
		backgroundColor: omColors.grayscale750,
		gap: omSpacing.m,
		justifyContent: 'center',
		alignItems: 'flex-start',
	},
	dropZoneActive: {
		borderColor: omTheme.accent,
		borderWidth: 3,
		backgroundColor: 'rgba(83,190,169,0.14)',
	},
	dropTitle: {
		color: omTheme.primaryText,
	},
	dropBody: {
		color: omColors.grayscale400,
	},
	pickButton: {
		alignSelf: 'flex-start',
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(83,190,169,0.14)',
		borderWidth: 1,
		borderColor: 'rgba(83,190,169,0.28)',
	},
	pickButtonText: {
		color: omTheme.accent,
	},
	urlRow: {
		flexDirection: 'row',
		gap: omSpacing.s,
		alignItems: 'center',
	},
	urlInput: {
		flex: 1,
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.m,
		backgroundColor: omColors.grayscale850,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.12)',
		color: omTheme.primaryText,
	},
	urlButton: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(83,190,169,0.14)',
		borderWidth: 1,
		borderColor: 'rgba(83,190,169,0.28)',
	},
	infoCard: {
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		gap: omSpacing.s,
	},
	infoTitle: {
		color: omTheme.primaryText,
	},
	infoText: {
		color: omColors.grayscale300,
	},
	errorCard: {
		borderColor: 'rgba(255,107,107,0.3)',
	},
	errorTitle: {
		color: '#ff8a8a',
	},
	inspectionCard: {
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		gap: omSpacing.s,
	},
	row: {
		flexDirection: 'row',
		gap: omSpacing.m,
		alignItems: 'flex-start',
	},
	rowLabel: {
		color: omColors.grayscale500,
		width: 110,
	},
	rowValue: {
		color: omTheme.primaryText,
		flex: 1,
	},
	confirmRow: {
		flexDirection: 'row',
		gap: omSpacing.m,
		justifyContent: 'flex-end',
	},
	secondaryButton: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(255,255,255,0.06)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.12)',
	},
	confirmButton: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: omTheme.accent,
		borderWidth: 1,
		borderColor: omTheme.accent,
	},
})
