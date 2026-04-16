import { OMText } from '@/components/ui/OMText'
import { ensurePermission, getHandles } from '@/lib/file-handle-store'
import { loadHomeImportState, type HomeImportedDocument } from '@/lib/home-import'
import { isBioscriptAvailable, runFile } from '@/modules/expo-bioscript'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { unzipSync } from 'fflate'
import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import YAML from 'yaml'

// === Types ===================================================================

type AssayLanguage = 'python' | 'yaml'

type CatalogItem = {
	id: string
	name: string
	kind: 'assay' | 'genome' | 'alignment' | 'reference' | 'unknown'
	language?: AssayLanguage
	/** Text for assays/genomes. For alignment/reference we keep the File alive via handle. */
	contents: string
	sizeBytes: number
	addedAt: number
	/** For zip-derived genomes, the original archive name. */
	sourceName?: string
	/** Live File handle — set for alignment/reference so we can hand bytes to a future WASM parser without re-reading. */
	file?: File
}

type RunRecord = {
	id: string
	ranAt: number
	assayId: string
	assayName: string
	genomeId: string
	genomeName: string
	status: 'running' | 'done' | 'error'
	outputText?: string
	outputFiles?: Record<string, string>
	error?: string
	durationMs?: number
}

// === File-classification helpers ===========================================

const ASSAY_EXTS = ['.py', '.yaml', '.yml']
const GENOME_TEXT_EXTS = ['.txt', '.tsv', '.csv', '.vcf']
const ALIGNMENT_EXTS = ['.cram', '.bam']
const REFERENCE_EXTS = ['.fa', '.fasta']

function detectLanguage(name: string): AssayLanguage | undefined {
	const lower = name.toLowerCase()
	if (lower.endsWith('.py')) return 'python'
	if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml'
	return undefined
}

function isAssay(name: string): boolean {
	const lower = name.toLowerCase()
	return ASSAY_EXTS.some((ext) => lower.endsWith(ext))
}

function isGenomeText(name: string): boolean {
	const lower = name.toLowerCase()
	return GENOME_TEXT_EXTS.some((ext) => lower.endsWith(ext))
}

function isAlignment(name: string): boolean {
	const lower = name.toLowerCase()
	return ALIGNMENT_EXTS.some((ext) => lower.endsWith(ext))
}

function isReference(name: string): boolean {
	const lower = name.toLowerCase()
	return REFERENCE_EXTS.some((ext) => lower.endsWith(ext))
}

async function extractGenomeTextFromZip(
	file: File,
): Promise<{ entryName: string; contents: string } | null> {
	const buf = new Uint8Array(await file.arrayBuffer())
	let unzipped: Record<string, Uint8Array>
	try {
		unzipped = unzipSync(buf)
	} catch (err) {
		// eslint-disable-next-line no-console
		console.warn('[assay-lab] unzipSync failed', { name: file.name, size: buf.length, err })
		return null
	}
	const entries = Object.keys(unzipped).filter(
		(n) => !n.endsWith('/') && !n.startsWith('__MACOSX/'),
	)
	const preferred = ['.vcf', '.txt', '.tsv', '.csv']
	const entryName = preferred
		.map((ext) => entries.find((n) => n.toLowerCase().endsWith(ext)))
		.find(Boolean)
	if (!entryName) return null
	const bytes = unzipped[entryName]
	if (!bytes) return null
	return { entryName, contents: new TextDecoder('utf-8').decode(bytes) }
}

