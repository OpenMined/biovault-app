import {
	isBioscriptAvailable,
	lookupCramVariants,
	lookupVcfVariants,
	runFile,
	type GenomeDescriptor,
} from '@/modules/expo-bioscript'

import {
	compileVariantYamlToPython,
	compileVariantYamlToSpecs,
	extractTextFromZip,
} from '@/lib/lab/yaml-compile'
import type { Assay, BuildGenomeDescriptorResult, Genome, LabRunSuccess } from '@/lib/lab/types'
import { isGenomeComplete, missingGenomeSlots } from '@/lib/lab/file-model'

export function getLabRunDisabledReason(
	selectedGenome: Genome | null,
	selectedAssay: Assay | null,
): string | null {
	if (!selectedGenome) return 'Pick a genome above.'
	if (!selectedAssay) return 'Pick an assay above.'
	if (!isGenomeComplete(selectedGenome)) {
		return `Genome is missing: ${missingGenomeSlots(selectedGenome).join(', ')}`
	}
	const needsMonty =
		selectedAssay.language === 'python' ||
		selectedGenome.kind === 'text' ||
		selectedGenome.kind === 'zip'
	if (needsMonty && !isBioscriptAvailable()) {
		return 'Bioscript web runtime unavailable (needs SharedArrayBuffer + cross-origin isolation).'
	}
	return null
}

async function readGenomeText(genome: Genome): Promise<string> {
	if (genome.kind === 'text') return genome.primary.text()
	if (genome.kind === 'zip') {
		const extracted = await extractTextFromZip(genome.primary)
		if (!extracted) throw new Error(`could not extract text from ${genome.primary.name}`)
		return extracted.contents
	}
	throw new Error(`cannot read ${genome.kind} as text`)
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

export async function runLabAssay(selectedGenome: Genome, selectedAssay: Assay): Promise<LabRunSuccess> {
	const startedAt = Date.now()

	if (selectedAssay.language === 'yaml') {
		const yamlText = await selectedAssay.file.text()
		if (selectedGenome.kind === 'cram') {
			if (!selectedGenome.crai || !selectedGenome.fasta || !selectedGenome.fai) {
				throw new Error('CRAM genome incomplete')
			}
			const variants = compileVariantYamlToSpecs(yamlText)
			const craiBytes = new Uint8Array(await selectedGenome.crai.arrayBuffer())
			const faiBytes = new Uint8Array(await selectedGenome.fai.arrayBuffer())
			const result = await lookupCramVariants({
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
			const variants = compileVariantYamlToSpecs(yamlText)
			const tbiBytes = new Uint8Array(await selectedGenome.tbi.arrayBuffer())
			const result = await lookupVcfVariants({
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
		return {
			kind: 'text_output',
			result: {
				status: 'done',
				durationMs: Date.now() - startedAt,
				textOutput: result.outputText ?? result.outputFiles?.['assay-output.tsv'] ?? '',
			},
		}
	}

	const scriptContents = await selectedAssay.file.text()
	const descriptor: GenomeDescriptor = await buildGenomeDescriptor(selectedGenome)
	const genomeKey = selectedGenome.primary.name
	const result = await runFile({
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
