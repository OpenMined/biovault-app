// Unified Bioscript lab — drop any mix of genomic files + assay scripts, pick
// a genome and an assay, and run. Heavy parsing happens inside the
// bioscript-wasm Web Worker (CRAM / VCF variant lookups) or Monty's
// WASI runtime (genotype-text + Python/YAML assays).

import { OMText } from '@/components/ui/OMText'
import {
	isBioscriptAvailable,
	lookupCramVariants,
	lookupVcfVariants,
	runFile,
	type GenomeDescriptor,
	type VariantObservation,
	type VariantSpec,
} from '@/modules/expo-bioscript'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { unzipSync } from 'fflate'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import YAML from 'yaml'

// === File classification ====================================================

type FileKind =
	| 'cram'
	| 'crai'
	| 'fasta'
	| 'fai'
	| 'vcf_gz'
	| 'tbi'
	| 'genotype_text'
	| 'zip'
	| 'assay_python'
	| 'assay_yaml'
	| 'unknown'

function classify(name: string): FileKind {
	const lower = name.toLowerCase()
	if (lower.endsWith('.cram.crai') || lower.endsWith('.crai')) return 'crai'
	if (lower.endsWith('.cram')) return 'cram'
	if (lower.endsWith('.vcf.gz.tbi') || lower.endsWith('.tbi')) return 'tbi'
	if (lower.endsWith('.vcf.gz') || lower.endsWith('.vcf.bgz')) return 'vcf_gz'
	if (lower.endsWith('.fa.fai') || lower.endsWith('.fasta.fai')) return 'fai'
	if (lower.endsWith('.fa') || lower.endsWith('.fasta')) return 'fasta'
	if (lower.endsWith('.py')) return 'assay_python'
	if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'assay_yaml'
	if (lower.endsWith('.zip')) return 'zip'
	if (
		lower.endsWith('.txt') ||
		lower.endsWith('.tsv') ||
		lower.endsWith('.csv') ||
		lower.endsWith('.vcf')
	) {
		return 'genotype_text'
	}
	return 'unknown'
}

function stripGenomeSuffix(name: string): string {
	// Used for pairing: NA06985.final.cram ↔ NA06985.final.cram.crai should share
	// the same stem. Strip the companion-index suffix so the stems line up.
	const lower = name.toLowerCase()
	if (lower.endsWith('.cram.crai')) return name.slice(0, -5) // keep .cram
	if (lower.endsWith('.crai')) return name.slice(0, -5)
	if (lower.endsWith('.vcf.gz.tbi')) return name.slice(0, -4) // keep .vcf.gz
	if (lower.endsWith('.tbi')) return name.slice(0, -4)
	if (lower.endsWith('.fa.fai')) return name.slice(0, -4) // keep .fa
	if (lower.endsWith('.fasta.fai')) return name.slice(0, -4) // keep .fasta
	if (lower.endsWith('.fai')) return name.slice(0, -4)
	return name
}

// === Data model =============================================================

type CramGenome = {
	id: string
	kind: 'cram'
	primary: File // the .cram
	crai?: File
	fasta?: File
	fai?: File
}

type VcfGenome = {
	id: string
	kind: 'vcf'
	primary: File // the .vcf.gz
	tbi?: File
}

type TextGenome = {
	id: string
	kind: 'text'
	primary: File
}

type ZipGenome = {
	id: string
	kind: 'zip'
	primary: File
}

type Genome = CramGenome | VcfGenome | TextGenome | ZipGenome

type AssayLang = 'python' | 'yaml'
type Assay = {
	id: string
	name: string
	file: File
	language: AssayLang
}

type UnknownEntry = { id: string; file: File }

function genomeDisplayName(g: Genome): string {
	return g.primary.name
}

function genomeKindLabel(g: Genome): string {
	switch (g.kind) {
		case 'cram': return 'CRAM alignment'
		case 'vcf': return 'VCF (bgzipped, tabix-indexed)'
		case 'text': return 'Genotype text'
		case 'zip': return 'Zipped genotype (23andMe etc.)'
	}
}

function missingSlots(g: Genome): string[] {
	if (g.kind === 'cram') {
		const missing: string[] = []
		if (!g.crai) missing.push('.cram.crai index')
		if (!g.fasta) missing.push('reference .fa')
		if (!g.fai) missing.push('.fa.fai index')
		return missing
	}
	if (g.kind === 'vcf') {
		return g.tbi ? [] : ['.vcf.gz.tbi index']
	}
	return []
}

function isGenomeComplete(g: Genome): boolean {
	return missingSlots(g).length === 0
}

function genomeBytesTotal(g: Genome): number {
	if (g.kind === 'cram') {
		return (
			g.primary.size +
			(g.crai?.size ?? 0) +
			(g.fasta?.size ?? 0) +
			(g.fai?.size ?? 0)
		)
	}
	if (g.kind === 'vcf') {
		return g.primary.size + (g.tbi?.size ?? 0)
	}
	return g.primary.size
}

function humanSize(bytes: number): string {
	if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`
	if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
	if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`
	return `${bytes} B`
}