function makeId(prefix: string) {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// === YAML → Python compile ==================================================

function compileVariantYamlToPython(yamlText: string): string {
	const doc = YAML.parse(yamlText)
	if (!doc || typeof doc !== 'object') throw new Error('empty YAML document')
	const schema = String(doc.schema ?? '')
	if (!schema.startsWith('bioscript:variant:')) {
		throw new Error(`unsupported schema "${schema}" — expected bioscript:variant:1.0`)
	}
	const name = String(doc.name ?? 'variant')
	const gene = String(doc.gene ?? '')
	const rsids: string[] = Array.isArray(doc.identifiers?.rsids)
		? (doc.identifiers.rsids as unknown[]).map((v) => String(v))
		: []
	if (rsids.length === 0) throw new Error('no identifiers.rsids found')
	const alleles = doc.alleles ?? {}
	const kind = String(alleles.kind ?? 'snv').toLowerCase()
	const ref = String(alleles.ref ?? '')
	const alts: string[] = Array.isArray(alleles.alts)
		? (alleles.alts as unknown[]).map((v) => String(v))
		: []
	const alt = alts[0] ?? ''
	const fmtCoord = (c: { chrom?: unknown; pos?: unknown } | undefined): string | null => {
		if (!c) return null
		const chrom = String(c.chrom ?? '').trim()
		const pos = typeof c.pos === 'number' ? c.pos : Number.parseInt(String(c.pos ?? ''), 10)
		if (!chrom || !Number.isFinite(pos)) return null
		return `${chrom}:${pos}-${pos}`
	}
	const grch37 = fmtCoord(doc.coordinates?.grch37)
	const grch38 = fmtCoord(doc.coordinates?.grch38)
	const pyKind = kind === 'snv' ? 'snp' : kind === 'indel' ? 'indel' : kind
	const variantKwargs: string[] = [
		`rsid=${JSON.stringify(rsids.length === 1 ? rsids[0] : rsids)}`,
		`kind=${JSON.stringify(pyKind)}`,
	]
	if (grch37) variantKwargs.push(`grch37=${JSON.stringify(grch37)}`)
	if (grch38) variantKwargs.push(`grch38=${JSON.stringify(grch38)}`)
	if (ref) variantKwargs.push(`ref=${JSON.stringify(ref)}`)
	if (alt) variantKwargs.push(`alt=${JSON.stringify(alt)}`)

	return `# Auto-generated from a bioscript:variant:1.0 YAML assay by the web assay lab.
# Source: ${name}${gene ? ` · ${gene}` : ''}
VARIANT = bioscript.variant(
    ${variantKwargs.join(',\n    ')},
)

PLAN = bioscript.query_plan([VARIANT])

def main():
    store = bioscript.load_genotypes(input_file)
    calls = store.lookup_variants(PLAN)
    genotype = calls[0] if calls else None
    row = {
        "rsid": ${JSON.stringify(rsids[0])},
        "gene": ${JSON.stringify(gene)},
        "assay": ${JSON.stringify(name)},
        "grch37": ${JSON.stringify(grch37 ?? '')},
        "grch38": ${JSON.stringify(grch38 ?? '')},
        "ref": ${JSON.stringify(ref)},
        "alt": ${JSON.stringify(alt)},
        "genotype": genotype if genotype else "not found",
    }
    bioscript.write_tsv(output_file, [row])

main()
`
}

// === Screen =================================================================

// ts-prune-ignore-next
export default function AssayLabScreen() {
	const [catalog, setCatalog] = useState<CatalogItem[]>([])
	const [selectedAssayId, setSelectedAssayId] = useState<string | null>(null)
	const [selectedGenomeId, setSelectedGenomeId] = useState<string | null>(null)
	const [selectedReferenceId, setSelectedReferenceId] = useState<string | null>(null)
	const [runs, setRuns] = useState<RunRecord[]>([])
	const [dragActive, setDragActive] = useState(false)
	const [bioscriptAvailable, setBioscriptAvailable] = useState(false)
	const [savedDocs, setSavedDocs] = useState<HomeImportedDocument[]>([])

	const assays = useMemo(() => catalog.filter((c) => c.kind === 'assay'), [catalog])
	const genomes = useMemo(() => catalog.filter((c) => c.kind === 'genome'), [catalog])
	const alignments = useMemo(() => catalog.filter((c) => c.kind === 'alignment'), [catalog])
	const references = useMemo(() => catalog.filter((c) => c.kind === 'reference'), [catalog])
	const unknowns = useMemo(() => catalog.filter((c) => c.kind === 'unknown'), [catalog])

	const selectedAssay = useMemo(
		() => catalog.find((c) => c.id === selectedAssayId) ?? null,
		[catalog, selectedAssayId],
	)
	const selectedGenome = useMemo(
		() => catalog.find((c) => c.id === selectedGenomeId) ?? null,
		[catalog, selectedGenomeId],
	)
	const selectedReference = useMemo(
		() => catalog.find((c) => c.id === selectedReferenceId) ?? null,
		[catalog, selectedReferenceId],
	)
	const selectedIsAlignment = selectedGenome?.kind === 'alignment'

	useEffect(() => {
		setBioscriptAvailable(isBioscriptAvailable())
	}, [])

	useEffect(() => {
		void loadHomeImportState()
			.then((state) =>
				setSavedDocs(state.importedDocuments.filter((d) => d.id !== 'biovault-sample-data')),
			)
			.catch(() => setSavedDocs([]))
	}, [])

	// Add a file to the catalogue. Zips become genomes after unzip; everything
	// else is classified by extension. Never replaces existing entries.
	const addFile = useCallback(
		async (file: File, opts: { sourceName?: string } = {}): Promise<CatalogItem | null> => {
			const lower = file.name.toLowerCase()
			if (isAssay(file.name)) {
				const contents = await file.text()
				const item: CatalogItem = {
					id: makeId('assay'),
					name: file.name,
					kind: 'assay',
					language: detectLanguage(file.name),
					contents,
					sizeBytes: file.size,
					addedAt: Date.now(),
					sourceName: opts.sourceName,
				}
				setCatalog((prev) => [...prev, item])
				setSelectedAssayId((current) => current ?? item.id)
				return item
			}
			if (isGenomeText(file.name)) {
				const contents = await file.text()
				const item: CatalogItem = {
					id: makeId('genome'),
					name: file.name,
					kind: 'genome',
					contents,
					sizeBytes: file.size,
					addedAt: Date.now(),
					sourceName: opts.sourceName,
				}
				setCatalog((prev) => [...prev, item])
				setSelectedGenomeId((current) => current ?? item.id)
				return item
			}
			if (isAlignment(file.name)) {
				const item: CatalogItem = {
					id: makeId('alignment'),
					name: file.name,
					kind: 'alignment',
					contents: '',
					sizeBytes: file.size,
					addedAt: Date.now(),
					sourceName: opts.sourceName,
					file,
				}
				setCatalog((prev) => [...prev, item])
				setSelectedGenomeId((current) => current ?? item.id)
				return item
			}
			if (isReference(file.name)) {
				const item: CatalogItem = {
					id: makeId('reference'),
					name: file.name,
					kind: 'reference',
					contents: '',
					sizeBytes: file.size,
					addedAt: Date.now(),
					sourceName: opts.sourceName,
					file,
				}
				setCatalog((prev) => [...prev, item])
				return item
			}
			if (lower.endsWith('.zip')) {
				const extracted = await extractGenomeTextFromZip(file)
				if (!extracted) {
					const item: CatalogItem = {
						id: makeId('unknown'),
						name: file.name,
						kind: 'unknown',
						contents: '',
						sizeBytes: file.size,
						addedAt: Date.now(),
					}
					setCatalog((prev) => [...prev, item])
					return item
				}
				const item: CatalogItem = {
					id: makeId('genome'),
					name: `${file.name} · ${extracted.entryName}`,
					kind: 'genome',
					contents: extracted.contents,
					sizeBytes: extracted.contents.length,
					addedAt: Date.now(),
					sourceName: file.name,
				}
				setCatalog((prev) => [...prev, item])
				setSelectedGenomeId((current) => current ?? item.id)
				return item
			}
			const item: CatalogItem = {
				id: makeId('unknown'),
				name: file.name,
				kind: 'unknown',
				contents: '',
				sizeBytes: file.size,
				addedAt: Date.now(),
			}
			setCatalog((prev) => [...prev, item])
			return item
		},
		[],
	)

	// Window-level drop listener: any file dropped anywhere goes into the
	// catalogue. Never replaces selections.
	useEffect(() => {
		if (Platform.OS !== 'web') return
		let depth = 0
		const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
		const stop = (e: Event) => {
			e.preventDefault()
			e.stopPropagation()
		}
		const onEnter = (e: DragEvent) => {
			if (!hasFiles(e)) return
			stop(e)
			depth += 1
			setDragActive(true)
		}
		const onOver = (e: DragEvent) => {
			if (!hasFiles(e)) return
			stop(e)
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
		}
		const onLeave = (e: DragEvent) => {
			if (!hasFiles(e)) return
			stop(e)
			depth = Math.max(0, depth - 1)
			if (depth === 0) setDragActive(false)
		}
		const onDrop = async (e: DragEvent) => {
			const files = Array.from(e.dataTransfer?.files ?? [])
			stop(e)
			depth = 0
			setDragActive(false)
			for (const f of files) await addFile(f)
		}
		window.addEventListener('dragenter', onEnter)
		window.addEventListener('dragover', onOver)
		window.addEventListener('dragleave', onLeave)
		window.addEventListener('drop', onDrop)
		return () => {
			window.removeEventListener('dragenter', onEnter)
			window.removeEventListener('dragover', onOver)
			window.removeEventListener('dragleave', onLeave)
			window.removeEventListener('drop', onDrop)
		}
	}, [addFile])

	const openPicker = useCallback(() => {
		if (Platform.OS !== 'web') return
		const input = document.createElement('input')
		input.type = 'file'
		input.multiple = true
		input.accept = '.py,.yaml,.yml,.txt,.tsv,.csv,.vcf,.zip'
		input.style.display = 'none'
		input.onchange = async () => {
			const files = Array.from(input.files ?? [])
			document.body.removeChild(input)
			for (const f of files) await addFile(f)
		}
		document.body.appendChild(input)
		input.click()
	}, [addFile])

	const addFromSaved = useCallback(
		async (doc: HomeImportedDocument) => {
			const originalName = doc.originalName || doc.name
			const lower = originalName.toLowerCase()
			const isContainerLike =
				lower.endsWith('.zip') || lower.endsWith('.gz') || lower.endsWith('.bz2')
			try {
				// Non-text / zip-like files must use the live FileSystemFileHandle so we
				// read the real bytes from disk. Inline contents at import time might
				// have been stashed for small-text files only — rebuilding a File from
				// a string for a zip would make fflate see utf-8 garbage.
				if (Platform.OS === 'web' && isContainerLike) {
					const handles = await getHandles(doc.id)
					if (!handles?.primary) {
						// eslint-disable-next-line no-console
						console.warn('[assay-lab] no handle for saved container', { id: doc.id, originalName })
						return
					}
					const state = await ensurePermission(handles.primary)
					if (state !== 'granted') {
						// eslint-disable-next-line no-console
						console.warn('[assay-lab] handle permission not granted', { state, originalName })
						return
					}
					const file = (await handles.primary.getFile()) as unknown as File
					await addFile(file, { sourceName: doc.originalName })
					return
				}
				// Inline-text path: fine for .py/.yaml/.txt/.vcf that got inlined.
				if (doc.contents) {
					const file = new File([doc.contents], originalName)
					await addFile(file, { sourceName: doc.originalName })
					return
				}
				// No inline contents AND not a container — fall back to handle if any.
				if (Platform.OS === 'web') {
					const handles = await getHandles(doc.id)
					if (handles?.primary) {
						const state = await ensurePermission(handles.primary)
						if (state === 'granted') {
							const file = (await handles.primary.getFile()) as unknown as File
							await addFile(file, { sourceName: doc.originalName })
							return
						}
					}
				}
			} catch (err) {
				// eslint-disable-next-line no-console
				console.warn('[assay-lab] addFromSaved failed', { originalName, err })
			}
		},
		[addFile],
	)

	const removeItem = useCallback(
		(id: string) => {
			setCatalog((prev) => prev.filter((c) => c.id !== id))
			setSelectedAssayId((curr) => (curr === id ? null : curr))
			setSelectedGenomeId((curr) => (curr === id ? null : curr))
			setSelectedReferenceId((curr) => (curr === id ? null : curr))
		},
		[],
	)

	const run = useCallback(async () => {
		if (!selectedAssay || !selectedGenome) return
		if (selectedGenome.kind === 'alignment') {
			setRuns((prev) => [
				{
					id: makeId('run'),
					ranAt: Date.now(),
					assayId: selectedAssay.id,
					assayName: selectedAssay.name,
					genomeId: selectedGenome.id,
					genomeName: selectedGenome.name,
					status: 'error',
					error:
						'CRAM/BAM runs aren\'t wired to the web lab yet. The Rust parser (bioscript-formats + noodles) needs to be compiled to WASM alongside Monty and loaded from ExpoBioscriptWebRuntime.ts. For now this works on native/desktop only.',
					durationMs: 0,
				},
				...prev,
			])
			return
		}
		const runId = makeId('run')
		const startedAt = Date.now()
		setRuns((prev) => [
			{
				id: runId,
				ranAt: startedAt,
				assayId: selectedAssay.id,
				assayName: selectedAssay.name,
				genomeId: selectedGenome.id,
				genomeName: selectedGenome.name,
				status: 'running',
			},
			...prev,
		])
		try {
			let scriptPath = selectedAssay.name
			let scriptContents = selectedAssay.contents
			if (selectedAssay.language === 'yaml') {
				scriptPath = selectedAssay.name.replace(/\.ya?ml$/i, '.py')
				scriptContents = compileVariantYamlToPython(selectedAssay.contents)
			}
			const result = await runFile({
				scriptPath,
				scriptContents,
				inputFile: selectedGenome.name,
				inputContents: selectedGenome.contents,
				outputFile: 'assay-output.tsv',
				inputFormat: 'text',
				maxDurationMs: 180_000,
				maxMemoryBytes: 128 * 1024 * 1024,
				maxAllocations: 1_000_000,
				maxRecursionDepth: 512,
			})
			const outputText = result.outputText ?? result.outputFiles?.['assay-output.tsv'] ?? ''
			setRuns((prev) =>
				prev.map((r) =>
					r.id === runId
						? {
							...r,
							status: 'done',
							outputText,
							outputFiles: result.outputFiles ?? {},
							durationMs: Date.now() - startedAt,
						}
						: r,
				),
			)
		} catch (err) {
			setRuns((prev) =>
				prev.map((r) =>
					r.id === runId
						? {
							...r,
							status: 'error',
							error: err instanceof Error ? err.message : String(err),
							durationMs: Date.now() - startedAt,
						}
						: r,
				),
			)
		}
	}, [selectedAssay, selectedGenome])

	const canRun = !!selectedAssay && !!selectedGenome && !runs.some((r) => r.status === 'running')

	return (
		<SafeAreaView style={styles.safeArea} edges={['top']}>
			{Platform.OS === 'web' && dragActive ? (
				<View style={styles.dragOverlay} pointerEvents="none">
					<View style={styles.dragOverlayInner}>
						<OMText variant="h3" style={styles.dragOverlayTitle}>
							Drop anywhere to add
						</OMText>
						<OMText variant="body" style={styles.dragOverlayBody}>
							We&rsquo;ll sort it into assays or genomes — your existing picks stay put.
						</OMText>
					</View>
				</View>
			) : null}

			<ScrollView contentContainerStyle={styles.content}>
				<View style={styles.header}>
					<Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
						<OMText variant="subtitle" style={styles.back}>
							← Back
						</OMText>
					</Pressable>
					<OMText variant="h3" style={styles.title}>
						Assay lab
					</OMText>
					<OMText variant="body" style={styles.body}>
						Drop files (anywhere) to build up a catalogue of assays and genomes. Pick one
						of each and run — everything you dropped earlier stays in the catalogue.
					</OMText>
					{!bioscriptAvailable && Platform.OS === 'web' ? (
						<View style={styles.warningCard}>
							<OMText variant="body" style={styles.warningText}>
								Bioscript web runtime unavailable — page needs `SharedArrayBuffer` and
								cross-origin isolation.
							</OMText>
						</View>
					) : null}
				</View>

				<View style={[styles.dropArea, dragActive ? styles.dropAreaActive : null]} testID="assay-lab-drop">
					<OMText variant="headline" style={styles.dropTitle}>
						Add files to the catalogue
					</OMText>
					<OMText variant="body" style={styles.dropBody}>
						Drop .py / .yaml assays and .txt / .vcf / .zip genomes. You can also open
						a system picker or pull in a saved file from Home.
					</OMText>
					<View style={styles.buttonRow}>
						<Pressable onPress={openPicker} style={styles.pickButton} testID="assay-lab-open-picker">
							<OMText variant="subtitle" style={styles.pickButtonText}>
								Choose files
							</OMText>
						</Pressable>
						{savedDocs.length > 0 ? (
							<View style={styles.savedPickerInline}>
								<OMText variant="caption" style={styles.slotLabel}>
									SAVED
								</OMText>
								{savedDocs.slice(0, 5).map((doc) => (
									<Pressable
										key={doc.id}
										onPress={() => void addFromSaved(doc)}
										style={styles.savedChip}
									>
										<OMText variant="subtitle" style={styles.pickButtonText}>
											+ {doc.name}
										</OMText>
									</Pressable>
								))}
							</View>
						) : null}
					</View>
				</View>

				<View style={styles.columns}>
					<CatalogColumn
						title="Assays"
						emptyText="No assays yet — drop a .py or .yaml"
						items={assays}
						selectedId={selectedAssayId}
						onSelect={setSelectedAssayId}
						onRemove={removeItem}
						testID="catalog-assays"
					/>
					<CatalogColumn
						title="Genotype text"
						emptyText="No genomes yet — drop a .txt, .vcf, or .zip"
						items={genomes}
						selectedId={selectedGenomeId}
						onSelect={setSelectedGenomeId}
						onRemove={removeItem}
						testID="catalog-genomes"
					/>
				</View>

				{(alignments.length > 0 || references.length > 0) ? (
					<View style={styles.columns}>
						<CatalogColumn
							title="Alignments"
							emptyText="No BAM/CRAM alignments"
							items={alignments}
							selectedId={selectedGenomeId}
							onSelect={(id) => {
								setSelectedGenomeId(id)
							}}
							onRemove={removeItem}
							testID="catalog-alignments"
						/>
						<CatalogColumn
							title="References"
							emptyText="No FASTA references"
							items={references}
							selectedId={selectedReferenceId}
							onSelect={setSelectedReferenceId}
							onRemove={removeItem}
							testID="catalog-references"
						/>
					</View>
				) : null}

				{selectedIsAlignment ? (
					<View style={styles.warningCard}>
						<OMText variant="body" style={styles.warningText}>
							Alignment selected. On web this will fail with a clear error — the Rust
							CRAM/BAM parser (bioscript-formats + noodles) isn&rsquo;t compiled to WASM yet.
							Native/desktop builds already run these.
							{selectedReference
								? `\nReference paired: ${selectedReference.name}`
								: '\nDrop a matching .fa/.fasta so we can pair it when WASM lands.'}
						</OMText>
					</View>
				) : null}

				{unknowns.length > 0 ? (
					<View style={styles.unknownCard}>
						<OMText variant="caption" style={styles.slotLabel}>
							UNRECOGNISED
						</OMText>
						{unknowns.map((item) => (
							<View key={item.id} style={styles.unknownRow}>
								<OMText variant="body" style={styles.unknownName}>
									{item.name}
								</OMText>
								<Pressable onPress={() => removeItem(item.id)} style={styles.secondaryButton}>
									<OMText variant="subtitle" style={styles.pickButtonText}>
										Remove
									</OMText>
								</Pressable>
							</View>
						))}
					</View>
				) : null}

				{selectedAssay ? (
					<CodeBlock code={selectedAssay.contents} language={selectedAssay.language ?? 'python'} />
				) : null}

				<View style={styles.runRow}>
					<OMText variant="caption" style={styles.runHint}>
						{selectedAssay && selectedGenome
							? `Ready: ${selectedAssay.name} × ${selectedGenome.name}`
							: 'Select one assay and one genome to run.'}
					</OMText>
					<Pressable
						onPress={() => void run()}
						disabled={!canRun}
						style={[styles.runButton, !canRun && styles.runButtonDisabled]}
						testID="assay-lab-run"
					>
						<OMText variant="subtitle" style={styles.runButtonText}>
							{runs.some((r) => r.status === 'running') ? 'Running…' : 'Run assay'}
						</OMText>
					</Pressable>
				</View>

				{runs.length > 0 ? (
					<View style={styles.runsSection}>
						<OMText variant="caption" style={styles.slotLabel}>
							RUNS
						</OMText>
						{runs.map((r) => (
							<RunCard key={r.id} run={r} />
						))}
					</View>
				) : null}
			</ScrollView>
		</SafeAreaView>
	)
}

// === Sub-components =========================================================

function CatalogColumn({
	title,
	emptyText,
	items,
	selectedId,
	onSelect,
	onRemove,
	testID,
}: {
	title: string
	emptyText: string
	items: CatalogItem[]
	selectedId: string | null
	onSelect: (id: string) => void
	onRemove: (id: string) => void
	testID?: string
}) {
	return (
		<View style={styles.column} testID={testID}>
			<OMText variant="caption" style={styles.slotLabel}>
				{title.toUpperCase()} · {items.length}
			</OMText>
			{items.length === 0 ? (
				<View style={styles.emptyCol}>
					<OMText variant="body" style={styles.emptyText}>
						{emptyText}
					</OMText>
				</View>
			) : (
				items.map((item) => {
					const selected = item.id === selectedId
					return (
						<Pressable
							key={item.id}
							onPress={() => onSelect(item.id)}
							style={[styles.catalogItem, selected ? styles.catalogItemSelected : null]}
						>
							<View style={{ flex: 1 }}>
								<OMText variant="subtitle" style={styles.catalogItemName}>
									{selected ? '● ' : '○ '}
									{item.name}
								</OMText>
								<OMText variant="caption" style={styles.catalogItemMeta}>
									{item.language ? `${item.language.toUpperCase()} · ` : ''}
									{formatBytes(item.sizeBytes)}
								</OMText>
							</View>
							<Pressable
								onPress={(e) => {
									e.stopPropagation()
									onRemove(item.id)
								}}
								style={styles.catalogRemove}
							>
								<OMText variant="caption" style={styles.catalogRemoveText}>
									✕
								</OMText>
							</Pressable>
						</Pressable>
					)
				})
			)}
		</View>
	)
}

function RunCard({ run }: { run: RunRecord }) {
	return (
		<View
			style={[styles.runCard, run.status === 'error' ? styles.runCardError : null]}
			testID={`run-card-${run.status}`}
		>
			<View style={styles.runHeader}>
				<OMText variant="subtitle" style={styles.runTitle}>
					{run.assayName} × {run.genomeName}
				</OMText>
				<OMText variant="caption" style={styles.runMeta}>
					{run.status === 'running'
						? 'running…'
						: run.status === 'error'
							? 'failed'
							: `ok · ${run.durationMs ?? '?'} ms`}
				</OMText>
			</View>
			{run.status === 'error' ? (
				<OMText variant="body" style={styles.runError}>
					{run.error}
				</OMText>
			) : null}
			{run.status === 'done' && run.outputText ? <TsvTable text={run.outputText} /> : null}
			{run.status === 'done' && !run.outputText ? (
				<OMText variant="body" style={styles.runError}>
					(no output produced)
				</OMText>
			) : null}
		</View>
	)
}

function CodeBlock({ code, language }: { code: string; language: AssayLanguage }) {
	if (Platform.OS !== 'web') {
		return (
			<View style={styles.codeBlock}>
				<OMText variant="body" style={styles.codeText}>
					{code}
				</OMText>
			</View>
		)
	}
	return <WebCodeBlock code={code} language={language} />
}

function WebCodeBlock({ code, language }: { code: string; language: AssayLanguage }) {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const mod = require('prism-react-renderer') as typeof import('prism-react-renderer')
	const { Highlight, themes } = mod
	const prismLang = language === 'yaml' ? 'yaml' : 'python'
	return (
		<View style={styles.codeBlock}>
			<Highlight theme={themes.vsDark} code={code} language={prismLang}>
				{({ tokens, getLineProps, getTokenProps }) => {
					const rendered = (
						<pre
							style={{
								margin: 0,
								background: 'transparent',
								fontFamily:
									'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
								fontSize: 13,
								lineHeight: '1.55em',
								maxHeight: 420,
								overflow: 'auto',
								color: '#d4d4d4',
							}}
						>
							{tokens.map((line, i) => {
								const { key: _k, ...lineProps } = getLineProps({ line, key: i })
								return (
									<div key={i} {...lineProps}>
										{line.map((token, j) => {
											const { key: _tk, ...tokenProps } = getTokenProps({ token, key: j })
											return <span key={j} {...tokenProps} />
										})}
									</div>
								)
							})}
						</pre>
					)
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					return rendered as any
				}}
			</Highlight>
		</View>
	)
}

function TsvTable({ text }: { text: string }) {
	const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
	if (lines.length === 0) return null
	const rows = lines.map((line) => line.split('\t'))
	const [header, ...body] = rows
	if (!header) return null
	return (
		<View style={styles.tableCard}>
			<View style={styles.tableRowHeader}>
				{header.map((cell, i) => (
					<OMText key={i} variant="caption" style={styles.tableHeaderCell}>
						{cell}
					</OMText>
				))}
			</View>
			{body.map((row, r) => (
				<View key={r} style={styles.tableRow}>
					{row.map((cell, c) => (
						<OMText key={c} variant="body" style={styles.tableCell}>
							{cell}
						</OMText>
					))}
				</View>
			))}
		</View>
	)
}

function formatBytes(n: number): string {
	if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} GB`
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)} KB`
	return `${n} B`
}

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: omColors.grayscale850 },
	content: { padding: omSpacing.xl, gap: omSpacing.xl, paddingBottom: omSpacing.xxxl },
	header: { gap: omSpacing.s },
	back: { color: omTheme.accent },
	title: { color: omTheme.primaryText },
	body: { color: omColors.grayscale300, maxWidth: 640 },
	warningCard: {
		padding: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,200,50,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(255,200,50,0.3)',
	},
	warningText: { color: '#ffd36b' },
	dropArea: {
		padding: omSpacing.xl,
		borderRadius: omRadius.l,
		borderWidth: 2,
		borderStyle: 'dashed',
		borderColor: 'rgba(255,255,255,0.22)',
		backgroundColor: omColors.grayscale750,
		gap: omSpacing.m,
	},
	dropAreaActive: {
		borderColor: omTheme.accent,
		backgroundColor: 'rgba(83,190,169,0.08)',
	},
	dropTitle: { color: omTheme.primaryText },
	dropBody: { color: omColors.grayscale400 },
	buttonRow: { flexDirection: 'row', gap: omSpacing.s, alignItems: 'center', flexWrap: 'wrap' },
	pickButton: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(83,190,169,0.14)',
		borderWidth: 1,
		borderColor: 'rgba(83,190,169,0.28)',
	},
	pickButtonText: { color: omTheme.accent },
	savedPickerInline: {
		flexDirection: 'row',
		gap: omSpacing.s,
		alignItems: 'center',
		flexWrap: 'wrap',
	},
	savedChip: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.xs,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(255,255,255,0.06)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.12)',
	},
	secondaryButton: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(255,255,255,0.06)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.12)',
	},
	columns: { flexDirection: 'row', gap: omSpacing.l, flexWrap: 'wrap' },
	column: {
		flex: 1,
		minWidth: 260,
		gap: omSpacing.s,
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
	},
	slotLabel: { color: omColors.grayscale500, letterSpacing: 0.8 },
	emptyCol: {
		padding: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,255,255,0.02)',
	},
	emptyText: { color: omColors.grayscale500 },
	catalogItem: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: omSpacing.m,
		padding: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,255,255,0.03)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.06)',
	},
	catalogItemSelected: {
		borderColor: 'rgba(83,190,169,0.45)',
		backgroundColor: 'rgba(83,190,169,0.08)',
	},
	catalogItemName: { color: omTheme.primaryText },
	catalogItemMeta: { color: omColors.grayscale500, marginTop: 2 },
	catalogRemove: {
		paddingHorizontal: omSpacing.s,
		paddingVertical: omSpacing.xs,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(255,255,255,0.04)',
	},
	catalogRemoveText: { color: omColors.grayscale400 },
	unknownCard: {
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,200,50,0.25)',
		gap: omSpacing.s,
	},
	unknownRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.m,
	},
	unknownName: { color: omColors.grayscale300, flex: 1 },
	codeBlock: {
		padding: omSpacing.m,
		borderRadius: omRadius.l,
		backgroundColor: '#17181d',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	codeText: { color: omColors.grayscale300, fontSize: 12 },
	runRow: { flexDirection: 'row', alignItems: 'center', gap: omSpacing.m, justifyContent: 'flex-end', flexWrap: 'wrap' },
	runHint: { color: omColors.grayscale400, flex: 1, minWidth: 180 },
	runButton: {
		paddingHorizontal: omSpacing.xl,
		paddingVertical: omSpacing.m,
		borderRadius: omRadius.full,
		backgroundColor: omTheme.accent,
	},
	runButtonDisabled: { opacity: 0.4 },
	runButtonText: { color: omColors.grayscale850 },
	runsSection: { gap: omSpacing.s },
	runCard: {
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		gap: omSpacing.s,
	},
	runCardError: { borderColor: 'rgba(255,107,107,0.3)', backgroundColor: 'rgba(255,107,107,0.05)' },
	runHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: omSpacing.m },
	runTitle: { color: omTheme.primaryText, flex: 1 },
	runMeta: { color: omColors.grayscale500 },
	runError: { color: '#ffb2b2' },
	tableCard: {
		borderRadius: omRadius.l,
		backgroundColor: 'rgba(255,255,255,0.03)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
		overflow: 'hidden',
	},
	tableRowHeader: {
		flexDirection: 'row',
		gap: omSpacing.m,
		padding: omSpacing.s,
		backgroundColor: 'rgba(255,255,255,0.04)',
		borderBottomWidth: 1,
		borderBottomColor: 'rgba(255,255,255,0.08)',
	},
	tableHeaderCell: { color: omColors.grayscale400, minWidth: 80, flex: 1 },
	tableRow: {
		flexDirection: 'row',
		gap: omSpacing.m,
		padding: omSpacing.s,
		borderBottomWidth: 1,
		borderBottomColor: 'rgba(255,255,255,0.05)',
	},
	tableCell: { color: omColors.grayscale00, minWidth: 80, flex: 1, fontSize: 13 },
	dragOverlay: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		...(Platform.OS === 'web' ? ({ position: 'fixed' } as object) : null),
		backgroundColor: 'rgba(5, 15, 20, 0.72)',
		alignItems: 'center',
		justifyContent: 'center',
		zIndex: 9999,
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
	dragOverlayTitle: { color: omTheme.accent, textAlign: 'center' },
	dragOverlayBody: { color: '#ffffff', textAlign: 'center' },
})
