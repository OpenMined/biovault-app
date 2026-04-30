import {
	expoBioscriptRuntime,
	type GenomeDescriptor,
	type LabBioscriptRuntime,
	type VariantObservation,
	type VariantSpec,
} from '@/lib/lab/bioscript-runtime'

import {
	extractTextFromZip,
} from '@/lib/lab/yaml-compile'
import type { Assay, AssayLang, BuildGenomeDescriptorResult, Genome, LabRunProgress, LabRunSuccess } from '@/lib/lab/types'
import { isGenomeComplete, missingGenomeSlots } from '@/lib/lab/file-model'

type LabRunProgressCallback = (progress: LabRunProgress) => void
type GenomeAssembly = 'grch37' | 'grch38'

export function getLabRunDisabledReasonFor(
	selectedGenome: Genome | null,
	assayLanguage: AssayLang | null,
): string | null {
	if (!selectedGenome) return 'Pick a genome above.'
	if (!assayLanguage) return 'Pick an assay above.'
	if (!isGenomeComplete(selectedGenome)) {
		return `Genome is missing: ${missingGenomeSlots(selectedGenome).join(', ')}`
	}
	return null
}

export function getLabRunDisabledReason(
	selectedGenome: Genome | null,
	selectedAssay: Assay | null,
): string | null {
	return getLabRunDisabledReasonFor(selectedGenome, selectedAssay?.language ?? null)
}

export async function buildGenomeDescriptor(genome: Genome): Promise<BuildGenomeDescriptorResult> {
	if (genome.kind === 'text') {
		return { kind: 'text', name: genome.primary.name, text: await genome.primary.text() }
	}
	if (genome.kind === 'zip') {
		const extracted = await extractTextFromZip(genome.primary)
		if (!extracted) throw new Error(`could not extract text from ${genome.primary.name}`)
		return { kind: 'zip', name: genome.primary.name, text: extracted.contents }
	}
	if (genome.kind === 'vcf') {
		if (!genome.tbi) throw new Error('VCF genome is missing its .tbi index')
		const tbiBytes = new Uint8Array(await genome.tbi.arrayBuffer())
		return { kind: 'vcf', name: genome.primary.name, vcfFile: genome.primary, tbiBytes }
	}
	if (!genome.crai || !genome.fasta || !genome.fai) {
		throw new Error('CRAM genome needs .cram.crai + reference .fa + .fa.fai')
	}
	const craiBytes = new Uint8Array(await genome.crai.arrayBuffer())
	const faiBytes = new Uint8Array(await genome.fai.arrayBuffer())
	return {
		kind: 'cram',
		name: genome.primary.name,
		cramFile: genome.primary,
		craiBytes,
		fastaFile: genome.fasta,
		faiBytes,
	}
}

function inferGenomeAssembly(genome: Genome): GenomeAssembly | null {
	const names = [genome.primary.name]
	if (genome.kind === 'cram') names.push(genome.crai?.name ?? '', genome.fasta?.name ?? '', genome.fai?.name ?? '')
	if (genome.kind === 'vcf') names.push(genome.tbi?.name ?? '')
	const joined = names.join(' ').toLowerCase()
	if (/\b(grch38|hg38)\b/.test(joined)) return 'grch38'
	if (/\b(grch37|hg19)\b/.test(joined)) return 'grch37'
	return null
}

function variantAssemblyGroupKey(variant: VariantSpec): string {
	if (variant.rsid) {
		return [
			variant.rsid.toLowerCase(),
			variant.ref.toUpperCase(),
			variant.alt.toUpperCase(),
			variant.kind ?? '',
		].join('|')
	}
	return variant.name.replace(/_grch3[78]$/i, '').toLowerCase()
}

function selectPreferredAssemblyVariants(genome: Genome, variants: VariantSpec[]): VariantSpec[] {
	const targetAssembly = inferGenomeAssembly(genome) ?? 'grch38'
	const groups = new Map<string, VariantSpec[]>()
	for (const variant of variants) {
		const key = variantAssemblyGroupKey(variant)
		groups.set(key, [...(groups.get(key) ?? []), variant])
	}

	const selected: VariantSpec[] = []
	for (const group of groups.values()) {
		const fallback = group[0]
		if (!fallback) continue
		const assemblies = new Set(group.map((variant) => variant.assembly).filter(Boolean))
		if (group.length <= 1 || assemblies.size <= 1) {
			selected.push(...group)
			continue
		}
		selected.push(
			group.find((variant) => variant.assembly === targetAssembly) ??
			group.find((variant) => variant.assembly === 'grch38') ??
			fallback,
		)
	}
	return selected
}