function makeId(prefix: string) {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// === YAML variant compile (JS side for now; a Rust-native wasm export is
// on the migration backlog). Produces a VariantSpec[] from a
// bioscript:variant:1.0 YAML document.

function compileVariantYamlToSpecs(yamlText: string): VariantSpec[] {
	const doc = YAML.parse(yamlText) as Record<string, unknown> | null
	if (!doc) throw new Error('empty YAML document')
	const schema = String(doc.schema ?? '')
	if (!schema.startsWith('bioscript:variant:')) {
		throw new Error(`unsupported YAML schema "${schema}" — expected bioscript:variant:1.0`)
	}
	const name = String(doc.name ?? 'variant')
	const rsids: string[] = Array.isArray((doc.identifiers as { rsids?: unknown })?.rsids)
		? ((doc.identifiers as { rsids: unknown[] }).rsids as unknown[]).map((v) => String(v))
		: []
	const alleles = (doc.alleles ?? {}) as Record<string, unknown>
	const ref = String(alleles.ref ?? '')
	const alts = Array.isArray(alleles.alts) ? (alleles.alts as unknown[]).map((v) => String(v)) : []
	const alt = alts[0] ?? ''
	if (!ref || !alt) {
		throw new Error(`YAML assay "${name}" missing alleles.ref or alleles.alts`)
	}
	const coords = (doc.coordinates ?? {}) as Record<string, { chrom?: unknown; pos?: unknown }>
	const pickCoord = (c: { chrom?: unknown; pos?: unknown } | undefined) => {
		if (!c) return null
		const chrom = String(c.chrom ?? '').trim()
		const pos =
			typeof c.pos === 'number' ? c.pos : Number.parseInt(String(c.pos ?? ''), 10)
		if (!chrom || !Number.isFinite(pos)) return null
		return { chrom, pos }
	}
	const grch38 = pickCoord(coords.grch38)
	const grch37 = pickCoord(coords.grch37)
	const specs: VariantSpec[] = []
	if (grch38) {
		specs.push({
			name,
			chrom: grch38.chrom,
			pos: grch38.pos,
			ref,
			alt,
			rsid: rsids[0],
			assembly: 'grch38',
		})
	}
	if (grch37) {
		specs.push({
			name: grch38 ? `${name}_grch37` : name,
			chrom: grch37.chrom,
			pos: grch37.pos,
			ref,
			alt,
			rsid: rsids[0],
			assembly: 'grch37',
		})
	}
	if (specs.length === 0) {
		throw new Error(`YAML assay "${name}" has no usable coordinates.grch37/grch38`)
	}
	return specs
}

async function extractTextFromZip(
	file: File,
): Promise<{ entryName: string; contents: string } | null> {
	const buf = new Uint8Array(await file.arrayBuffer())
	let unzipped: Record<string, Uint8Array>
	try {
		unzipped = unzipSync(buf)
	} catch {
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

// === Run record =============================================================

type RunStatus = 'idle' | 'running' | 'done' | 'error'
type RunResult = {
	status: RunStatus
	error?: string
	durationMs?: number
	observations?: VariantObservation[]
	textOutput?: string
}

// === Screen =================================================================

// ts-prune-ignore-next
export default function LabScreen() {
	const [genomes, setGenomes] = useState<Genome[]>([])
	const [assays, setAssays] = useState<Assay[]>([])
	const [unknowns, setUnknowns] = useState<UnknownEntry[]>([])
	const [selectedGenomeId, setSelectedGenomeId] = useState<string | null>(null)
	const [selectedAssayId, setSelectedAssayId] = useState<string | null>(null)
	const [run, setRun] = useState<RunResult>({ status: 'idle' })
	const [dragActive, setDragActive] = useState(false)
	const [bioscriptAvailable, setBioscriptAvailable] = useState(false)

	useEffect(() => {
		setBioscriptAvailable(isBioscriptAvailable())
	}, [])

	const ingest = useCallback((file: File) => {
		const kind = classify(file.name)
		if (kind === 'unknown') {
			setUnknowns((prev) => [...prev, { id: makeId('unk'), file }])
			return
		}
		if (kind === 'assay_python' || kind === 'assay_yaml') {
			const assay: Assay = {
				id: makeId('assay'),
				name: file.name,
				file,
				language: kind === 'assay_python' ? 'python' : 'yaml',
			}
			setAssays((prev) => [...prev, assay])
			setSelectedAssayId((current) => current ?? assay.id)
			return
		}
		if (kind === 'cram') {
			const g: CramGenome = { id: makeId('cram'), kind: 'cram', primary: file }
			setGenomes((prev) => [...prev, g])
			setSelectedGenomeId((current) => current ?? g.id)
			return
		}
		if (kind === 'vcf_gz') {
			const g: VcfGenome = { id: makeId('vcf'), kind: 'vcf', primary: file }
			setGenomes((prev) => [...prev, g])
			setSelectedGenomeId((current) => current ?? g.id)
			return
		}
		if (kind === 'genotype_text') {
			const g: TextGenome = { id: makeId('text'), kind: 'text', primary: file }
			setGenomes((prev) => [...prev, g])
			setSelectedGenomeId((current) => current ?? g.id)
			return
		}
		if (kind === 'zip') {
			const g: ZipGenome = { id: makeId('zip'), kind: 'zip', primary: file }
			setGenomes((prev) => [...prev, g])
			setSelectedGenomeId((current) => current ?? g.id)
			return
		}
		// Companion indices / reference files — try to pair with existing genomes.
		setGenomes((prev) => {
			const stem = stripGenomeSuffix(file.name).toLowerCase()
			const next = prev.map((g) => ({ ...g }))
			// 1) Try a name-stem match first for tight companion pairs.
			if (kind === 'crai') {
				const target =
					next.find(
						(g) => g.kind === 'cram' && g.primary.name.toLowerCase() === stem,
					) ?? next.find((g) => g.kind === 'cram' && !(g as CramGenome).crai)
				if (target && target.kind === 'cram') (target as CramGenome).crai = file
				return next
			}
			if (kind === 'tbi') {
				const target =
					next.find(
						(g) => g.kind === 'vcf' && g.primary.name.toLowerCase() === stem,
					) ?? next.find((g) => g.kind === 'vcf' && !(g as VcfGenome).tbi)
				if (target && target.kind === 'vcf') (target as VcfGenome).tbi = file
				return next
			}
			if (kind === 'fai') {
				// Match fai against whichever fasta it names; else fill the first
				// CRAM whose fai slot is still empty.
				const named = next.find(
					(g) =>
						g.kind === 'cram' &&
						(g as CramGenome).fasta?.name.toLowerCase() === stem,
				) as CramGenome | undefined
				if (named) {
					named.fai = file
					return next
				}
				for (const g of next) {
					if (g.kind === 'cram' && !(g as CramGenome).fai) {
						(g as CramGenome).fai = file
						return next
					}
				}
				return next
			}
			if (kind === 'fasta') {
				// A single .fa usually pairs with every CRAM in this session —
				// fill every CRAM that doesn't yet have a reference. That way
				// `foo.cram + bar.cram + ref.fa + ref.fa.fai` Just Works.
				for (const g of next) {
					if (g.kind === 'cram' && !(g as CramGenome).fasta) {
						(g as CramGenome).fasta = file
					}
				}
				return next
			}
			return next
		})
	}, [])

	const ingestMany = useCallback(
		(files: File[]) => {
			// Two passes — primaries first, indexes/ref second — so companion
			// pairing always finds its host genome regardless of drop order.
			const primaryFirst = [...files].sort((a, b) => {
				const ka = classify(a.name)
				const kb = classify(b.name)
				const primary = (k: FileKind) =>
					k === 'cram' || k === 'vcf_gz' || k === 'genotype_text' || k === 'zip'
				if (primary(ka) && !primary(kb)) return -1
				if (primary(kb) && !primary(ka)) return 1
				return 0
			})
			for (const f of primaryFirst) ingest(f)
		},
		[ingest],
	)

	useEffect(() => {
		if (Platform.OS !== 'web') return
		let depth = 0
		const hasFiles = (e: DragEvent) =>
			Array.from(e.dataTransfer?.types ?? []).includes('Files')
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
		const onDrop = (e: DragEvent) => {
			stop(e)
			depth = 0
			setDragActive(false)
			const files = Array.from(e.dataTransfer?.files ?? [])
			ingestMany(files)
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
	}, [ingestMany])

	const openPicker = useCallback(() => {
		if (Platform.OS !== 'web') return
		const input = document.createElement('input')
		input.type = 'file'
		input.multiple = true
		input.style.display = 'none'
		input.onchange = () => {
			const files = Array.from(input.files ?? [])
			ingestMany(files)
			document.body.removeChild(input)
		}
		document.body.appendChild(input)
		input.click()
	}, [ingestMany])

	const reset = useCallback(() => {
		setGenomes([])
		setAssays([])
		setUnknowns([])
		setSelectedGenomeId(null)
		setSelectedAssayId(null)
		setRun({ status: 'idle' })
	}, [])

	const removeGenome = useCallback((id: string) => {
		setGenomes((prev) => prev.filter((g) => g.id !== id))
		setSelectedGenomeId((curr) => (curr === id ? null : curr))
	}, [])

	const removeAssay = useCallback((id: string) => {
		setAssays((prev) => prev.filter((a) => a.id !== id))
		setSelectedAssayId((curr) => (curr === id ? null : curr))
	}, [])

	const removeUnknown = useCallback((id: string) => {
		setUnknowns((prev) => prev.filter((u) => u.id !== id))
	}, [])

	const selectedGenome = useMemo(
		() => genomes.find((g) => g.id === selectedGenomeId) ?? null,
		[genomes, selectedGenomeId],
	)
	const selectedAssay = useMemo(
		() => assays.find((a) => a.id === selectedAssayId) ?? null,
		[assays, selectedAssayId],
	)

	const runDisabledReason = useMemo<string | null>(() => {
		if (!selectedGenome) return 'Pick a genome above.'
		if (!selectedAssay) return 'Pick an assay above.'
		if (!isGenomeComplete(selectedGenome)) {
			return `Genome is missing: ${missingSlots(selectedGenome).join(', ')}`
		}
		// Python assays always need Monty (web runtime). YAML + CRAM/VCF uses
		// the wasm worker directly and doesn't need Monty at all.
		const needsMonty =
			selectedAssay.language === 'python' ||
			selectedGenome.kind === 'text' ||
			selectedGenome.kind === 'zip'
		if (needsMonty && !bioscriptAvailable) {
			return 'Bioscript web runtime unavailable (needs SharedArrayBuffer + cross-origin isolation).'
		}
		return null
	}, [bioscriptAvailable, selectedAssay, selectedGenome])

	const runBlocked = runDisabledReason !== null || run.status === 'running'

	const executeRun = useCallback(async () => {
		if (!selectedGenome || !selectedAssay) return
		setRun({ status: 'running' })
		const startedAt = Date.now()
		try {
			// --- YAML assay path ----------------------------------------------
			if (selectedAssay.language === 'yaml') {
				const yamlText = await selectedAssay.file.text()
				if (selectedGenome.kind === 'cram') {
					const g = selectedGenome
					if (!g.crai || !g.fasta || !g.fai) throw new Error('CRAM genome incomplete')
					const variants = compileVariantYamlToSpecs(yamlText)
					const craiBytes = new Uint8Array(await g.crai.arrayBuffer())
					const faiBytes = new Uint8Array(await g.fai.arrayBuffer())
					const result = await lookupCramVariants({
						cramFile: g.primary,
						craiBytes,
						fastaFile: g.fasta,
						faiBytes,
						variants,
					})
					setRun({
						status: 'done',
						durationMs: result.durationMs,
						observations: result.observations,
					})
					return
				}
				if (selectedGenome.kind === 'vcf') {
					const g = selectedGenome
					if (!g.tbi) throw new Error('VCF genome missing tabix index')
					const variants = compileVariantYamlToSpecs(yamlText)
					const tbiBytes = new Uint8Array(await g.tbi.arrayBuffer())
					const result = await lookupVcfVariants({
						vcfFile: g.primary,
						tbiBytes,
						variants,
					})
					setRun({
						status: 'done',
						durationMs: result.durationMs,
						observations: result.observations,
					})
					return
				}
				// Text / zip + YAML — run through Monty by compiling YAML to Python.
				const scriptName = selectedAssay.file.name.replace(/\.ya?ml$/i, '.py')
				const scriptContents = compileVariantYamlToPython(yamlText)
				const inputContents = await readGenomeText(selectedGenome)
				const result = await runFile({
					scriptPath: scriptName,
					scriptContents,
					inputFile: selectedGenome.primary.name,
					inputContents,
					outputFile: 'assay-output.tsv',
					inputFormat: 'text',
					maxDurationMs: 180_000,
					maxMemoryBytes: 128 * 1024 * 1024,
					maxAllocations: 1_000_000,
					maxRecursionDepth: 512,
				})
				const textOutput =
					result.outputText ?? result.outputFiles?.['assay-output.tsv'] ?? ''
				setRun({ status: 'done', durationMs: Date.now() - startedAt, textOutput })
				return
			}

			// --- Python assay path — works for text/zip (in-memory parser) AND
			// for VCF/CRAM via the Monty ↔ wasm-worker bridge. The Python
			// script sees a uniform `bioscript.load_genotypes(input_file)`
			// regardless of backend; the runtime dispatches based on the
			// genome descriptor we register under `input_file`.
			const scriptContents = await selectedAssay.file.text()
			const descriptor = await buildGenomeDescriptor(selectedGenome)
			const genomeKey = selectedGenome.primary.name

			const runRequest = {
				scriptPath: selectedAssay.file.name,
				scriptContents,
				inputFile: genomeKey,
				// Text/zip need legacy inputContents for read-path compatibility.
				inputContents:
					descriptor.kind === 'text' || descriptor.kind === 'zip'
						? descriptor.text
						: undefined,
				outputFile: 'assay-output.tsv',
				inputFormat: 'text' as const,
				genomes: { [genomeKey]: descriptor },
				maxDurationMs: 180_000,
				maxMemoryBytes: 128 * 1024 * 1024,
				maxAllocations: 1_000_000,
				maxRecursionDepth: 512,
			}
			const result = await runFile(runRequest)
			const textOutput = result.outputText ?? result.outputFiles?.['assay-output.tsv'] ?? ''
			setRun({ status: 'done', durationMs: Date.now() - startedAt, textOutput })
		} catch (err) {
			setRun({
				status: 'error',
				error: err instanceof Error ? err.message : String(err),
				durationMs: Date.now() - startedAt,
			})
		}
	}, [selectedAssay, selectedGenome])

	// === Render ==============================================================

	return (
		<SafeAreaView style={styles.safe} edges={['top']}>
			{Platform.OS === 'web' && dragActive ? (
				<View style={styles.dragOverlay} pointerEvents="none">
					<OMText variant="h3" style={styles.dragOverlayTitle}>
						Drop to add to lab
					</OMText>
					<OMText variant="body" style={styles.dragOverlayBody}>
						We&rsquo;ll sort genomes, indexes, and assays automatically.
					</OMText>
				</View>
			) : null}

			<ScrollView contentContainerStyle={styles.content}>
				<HeroDrop
					onClick={openPicker}
					active={dragActive}
					genomeCount={genomes.length}
					assayCount={assays.length}
				/>

				{genomes.length > 0 ? (
					<View style={styles.section}>
						<SectionHeader label="Genomes" count={genomes.length} />
						<View style={styles.cardGrid}>
							{genomes.map((g) => (
								<GenomeCard
									key={g.id}
									genome={g}
									selected={g.id === selectedGenomeId}
									onSelect={() => setSelectedGenomeId(g.id)}
									onRemove={() => removeGenome(g.id)}
								/>
							))}
						</View>
					</View>
				) : null}

				{assays.length > 0 ? (
					<View style={styles.section}>
						<SectionHeader label="Assays" count={assays.length} />
						<View style={styles.cardGrid}>
							{assays.map((a) => (
								<AssayCard
									key={a.id}
									assay={a}
									selected={a.id === selectedAssayId}
									onSelect={() => setSelectedAssayId(a.id)}
									onRemove={() => removeAssay(a.id)}
								/>
							))}
						</View>
					</View>
				) : null}

				{unknowns.length > 0 ? (
					<View style={styles.section}>
						<SectionHeader label="Unrecognised" count={unknowns.length} />
						<View style={styles.unknownBox}>
							{unknowns.map((u) => (
								<View key={u.id} style={styles.unknownRow}>
									<OMText variant="body" style={styles.unknownName}>
										{u.file.name}
									</OMText>
									<Pressable onPress={() => removeUnknown(u.id)} style={styles.secondaryButton}>
										<OMText variant="subtitle" style={styles.secondaryText}>
											Remove
										</OMText>
									</Pressable>
								</View>
							))}
						</View>
					</View>
				) : null}

				{genomes.length > 0 || assays.length > 0 ? (
					<View style={styles.runBar}>
						<View style={{ flex: 1 }}>
							<OMText variant="caption" style={styles.runSummaryLabel}>
								READY TO RUN
							</OMText>
							<OMText variant="body" style={styles.runSummaryText}>
								{selectedGenome
									? `Genome: ${genomeDisplayName(selectedGenome)}`
									: 'No genome picked'}
								{selectedAssay ? ` · Assay: ${selectedAssay.name}` : ' · No assay picked'}
							</OMText>
							{runDisabledReason ? (
								<OMText variant="caption" style={styles.runHint}>
									{runDisabledReason}
								</OMText>
							) : null}
						</View>
						<Pressable
							onPress={() => void executeRun()}
							disabled={runBlocked}
							style={[styles.runButton, runBlocked ? styles.runButtonDisabled : null]}
						>
							<OMText variant="subtitle" style={styles.runButtonText}>
								{run.status === 'running' ? 'Running…' : 'Run'}
							</OMText>
						</Pressable>
					</View>
				) : null}

				{run.status === 'error' && run.error ? (
					<View style={styles.errorCard}>
						<OMText variant="subtitle" style={styles.errorTitle}>
							Run failed
						</OMText>
						<OMText variant="body" style={styles.errorBody}>
							{run.error}
						</OMText>
					</View>
				) : null}

				{run.status === 'done' && run.observations ? (
					<ResultsCard
						durationMs={run.durationMs ?? 0}
						observations={run.observations}
					/>
				) : null}

				{run.status === 'done' && run.textOutput !== undefined ? (
					<TextOutputCard durationMs={run.durationMs ?? 0} text={run.textOutput} />
				) : null}

				{genomes.length > 0 || assays.length > 0 ? (
					<Pressable onPress={reset} style={styles.resetButton}>
						<OMText variant="subtitle" style={styles.secondaryText}>
							Clear everything
						</OMText>
					</Pressable>
				) : null}
			</ScrollView>
		</SafeAreaView>
	)
}

async function readGenomeText(g: Genome): Promise<string> {
	if (g.kind === 'text') return g.primary.text()
	if (g.kind === 'zip') {
		const extracted = await extractTextFromZip(g.primary)
		if (!extracted) throw new Error(`could not extract text from ${g.primary.name}`)
		return extracted.contents
	}
	throw new Error(`cannot read ${g.kind} as text`)
}

// Build a GenomeDescriptor that the Monty runtime can dispatch to the right
// backend (text parser / VCF wasm / CRAM wasm). CRAM/VCF descriptors carry
// the raw File refs (worker uses FileReaderSync for random access) plus the
// small index bytes inline.
async function buildGenomeDescriptor(g: Genome): Promise<GenomeDescriptor> {
	if (g.kind === 'text') {
		return { kind: 'text', name: g.primary.name, text: await g.primary.text() }
	}
	if (g.kind === 'zip') {
		const extracted = await extractTextFromZip(g.primary)
		if (!extracted) throw new Error(`could not extract text from ${g.primary.name}`)
		return { kind: 'zip', name: g.primary.name, text: extracted.contents }
	}
	if (g.kind === 'vcf') {
		if (!g.tbi) throw new Error('VCF genome is missing its .tbi index')
		const tbiBytes = new Uint8Array(await g.tbi.arrayBuffer())
		return { kind: 'vcf', name: g.primary.name, vcfFile: g.primary, tbiBytes }
	}
	if (g.kind === 'cram') {
		if (!g.crai || !g.fasta || !g.fai) {
			throw new Error('CRAM genome needs .cram.crai + reference .fa + .fa.fai')
		}
		const craiBytes = new Uint8Array(await g.crai.arrayBuffer())
		const faiBytes = new Uint8Array(await g.fai.arrayBuffer())
		return {
			kind: 'cram',
			name: g.primary.name,
			cramFile: g.primary,
			craiBytes,
			fastaFile: g.fasta,
			faiBytes,
		}
	}
	throw new Error(`unknown genome kind`)
}

// YAML → Python compile for the Monty runtime path (text genomes). The
// wasm path uses `compileVariantYamlToSpecs` above; this one emits a
// bioscript.variant(...) Python script that Monty can execute end-to-end
// with read_tsv/write_tsv.
function compileVariantYamlToPython(yamlText: string): string {
	const doc = YAML.parse(yamlText) as Record<string, unknown> | null
	if (!doc) throw new Error('empty YAML document')
	const schema = String(doc.schema ?? '')
	if (!schema.startsWith('bioscript:variant:')) {
		throw new Error(`unsupported schema "${schema}" — expected bioscript:variant:1.0`)
	}
	const name = String(doc.name ?? 'variant')
	const gene = String(doc.gene ?? '')
	const rsids: string[] = Array.isArray((doc.identifiers as { rsids?: unknown })?.rsids)
		? ((doc.identifiers as { rsids: unknown[] }).rsids as unknown[]).map((v) => String(v))
		: []
	if (rsids.length === 0) throw new Error('no identifiers.rsids found')
	const alleles = (doc.alleles ?? {}) as Record<string, unknown>
	const kind = String(alleles.kind ?? 'snv').toLowerCase()
	const ref = String(alleles.ref ?? '')
	const alts = Array.isArray(alleles.alts) ? (alleles.alts as unknown[]).map((v) => String(v)) : []
	const alt = alts[0] ?? ''
	const coords = (doc.coordinates ?? {}) as Record<string, { chrom?: unknown; pos?: unknown }>
	const fmtCoord = (c: { chrom?: unknown; pos?: unknown } | undefined): string | null => {
		if (!c) return null
		const chrom = String(c.chrom ?? '').trim()
		const pos = typeof c.pos === 'number' ? c.pos : Number.parseInt(String(c.pos ?? ''), 10)
		if (!chrom || !Number.isFinite(pos)) return null
		return `${chrom}:${pos}-${pos}`
	}
	const grch37 = fmtCoord(coords.grch37)
	const grch38 = fmtCoord(coords.grch38)
	const pyKind = kind === 'snv' ? 'snp' : kind === 'indel' ? 'indel' : kind
	const variantKwargs: string[] = [
		`rsid=${JSON.stringify(rsids.length === 1 ? rsids[0] : rsids)}`,
		`kind=${JSON.stringify(pyKind)}`,
	]
	if (grch37) variantKwargs.push(`grch37=${JSON.stringify(grch37)}`)
	if (grch38) variantKwargs.push(`grch38=${JSON.stringify(grch38)}`)
	if (ref) variantKwargs.push(`ref=${JSON.stringify(ref)}`)
	if (alt) variantKwargs.push(`alt=${JSON.stringify(alt)}`)

	return `# Auto-generated from a bioscript:variant:1.0 YAML assay by the lab.
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

// === Sub-components =========================================================

function HeroDrop({
	onClick,
	active,
	genomeCount,
	assayCount,
}: {
	onClick: () => void
	active: boolean
	genomeCount: number
	assayCount: number
}) {
	return (
		<Pressable
			onPress={onClick}
			style={[styles.hero, active ? styles.heroActive : null]}
		>
			<OMText variant="h3" style={styles.heroTitle}>
				Drag and drop files
			</OMText>
			<OMText variant="body" style={styles.heroBody}>
				23andMe exports · .txt / .csv / .tsv · .zip · .vcf / .vcf.gz · .cram
			</OMText>
			<OMText variant="caption" style={styles.heroSubBody}>
				We&rsquo;ll auto-pair indexes (.crai, .tbi) and references (.fa/.fa.fai). Drop .py
				or .yaml assays to use as the variant plan. Click here to pick files too.
			</OMText>
			{genomeCount === 0 && assayCount === 0 ? (
				<OMText variant="caption" style={styles.heroEmpty}>
					Nothing loaded yet.
				</OMText>
			) : (
				<OMText variant="caption" style={styles.heroFill}>
					{genomeCount} genome{genomeCount === 1 ? '' : 's'} · {assayCount} assay
					{assayCount === 1 ? '' : 's'}
				</OMText>
			)}
		</Pressable>
	)
}

function SectionHeader({ label, count }: { label: string; count: number }) {
	return (
		<View style={styles.sectionHeader}>
			<OMText variant="subtitle" style={styles.sectionTitle}>
				{label}
			</OMText>
			<OMText variant="caption" style={styles.sectionCount}>
				· {count}
			</OMText>
		</View>
	)
}

function GenomeCard({
	genome,
	selected,
	onSelect,
	onRemove,
}: {
	genome: Genome
	selected: boolean
	onSelect: () => void
	onRemove: () => void
}) {
	const complete = isGenomeComplete(genome)
	const missing = missingSlots(genome)
	return (
		<Pressable
			onPress={onSelect}
			style={[styles.card, selected ? styles.cardSelected : null]}
		>
			<View style={styles.cardHeader}>
				<View style={styles.cardTitleRow}>
					<OMText variant="subtitle" style={styles.cardTitle}>
						{selected ? '● ' : '○ '}
						{genomeDisplayName(genome)}
					</OMText>
					<StatusPill ok={complete} />
				</View>
				<Pressable onPress={onRemove} style={styles.removeCorner}>
					<OMText variant="caption" style={styles.removeText}>
						✕
					</OMText>
				</Pressable>
			</View>
			<OMText variant="caption" style={styles.cardKind}>
				{genomeKindLabel(genome)} · {humanSize(genomeBytesTotal(genome))}
			</OMText>

			{genome.kind === 'cram' ? (
				<View style={styles.slotList}>
					<SlotRow label="CRAM alignment (.cram)" file={genome.primary} required />
					<SlotRow label="CRAM index (.cram.crai)" file={genome.crai} required />
					<SlotRow label="Reference FASTA (.fa / .fasta)" file={genome.fasta} required />
					<SlotRow label="FASTA index (.fa.fai)" file={genome.fai} required />
				</View>
			) : null}

			{genome.kind === 'vcf' ? (
				<View style={styles.slotList}>
					<SlotRow label="VCF bgzipped (.vcf.gz)" file={genome.primary} required />
					<SlotRow label="Tabix index (.vcf.gz.tbi)" file={genome.tbi} required />
				</View>
			) : null}

			{missing.length > 0 ? (
				<OMText variant="caption" style={styles.missing}>
					Drop: {missing.join(' · ')}
				</OMText>
			) : null}
		</Pressable>
	)
}

function SlotRow({
	label,
	file,
	required,
}: {
	label: string
	file?: File
	required?: boolean
}) {
	const filled = Boolean(file)
	return (
		<View style={styles.slotRow}>
			<View
				style={[
					styles.slotIcon,
					filled ? styles.slotIconOk : required ? styles.slotIconMissing : styles.slotIconIdle,
				]}
			>
				<OMText variant="caption" style={styles.slotIconText}>
					{filled ? '✓' : '…'}
				</OMText>
			</View>
			<View style={{ flex: 1 }}>
				<OMText variant="body" style={styles.slotLabel}>
					{label}
				</OMText>
				<OMText variant="caption" style={styles.slotName}>
					{file ? `${file.name} · ${humanSize(file.size)}` : 'drop it here'}
				</OMText>
			</View>
		</View>
	)
}

function StatusPill({ ok }: { ok: boolean }) {
	return (
		<View style={[styles.pill, ok ? styles.pillOk : styles.pillBad]}>
			<OMText variant="caption" style={ok ? styles.pillOkText : styles.pillBadText}>
				{ok ? 'complete' : 'needs files'}
			</OMText>
		</View>
	)
}

function AssayCard({
	assay,
	selected,
	onSelect,
	onRemove,
}: {
	assay: Assay
	selected: boolean
	onSelect: () => void
	onRemove: () => void
}) {
	return (
		<Pressable
			onPress={onSelect}
			style={[styles.card, selected ? styles.cardSelected : null]}
		>
			<View style={styles.cardHeader}>
				<OMText variant="subtitle" style={styles.cardTitle}>
					{selected ? '● ' : '○ '}
					{assay.name}
				</OMText>
				<Pressable onPress={onRemove} style={styles.removeCorner}>
					<OMText variant="caption" style={styles.removeText}>
						✕
					</OMText>
				</Pressable>
			</View>
			<OMText variant="caption" style={styles.cardKind}>
				{assay.language === 'python' ? 'Python assay' : 'YAML variant assay'} ·{' '}
				{humanSize(assay.file.size)}
			</OMText>
		</Pressable>
	)
}

function ResultsCard({
	durationMs,
	observations,
}: {
	durationMs: number
	observations: VariantObservation[]
}) {
	return (
		<View style={styles.resultsCard}>
			<OMText variant="caption" style={styles.sectionLabel}>
				RESULTS · {durationMs} ms · {observations.length} variant
				{observations.length === 1 ? '' : 's'}
			</OMText>
			{observations.map((obs) => (
				<View key={obs.name} style={styles.obsRow}>
					<OMText variant="subtitle" style={styles.obsTitle}>
						{obs.name}
					</OMText>
					<OMText variant="body" style={styles.obsBody}>
						backend: {obs.backend}
						{obs.matchedRsid ? ` · rsid: ${obs.matchedRsid}` : ''}
						{obs.assembly ? ` · ${obs.assembly.toUpperCase()}` : ''}
					</OMText>
					{obs.genotype ? (
						<OMText variant="body" style={styles.obsBody}>
							genotype: {obs.genotype}
							{obs.depth !== undefined ? ` · depth ${obs.depth}` : ''}
							{obs.refCount !== undefined ? ` · ref ${obs.refCount}` : ''}
							{obs.altCount !== undefined ? ` · alt ${obs.altCount}` : ''}
						</OMText>
					) : null}
					{obs.evidence.length > 0 ? (
						<OMText variant="caption" style={styles.obsEvidence}>
							{obs.evidence.join(' · ')}
						</OMText>
					) : null}
				</View>
			))}
		</View>
	)
}

function TextOutputCard({ durationMs, text }: { durationMs: number; text: string }) {
	return (
		<View style={styles.resultsCard}>
			<OMText variant="caption" style={styles.sectionLabel}>
				RESULTS · {durationMs} ms
			</OMText>
			{text ? (
				<View style={styles.preBlock}>
					<OMText variant="body" style={styles.preText}>
						{text}
					</OMText>
				</View>
			) : (
				<OMText variant="caption" style={styles.obsEvidence}>
					(no output produced)
				</OMText>
			)}
		</View>
	)
}

// === Styles =================================================================

const styles = StyleSheet.create({
	safe: { flex: 1, backgroundColor: omColors.grayscale850 },
	content: {
		padding: omSpacing.xl,
		// Extra top padding clears the NativeTabs pill which overlays the top
		// of the viewport on web (~60 px tall + its own margin). Without this
		// the dashed hero card tucks underneath the chrome on first load.
		paddingTop: 80,
		gap: omSpacing.xl,
		paddingBottom: omSpacing.xxxl,
		maxWidth: 960,
		alignSelf: 'center',
		width: '100%',
	},

	hero: {
		padding: omSpacing.xxl,
		borderRadius: omRadius.l,
		borderWidth: 3,
		borderStyle: 'dashed',
		borderColor: 'rgba(83,190,169,0.45)',
		backgroundColor: 'rgba(83,190,169,0.05)',
		alignItems: 'center',
		gap: omSpacing.m,
		minHeight: 220,
		justifyContent: 'center',
	},
	heroActive: {
		borderColor: omTheme.accent,
		backgroundColor: 'rgba(83,190,169,0.12)',
	},
	heroTitle: { color: omTheme.accent, textAlign: 'center' },
	heroBody: { color: omColors.grayscale00, textAlign: 'center' },
	heroSubBody: { color: omColors.grayscale300, textAlign: 'center', maxWidth: 640 },
	heroEmpty: { color: omColors.grayscale500 },
	heroFill: { color: omTheme.accent },

	section: { gap: omSpacing.m },
	sectionHeader: { flexDirection: 'row', alignItems: 'baseline', gap: omSpacing.s },
	sectionTitle: { color: omTheme.primaryText },
	sectionCount: { color: omColors.grayscale500 },
	sectionLabel: { color: omColors.grayscale500, letterSpacing: 0.8 },

	cardGrid: { gap: omSpacing.m },
	card: {
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		gap: omSpacing.s,
	},
	cardSelected: {
		borderColor: 'rgba(83,190,169,0.55)',
		backgroundColor: 'rgba(83,190,169,0.08)',
	},
	cardHeader: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: omSpacing.m,
	},
	cardTitleRow: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		gap: omSpacing.s,
		flexWrap: 'wrap',
	},
	cardTitle: { color: omTheme.primaryText, flexShrink: 1 },
	cardKind: { color: omColors.grayscale400 },
	removeCorner: {
		paddingHorizontal: omSpacing.s,
		paddingVertical: omSpacing.xs,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(255,255,255,0.06)',
	},
	removeText: { color: omColors.grayscale400 },

	slotList: { gap: omSpacing.xs, marginTop: omSpacing.s },
	slotRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: omSpacing.m,
		padding: omSpacing.s,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,255,255,0.03)',
	},
	slotIcon: {
		width: 24,
		height: 24,
		borderRadius: 12,
		alignItems: 'center',
		justifyContent: 'center',
	},
	slotIconOk: { backgroundColor: 'rgba(83,190,169,0.18)' },
	slotIconMissing: { backgroundColor: 'rgba(255,200,80,0.18)' },
	slotIconIdle: { backgroundColor: 'rgba(255,255,255,0.08)' },
	slotIconText: { color: omColors.grayscale00 },
	slotLabel: { color: omTheme.primaryText },
	slotName: { color: omColors.grayscale500, marginTop: 2 },
	missing: { color: '#ffd36b', marginTop: omSpacing.s },

	pill: {
		paddingHorizontal: omSpacing.s,
		paddingVertical: 2,
		borderRadius: omRadius.full,
	},
	pillOk: { backgroundColor: 'rgba(83,190,169,0.18)' },
	pillBad: { backgroundColor: 'rgba(255,200,80,0.18)' },
	pillOkText: { color: omTheme.accent },
	pillBadText: { color: '#ffd36b' },

	unknownBox: {
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		borderWidth: 1,
		borderColor: 'rgba(255,200,80,0.25)',
		backgroundColor: 'rgba(255,200,80,0.05)',
		gap: omSpacing.s,
	},
	unknownRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.m,
	},
	unknownName: { color: omColors.grayscale300, flex: 1 },
	secondaryButton: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(255,255,255,0.06)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.12)',
	},
	secondaryText: { color: omTheme.accent },

	runBar: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: omSpacing.l,
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(83,190,169,0.3)',
	},
	runSummaryLabel: { color: omColors.grayscale500, letterSpacing: 0.8 },
	runSummaryText: { color: omTheme.primaryText, marginTop: 2 },
	runHint: { color: '#ffd36b', marginTop: omSpacing.xs },
	runButton: {
		paddingHorizontal: omSpacing.xl,
		paddingVertical: omSpacing.m,
		borderRadius: omRadius.full,
		backgroundColor: omTheme.accent,
	},
	runButtonDisabled: { opacity: 0.4 },
	runButtonText: { color: omColors.grayscale850 },

	errorCard: {
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: 'rgba(255,107,107,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(255,107,107,0.3)',
		gap: omSpacing.xs,
	},
	errorTitle: { color: '#ff8a8a' },
	errorBody: { color: '#ffb2b2' },

	resultsCard: {
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(83,190,169,0.25)',
		gap: omSpacing.m,
	},
	obsRow: {
		gap: omSpacing.xs,
		padding: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(83,190,169,0.06)',
	},
	obsTitle: { color: omTheme.primaryText },
	obsBody: { color: omColors.grayscale300 },
	obsEvidence: { color: omColors.grayscale500, marginTop: 2 },

	preBlock: {
		padding: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: '#17181d',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	preText: {
		color: omColors.grayscale300,
		fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
		fontSize: 12,
	},

	resetButton: {
		alignSelf: 'flex-start',
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(255,255,255,0.06)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.12)',
	},

	dragOverlay: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		...(Platform.OS === 'web' ? ({ position: 'fixed' } as object) : null),
		backgroundColor: 'rgba(5, 15, 20, 0.82)',
		alignItems: 'center',
		justifyContent: 'center',
		zIndex: 9999,
		gap: omSpacing.s,
	},
	dragOverlayTitle: { color: omTheme.accent, textAlign: 'center' },
	dragOverlayBody: { color: '#ffffff', textAlign: 'center' },
})
