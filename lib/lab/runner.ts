import {
	expoBioscriptRuntime,
	type GenomeDescriptor,
	type LabBioscriptRuntime,
	type VariantObservation,
	type VariantSpec,
} from '@/lib/lab/bioscript-runtime'

import type { LabFileAdapter, LabFileRef } from '@/lib/lab/core/files'
import type { LabAssayRef, LabGenomeRef } from '@/lib/lab/core/refs'
import type { LabRunProgress, LabRunSuccess } from '@/lib/lab/types'

type LabRunProgressCallback = (progress: LabRunProgress) => void
type GenomeAssembly = 'grch37' | 'grch38'
type LabRunFileAdapter = Pick<LabFileAdapter, 'readBytes' | 'readText'> & {
	getFile?: (ref: LabFileRef) => File
}

export async function buildGenomeDescriptorFromRef(
	genome: LabGenomeRef,
	files: LabRunFileAdapter,
): Promise<GenomeDescriptor> {
	if (genome.kind === 'text') {
		return { kind: 'text', name: genome.primary.name, text: await files.readText(genome.primary) }
	}
	if (genome.kind === 'zip') {
		return { kind: 'zip', name: genome.primary.name, bytes: await files.readBytes(genome.primary) }
	}
	if (genome.kind === 'vcf') {
		if (!genome.tbi) throw new Error('VCF genome is missing its .tbi index')
		return {
			kind: 'vcf',
			name: genome.primary.name,
			vcfFile: requirePlatformFile(files, genome.primary, 'VCF genome'),
			tbiBytes: await files.readBytes(genome.tbi),
		}
	}
	if (!genome.crai || !genome.fasta || !genome.fai) {
		throw new Error('CRAM genome needs .cram.crai + reference .fa + .fa.fai')
	}
	return {
		kind: 'cram',
		name: genome.primary.name,
		cramFile: requirePlatformFile(files, genome.primary, 'CRAM genome'),
		craiBytes: await files.readBytes(genome.crai),
		fastaFile: requirePlatformFile(files, genome.fasta, 'CRAM reference FASTA'),
		faiBytes: await files.readBytes(genome.fai),
	}
}

function requirePlatformFile(files: LabRunFileAdapter, ref: LabFileRef, label: string): File {
	if (!files.getFile) {
		throw new Error(`${label} requires a platform file handle for the current BioScript runtime`)
	}
	return files.getFile(ref)
}

function genomeFileNames(genome: LabGenomeRef): string[] {
	const names = [genome.primary.name]
	if (genome.kind === 'cram') names.push(genome.crai?.name ?? '', genome.fasta?.name ?? '', genome.fai?.name ?? '')
	if (genome.kind === 'vcf') names.push(genome.tbi?.name ?? '')
	return names
}

function inferGenomeAssemblyFromNames(names: string[]): GenomeAssembly | null {
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

function selectPreferredAssemblyVariantsForNames(names: string[], variants: VariantSpec[]): VariantSpec[] {
	const targetAssembly = inferGenomeAssemblyFromNames(names) ?? 'grch38'
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

export async function runLabAssayRef(
	selectedGenome: LabGenomeRef,
	selectedAssay: LabAssayRef,
	files: LabRunFileAdapter,
	runtime: LabBioscriptRuntime = expoBioscriptRuntime,
): Promise<LabRunSuccess> {
	const startedAt = Date.now()

	if (selectedAssay.language === 'yaml') {
		const yamlText = await files.readText(selectedAssay.file)
		const variants = selectPreferredAssemblyVariantsForNames(
			genomeFileNames(selectedGenome),
			await runtime.compileVariantYamlText(selectedAssay.file.name, yamlText),
		)
		if (selectedGenome.kind === 'cram') {
			if (!selectedGenome.crai || !selectedGenome.fasta || !selectedGenome.fai) {
				throw new Error('CRAM genome incomplete')
			}
			const result = await runtime.lookupCramVariants({
				cramFile: requirePlatformFile(files, selectedGenome.primary, 'CRAM genome'),
				craiBytes: await files.readBytes(selectedGenome.crai),
				fastaFile: requirePlatformFile(files, selectedGenome.fasta, 'CRAM reference FASTA'),
				faiBytes: await files.readBytes(selectedGenome.fai),
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
			const result = await runtime.lookupVcfVariants({
				vcfFile: requirePlatformFile(files, selectedGenome.primary, 'VCF genome'),
				tbiBytes: await files.readBytes(selectedGenome.tbi),
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
			const result = await runtime.lookupGenotypeBytesVariants(
				selectedGenome.primary.name,
				await files.readBytes(selectedGenome.primary),
				variants,
			)
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

	const scriptContents = await files.readText(selectedAssay.file)
	const descriptor: GenomeDescriptor = await buildGenomeDescriptorFromRef(selectedGenome, files)
	const genomeKey = selectedGenome.primary.name
	const result = await runtime.runFile({
		scriptPath: selectedAssay.file.name,
		scriptContents,
		inputFile: genomeKey,
		inputContents:
			descriptor.kind === 'text'
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

export async function runLabVariantYamlRefs(
	selectedGenome: LabGenomeRef,
	files: LabFileRef[],
	fileAdapter: LabRunFileAdapter,
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

	const yamlTexts = await Promise.all(files.map((file) => fileAdapter.readText(file)))
	const compiledFiles = []
	for (let index = 0; index < files.length; index += 1) {
		const file = files[index]
		const fileName = file?.name || `variant-${index + 1}.yaml`
		onProgress?.({
			completed: index,
			label: `Compiling ${fileName}`,
			phase: 'compiling',
			total: files.length,
		})
		compiledFiles.push({
			fileName,
			variants: selectPreferredAssemblyVariantsForNames(
				genomeFileNames(selectedGenome),
				await runtime.compileVariantYamlText(fileName, yamlTexts[index] ?? ''),
			),
		})
	}

	const observations: VariantObservation[] = []
	if (selectedGenome.kind === 'text' || selectedGenome.kind === 'zip') {
		const bytes = await fileAdapter.readBytes(selectedGenome.primary)
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
		const craiBytes = await fileAdapter.readBytes(selectedGenome.crai)
		const faiBytes = await fileAdapter.readBytes(selectedGenome.fai)
		for (const [index, compiled] of compiledFiles.entries()) {
			onProgress?.({
				completed: index,
				label: `Running ${compiled.fileName}`,
				phase: 'running',
				total: compiledFiles.length,
			})
			try {
				const result = await runtime.lookupCramVariants({
					cramFile: requirePlatformFile(fileAdapter, selectedGenome.primary, 'CRAM genome'),
					craiBytes,
					fastaFile: requirePlatformFile(fileAdapter, selectedGenome.fasta, 'CRAM reference FASTA'),
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
	const tbiBytes = await fileAdapter.readBytes(selectedGenome.tbi)
	for (const [index, compiled] of compiledFiles.entries()) {
		onProgress?.({
			completed: index,
			label: `Running ${compiled.fileName}`,
			phase: 'running',
			total: compiledFiles.length,
		})
		try {
			const result = await runtime.lookupVcfVariants({
				vcfFile: requirePlatformFile(fileAdapter, selectedGenome.primary, 'VCF genome'),
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