function unsupportedLookupObservations(
	backend: string,
	variants: VariantSpec[],
	message: string,
): VariantObservation[] {
	return variants.map((variant) => ({
		name: variant.name,
		backend,
		matchedRsid: variant.rsid,
		assembly: variant.assembly,
		rawCounts: {},
		decision: 'unsupported',
		evidence: [message],
	}))
}

function isUnsupportedSingleBaseLookupError(message: string): boolean {
	return /supports single-base SNV observations only/i.test(message)
}

export async function runLabAssay(
	selectedGenome: Genome,
	selectedAssay: Assay,
	runtime: LabBioscriptRuntime = expoBioscriptRuntime,
): Promise<LabRunSuccess> {
	const startedAt = Date.now()

	if (selectedAssay.language === 'yaml') {
		const yamlText = await selectedAssay.file.text()
		const variants = selectPreferredAssemblyVariants(
			selectedGenome,
			await runtime.compileVariantYamlText(selectedAssay.file.name, yamlText),
		)
		if (selectedGenome.kind === 'cram') {
			if (!selectedGenome.crai || !selectedGenome.fasta || !selectedGenome.fai) {
				throw new Error('CRAM genome incomplete')
			}
			const craiBytes = new Uint8Array(await selectedGenome.crai.arrayBuffer())
			const faiBytes = new Uint8Array(await selectedGenome.fai.arrayBuffer())
			const result = await runtime.lookupCramVariants({
				cramFile: selectedGenome.primary,
				craiBytes,
				fastaFile: selectedGenome.fasta,
				faiBytes,
				variants,
			})
			return {
				kind: 'variant_lookup',
				result: {
					status: 'done',
					durationMs: result.durationMs,
					observations: result.observations,
				},
			}
		}
		if (selectedGenome.kind === 'vcf') {
			if (!selectedGenome.tbi) throw new Error('VCF genome missing tabix index')
			const tbiBytes = new Uint8Array(await selectedGenome.tbi.arrayBuffer())
			const result = await runtime.lookupVcfVariants({
				vcfFile: selectedGenome.primary,
				tbiBytes,
				variants,
			})
			return {
				kind: 'variant_lookup',
				result: {
					status: 'done',
					durationMs: result.durationMs,
					observations: result.observations,
				},
			}
		}
		if (selectedGenome.kind === 'text' || selectedGenome.kind === 'zip') {
			const bytes = new Uint8Array(await selectedGenome.primary.arrayBuffer())
			const result = await runtime.lookupGenotypeBytesVariants(selectedGenome.primary.name, bytes, variants)
			return {
				kind: 'variant_lookup',
				result: {
					status: 'done',
					durationMs: result.durationMs,
					observations: result.observations,
				},
			}
		}
	}

	const scriptContents = await selectedAssay.file.text()
	const descriptor: GenomeDescriptor = await buildGenomeDescriptor(selectedGenome)
	const genomeKey = selectedGenome.primary.name
	const result = await runtime.runFile({
		scriptPath: selectedAssay.file.name,
		scriptContents,
		inputFile: genomeKey,
		inputContents:
			descriptor.kind === 'text' || descriptor.kind === 'zip'
				? descriptor.text
				: undefined,
		outputFile: 'assay-output.tsv',
		inputFormat: 'text',
		genomes: { [genomeKey]: descriptor },
		maxDurationMs: 180_000,
		maxMemoryBytes: 128 * 1024 * 1024,
		maxAllocations: 1_000_000,
		maxRecursionDepth: 512,
	})

	return {
		kind: 'text_output',
		result: {
			status: 'done',
			durationMs: Date.now() - startedAt,
			textOutput: result.outputText ?? result.outputFiles?.['assay-output.tsv'] ?? '',
		},
	}
}

