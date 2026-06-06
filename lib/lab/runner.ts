import {
	expoBioscriptRuntime,
	type GenomeDescriptor,
	type LabBioscriptRuntime,
	type VariantObservation,
	type VariantSpec,
} from '@/lib/lab/bioscript-runtime'

import type { LabFileAdapter, LabFileRef } from '@/lib/lab/core/files'
import type { LabAssayRef, LabGenomeRef } from '@/lib/lab/core/refs'
import { prepareLabRuntimeRoot } from '@/lib/lab/runtime-root'
import type { LabRunProgress, LabRunSuccess } from '@/lib/lab/types'
import type { BioscriptPackageFile } from '@/modules/expo-bioscript'

type LabRunProgressCallback = (progress: LabRunProgress) => void
type GenomeAssembly = 'grch37' | 'grch38'
type LabRunFileAdapter = Pick<LabFileAdapter, 'readBytes' | 'readText'> & {
	getFile?: (ref: LabFileRef) => File
}

function yieldToBrowser(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 0)
	})
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
		throw new Error('Alignment genome needs .bam.bai/.cram.crai + reference .fa + .fa.fai')
	}
	if (genome.primary.kind === 'bam') {
		return {
			kind: 'bam',
			name: genome.primary.name,
			bamFile: requirePlatformFile(files, genome.primary, 'BAM genome'),
			baiBytes: await files.readBytes(genome.crai),
		}
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

function sanitizeRuntimeFileName(name: string): string {
	return name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'input'
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
			if (selectedGenome.primary.kind === 'bam') {
				const result = await runtime.lookupBamVariants({
					bamFile: requirePlatformFile(files, selectedGenome.primary, 'BAM genome'),
					baiBytes: await files.readBytes(selectedGenome.crai),
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
	const runtimeInputFile = `inputs/${sanitizeRuntimeFileName(genomeKey)}`
	const outputFileName = 'assay-output.tsv'
	const runtimeRoot = await prepareLabRuntimeRoot(outputFileName)
	const scriptPath = selectedAssay.file.name
	// Bioscript's native runtime injects `participant_id` as a Python global —
	// scripts like apol1.py reference it inside main(). Without it the
	// interpreter raises NameError at the first reference, which masks the
	// later "G1_SITE_1 is not defined" cascade. Always pass a non-empty value.
	const participantId = sanitizeRuntimeFileName(genomeKey) || 'participant'
	const result = await runtime.runFile({
		scriptPath,
		scriptContents,
		fileContents: { [scriptPath]: scriptContents },
		root: runtimeRoot?.root,
		cacheDir: runtimeRoot?.cacheDir,
		inputFile: runtimeInputFile,
		inputContents:
			descriptor.kind === 'text'
				? descriptor.text
				: undefined,
		outputFile: runtimeRoot?.outputFile ?? outputFileName,
		participantId,
		inputFormat: descriptor.kind === 'zip' ? 'zip' : 'text',
		genomes: { [genomeKey]: descriptor, [runtimeInputFile]: descriptor },
		maxDurationMs: 180_000,
		maxMemoryBytes: 128 * 1024 * 1024,
		maxAllocations: 1_000_000,
		maxRecursionDepth: 512,
	})

	const fallbackText = result.outputText ?? result.outputFiles?.[outputFileName] ?? ''
	const textOutput = fallbackText || (runtimeRoot ? await runtimeRoot.readOutputText() : '')
	const artifacts = Object.entries(result.outputFiles ?? {}).map(([name, text]) => ({
		mimeType: name.toLowerCase().endsWith('.html') ? 'text/html' : 'text/plain',
		name,
		text,
	}))

	return {
		kind: 'text_output',
		result: {
			status: 'done',
			artifacts,
			durationMs: Date.now() - startedAt,
			textOutput,
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
			label: `Preparing variant ${index + 1} of ${files.length}: ${fileName}`,
			phase: 'preparing',
			total: files.length,
		})
		await yieldToBrowser()
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
		const variants = compiledFiles.flatMap((compiled) => compiled.variants)
		onProgress?.({
			completed: 0,
			label: `Running ${variants.length} variant${variants.length === 1 ? '' : 's'}`,
			phase: 'running',
			total: variants.length,
		})
		await yieldToBrowser()
		try {
			const result = await runtime.lookupGenotypeBytesVariants(
				selectedGenome.primary.name,
				bytes,
				variants,
			)
			observations.push(...result.observations)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			throw new Error(`Panel genotype lookup: ${message}`)
		}
		onProgress?.({
			completed: variants.length,
			label: `Completed ${variants.length} variant${variants.length === 1 ? '' : 's'}`,
			phase: 'complete',
			total: variants.length,
		})
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
			await yieldToBrowser()
			try {
				const result = selectedGenome.primary.kind === 'bam'
					? await runtime.lookupBamVariants({
							bamFile: requirePlatformFile(fileAdapter, selectedGenome.primary, 'BAM genome'),
							baiBytes: craiBytes,
							variants: compiled.variants,
						})
					: await runtime.lookupCramVariants({
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
		await yieldToBrowser()
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

export async function runLabPackageReportRef(
	selectedGenome: LabGenomeRef,
	manifestPath: string,
	packageFiles: BioscriptPackageFile[],
	fileAdapter: LabRunFileAdapter,
	onProgress?: LabRunProgressCallback,
	runtime: LabBioscriptRuntime = expoBioscriptRuntime,
): Promise<LabRunSuccess> {
	onProgress?.({
		completed: 0,
		label: 'Preparing BioScript package report',
		phase: 'preparing',
		total: null,
	})
	await yieldToBrowser()
	const reportOptions = {
		analysisMaxDurationMs: 300_000,
		detectSex: true,
	}
	if (selectedGenome.kind === 'cram') {
		if (selectedGenome.primary.kind === 'bam') {
			if (!selectedGenome.crai) {
				throw new Error(`BAM genome incomplete: needs ${selectedGenome.primary.name} + .bai`)
			}
			const bamFile = requirePlatformFile(fileAdapter, selectedGenome.primary, 'BAM genome')
			const baiBytes = await fileAdapter.readBytes(selectedGenome.crai)
			onProgress?.({
				completed: 0,
				label: 'Running BioScript report (BAM)',
				phase: 'running',
				total: null,
			})
			await yieldToBrowser()
			const report = await runtime.runPackageReportFromBamFile(
				manifestPath,
				packageFiles,
				selectedGenome.primary.name,
				bamFile,
				baiBytes,
				reportOptions,
			)
			onProgress?.({
				completed: 1,
				label: 'BioScript report complete',
				phase: 'complete',
				total: 1,
			})
			return {
				kind: 'text_output',
				result: {
					status: 'done',
					artifacts: report.artifacts,
					durationMs: report.durationMs,
					textOutput: report.textOutput,
				},
			}
		}
		if (!selectedGenome.crai || !selectedGenome.fasta || !selectedGenome.fai) {
			throw new Error(`CRAM genome incomplete: needs ${selectedGenome.primary.name} + .crai + .fasta + .fai`)
		}
		const cramFile = requirePlatformFile(fileAdapter, selectedGenome.primary, 'CRAM genome')
		const fastaFile = requirePlatformFile(fileAdapter, selectedGenome.fasta, 'CRAM reference FASTA')
		const craiBytes = await fileAdapter.readBytes(selectedGenome.crai)
		const faiBytes = await fileAdapter.readBytes(selectedGenome.fai)
		onProgress?.({
			completed: 0,
			label: 'Running BioScript report (CRAM)',
			phase: 'running',
			total: null,
		})
		await yieldToBrowser()
		const report = await runtime.runPackageReportFromCramFile(
			manifestPath,
			packageFiles,
			selectedGenome.primary.name,
			cramFile,
			craiBytes,
			fastaFile,
			faiBytes,
			reportOptions,
		)
		onProgress?.({
			completed: 1,
			label: 'BioScript report complete',
			phase: 'complete',
			total: 1,
		})
		return {
			kind: 'text_output',
			result: {
				status: 'done',
				artifacts: report.artifacts,
				durationMs: report.durationMs,
				textOutput: report.textOutput,
			},
		}
	}
	if (selectedGenome.kind === 'vcf') {
		if (!selectedGenome.tbi) {
			throw new Error('VCF genome incomplete: needs .vcf.gz + .tbi tabix index')
		}
		const vcfFile = requirePlatformFile(fileAdapter, selectedGenome.primary, 'VCF genome')
		const tbiBytes = await fileAdapter.readBytes(selectedGenome.tbi)
		onProgress?.({
			completed: 0,
			label: 'Running BioScript report (VCF)',
			phase: 'running',
			total: null,
		})
		await yieldToBrowser()
		const report = await runtime.runPackageReportFromVcfFile(
			manifestPath,
			packageFiles,
			selectedGenome.primary.name,
			vcfFile,
			tbiBytes,
			reportOptions,
		)
		onProgress?.({
			completed: 1,
			label: 'BioScript report complete',
			phase: 'complete',
			total: 1,
		})
		return {
			kind: 'text_output',
			result: {
				status: 'done',
				artifacts: report.artifacts,
				durationMs: report.durationMs,
				textOutput: report.textOutput,
			},
		}
	}
	// Falls through to text/zip path; LabGenomeRef's kind union is exhausted
	// by the cram/vcf branches above so TS narrows this to text|zip.
	const inputBytes = await fileAdapter.readBytes(selectedGenome.primary)
	onProgress?.({
		completed: 0,
		label: 'Running BioScript report',
		phase: 'running',
		total: null,
	})
	await yieldToBrowser()
	const report = await runtime.runPackageReportBytes(
		manifestPath,
		packageFiles,
		selectedGenome.primary.name,
		inputBytes,
		reportOptions,
	)
	onProgress?.({
		completed: 1,
		label: 'BioScript report complete',
		phase: 'complete',
		total: 1,
	})
	return {
		kind: 'text_output',
		result: {
			status: 'done',
			artifacts: report.artifacts,
			durationMs: report.durationMs,
			textOutput: report.textOutput,
		},
	}
}