export async function runLabVariantYamlFiles(
	selectedGenome: Genome,
	files: File[],
	onProgress?: LabRunProgressCallback,
	runtime: LabBioscriptRuntime = expoBioscriptRuntime,
): Promise<LabRunSuccess> {
	if (!files.length) throw new Error('Panel has no fetched variant assays to run')

	const startedAt = Date.now()
	onProgress?.({
		completed: 0,
		label: `Preparing ${files.length} panel member${files.length === 1 ? '' : 's'}`,
		phase: 'preparing',
		total: files.length,
	})

	const yamlTexts = await Promise.all(files.map((file) => file.text()))
	const compiledFiles = []
	for (let index = 0; index < files.length; index += 1) {
		const file = files[index]
		onProgress?.({
			completed: index,
			label: `Compiling ${file?.name || `variant-${index + 1}.yaml`}`,
			phase: 'compiling',
			total: files.length,
		})
		compiledFiles.push({
			fileName: file?.name || `variant-${index + 1}.yaml`,
			variants: selectPreferredAssemblyVariants(
				selectedGenome,
				await runtime.compileVariantYamlText(file?.name || `variant-${index + 1}.yaml`, yamlTexts[index] ?? ''),
			),
		})
	}

	const observations: VariantObservation[] = []
	if (selectedGenome.kind === 'text' || selectedGenome.kind === 'zip') {
		const bytes = new Uint8Array(await selectedGenome.primary.arrayBuffer())
		for (const [index, compiled] of compiledFiles.entries()) {
			onProgress?.({
				completed: index,
				label: `Running ${compiled.fileName}`,
				phase: 'running',
				total: compiledFiles.length,
			})
			try {
				const result = await runtime.lookupGenotypeBytesVariants(
					selectedGenome.primary.name,
					bytes,
					compiled.variants,
				)
				observations.push(...result.observations)
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				throw new Error(`${compiled.fileName}: ${message}`)
			}
			onProgress?.({
				completed: index + 1,
				label: `Completed ${index + 1} of ${compiledFiles.length}`,
				phase: index + 1 === compiledFiles.length ? 'complete' : 'running',
				total: compiledFiles.length,
			})
		}
		return {
			kind: 'variant_lookup',
			result: {
				status: 'done',
				durationMs: Date.now() - startedAt,
				observations,
			},
		}
	}

	if (selectedGenome.kind === 'cram') {
		if (!selectedGenome.crai || !selectedGenome.fasta || !selectedGenome.fai) {
			throw new Error('CRAM genome incomplete')
		}
		const craiBytes = new Uint8Array(await selectedGenome.crai.arrayBuffer())
		const faiBytes = new Uint8Array(await selectedGenome.fai.arrayBuffer())
		for (const [index, compiled] of compiledFiles.entries()) {
			onProgress?.({
				completed: index,
				label: `Running ${compiled.fileName}`,
				phase: 'running',
				total: compiledFiles.length,
			})
			try {
				const result = await runtime.lookupCramVariants({
					cramFile: selectedGenome.primary,
					craiBytes,
					fastaFile: selectedGenome.fasta,
					faiBytes,
					variants: compiled.variants,
				})
				observations.push(...result.observations)
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				if (isUnsupportedSingleBaseLookupError(message)) {
					observations.push(...unsupportedLookupObservations('cram', compiled.variants, message))
				} else {
					const names = compiled.variants.map((variant) => variant.name).join(', ')
					throw new Error(`${compiled.fileName}${names ? ` (${names})` : ''}: ${message}`)
				}
			}
			onProgress?.({
				completed: index + 1,
				label: `Completed ${index + 1} of ${compiledFiles.length}`,
				phase: index + 1 === compiledFiles.length ? 'complete' : 'running',
				total: compiledFiles.length,
			})
		}
		return {
			kind: 'variant_lookup',
			result: {
				status: 'done',
				durationMs: Date.now() - startedAt,
				observations,
			},
		}
	}

	if (!selectedGenome.tbi) throw new Error('VCF genome missing tabix index')
	const tbiBytes = new Uint8Array(await selectedGenome.tbi.arrayBuffer())
	for (const [index, compiled] of compiledFiles.entries()) {
		onProgress?.({
			completed: index,
			label: `Running ${compiled.fileName}`,
			phase: 'running',
			total: compiledFiles.length,
		})
		try {
			const result = await runtime.lookupVcfVariants({
				vcfFile: selectedGenome.primary,
				tbiBytes,
				variants: compiled.variants,
			})
			observations.push(...result.observations)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			if (isUnsupportedSingleBaseLookupError(message)) {
				observations.push(...unsupportedLookupObservations('vcf', compiled.variants, message))
			} else {
				const names = compiled.variants.map((variant) => variant.name).join(', ')
				throw new Error(`${compiled.fileName}${names ? ` (${names})` : ''}: ${message}`)
			}
		}
		onProgress?.({
			completed: index + 1,
			label: `Completed ${index + 1} of ${compiledFiles.length}`,
			phase: index + 1 === compiledFiles.length ? 'complete' : 'running',
			total: compiledFiles.length,
		})
	}
	return {
		kind: 'variant_lookup',
		result: {
			status: 'done',
			durationMs: Date.now() - startedAt,
			observations,
		},
	}
}
