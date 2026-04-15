import type {
	Assembly,
	DetectedKind,
	DetectionConfidence,
	Inspection,
	SourceMetadata,
} from './types'

// TypeScript port of bioscript-formats/src/inspect.rs.
// Keep in sync with the Rust implementation. Heuristics operate on:
//   - a file name (lowercased)
//   - up to 64 sampled lines of textual content (plain or unzipped)
// Binary formats (BAM/CRAM/FASTA) are detected from file extension alone.

const MAX_SAMPLE_LINES = 64

export type InspectInput = {
	name: string
	container: 'plain' | 'zip'
	selectedEntry?: string
	sampleLines: string[]
	sizeBytes?: number
}

export function inspectFromSample(input: InspectInput): Inspection {
	const started = typeof performance !== 'undefined' ? performance.now() : Date.now()
	const evidence: string[] = []
	const warnings: string[] = []

	const nameForKind = input.container === 'zip' && input.selectedEntry ? input.selectedEntry : input.name
	const lower = nameForKind.toLowerCase()

	let detectedKind: DetectedKind = 'unknown'
	if (lower.endsWith('.cram')) {
		evidence.push('extension .cram')
		detectedKind = 'alignment_cram'
	} else if (lower.endsWith('.bam')) {
		evidence.push('extension .bam')
		detectedKind = 'alignment_bam'
	} else if (lower.endsWith('.fa') || lower.endsWith('.fasta')) {
		evidence.push('reference fasta extension')
		detectedKind = 'reference_fasta'
	} else if (looksLikeVcfLines(input.sampleLines)) {
		evidence.push('vcf header markers')
		detectedKind = 'vcf'
	} else if (looksLikeGenotypeText(input.sampleLines)) {
		const lowered = input.sampleLines.join('\n').toLowerCase()
		if (lowered.includes('rsid') || lowered.includes('allele1')) {
			evidence.push('genotype-like sampled rows and headers')
		} else {
			evidence.push('genotype-like sampled rows')
		}
		detectedKind = 'genotype_text'
	} else {
		warnings.push('file did not match known textual heuristics')
	}

	if (input.container === 'zip' && input.selectedEntry) {
		evidence.unshift(`selected zip entry ${input.selectedEntry}`)
	}

	const pathForSource = `${input.name.toLowerCase()}\n${lower}`
	const source = detectSource(pathForSource, input.sampleLines, detectedKind)
	const assembly = detectAssembly(pathForSource, input.sampleLines)
	const phased = detectedKind === 'vcf' ? detectVcfPhasing(input.sampleLines) : undefined
	const confidence = classifyConfidence(detectedKind, input.sampleLines, source)

	const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
	return {
		fileName: input.name,
		sizeBytes: input.sizeBytes,
		container: input.container,
		selectedEntry: input.selectedEntry,
		detectedKind,
		confidence,
		assembly,
		phased,
		source,
		hasIndex: undefined,
		referenceMatches: undefined,
		evidence,
		warnings,
		durationMs: Math.round(now - started),
	}
}

function looksLikeVcfLines(lines: string[]): boolean {
	return lines.some((line) => {
		const trimmed = line.trimStart()
		return trimmed.startsWith('##fileformat=VCF') || trimmed.startsWith('#CHROM\t')
	})
}

function looksLikeGenotypeText(lines: string[]): boolean {
	let checked = 0
	let valid = 0
	for (const line of lines) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue
		const fields = splitFields(trimmed)
		checked += 1
		if (matchesGenotypeShape(fields)) valid += 1
	}
	return checked > 0 && valid * 10 >= checked * 7
}

function splitFields(line: string): string[] {
	if (line.includes('\t')) {
		return line.split('\t').map((f) => f.trim())
	}
	if (line.includes(',')) {
		return line.split(',').map((f) => f.trim().replace(/^"(.*)"$/, '$1'))
	}
	return line.split(/\s+/).filter((f) => f.length > 0)
}

function matchesGenotypeShape(fields: string[]): boolean {
	if (fields.length < 4) return false
	const first = fields[0] ?? ''
	if (!(first.startsWith('rs') || first.startsWith('i'))) return false
	const chrIdx = fields.findIndex((f) => isValidChromosome(f))
	if (chrIdx < 0) return false
	for (let posIdx = chrIdx + 1; posIdx < fields.length; posIdx += 1) {
		if (!/^\d+$/.test(fields[posIdx] ?? '')) continue
		for (let i = posIdx + 1; i < fields.length; i += 1) {
			if (isValidGenotype(fields[i] ?? '')) return true
		}
		if (
			posIdx + 2 < fields.length &&
			isValidAllele(fields[posIdx + 1] ?? '') &&
			isValidAllele(fields[posIdx + 2] ?? '')
		) {
			return true
		}
	}
	return false
}

function isValidChromosome(value: string): boolean {
	const trimmed = value.trim().replace(/^chr/i, '')
	if (/^\d+$/.test(trimmed)) {
		const n = Number.parseInt(trimmed, 10)
		return n >= 1 && n <= 26
	}
	return ['X', 'Y', 'M', 'MT', 'XY'].includes(trimmed.toUpperCase())
}

function isValidGenotype(value: string): boolean {
	const trimmed = value.trim().toUpperCase()
	if (trimmed.length === 0 || trimmed.length > 4) return false
	return [...trimmed].every((ch) => 'ACGTID-0'.includes(ch))
}

function isValidAllele(value: string): boolean {
	const trimmed = value.trim().toUpperCase()
	return ['A', 'C', 'G', 'T', 'I', 'D', '-', '0'].includes(trimmed)
}

function detectSource(
	lowerNameCombined: string,
	sampleLines: string[],
	kind: DetectedKind,
): SourceMetadata | undefined {
	const header = sampleLines
		.filter((line) => line.startsWith('#') || line.startsWith('//'))
		.map((line) => line.toLowerCase())
		.join('\n')
	const combined = `${lowerNameCombined}\n${header}`
	const normalized = combined.replace(/[._-]/g, ' ')
	const evidence: string[] = []
	let vendor: string | undefined
	let platformVersion: string | undefined
	let confidence: DetectionConfidence = 'unknown'

	if (normalized.includes('genes for good') || normalized.includes('geneforgood')) {
		vendor = 'Genes for Good'
		confidence = 'strong_heuristic'
		evidence.push('Genes for Good header')
		const version = extractTokenAfterMarker(header, 'genes for good ')
		if (version) {
			platformVersion = version
			evidence.push('Genes for Good version header')
		}
	} else if (normalized.includes('23andme') || normalized.includes('23&me')) {
		vendor = '23andMe'
		confidence = 'strong_heuristic'
		evidence.push('23andMe header/export name')
		for (const v of ['v2', 'v3', 'v4', 'v5']) {
			if (normalized.includes(` ${v} `) || lowerNameCombined.includes(`/${v}/`)) {
				platformVersion = v
				evidence.push(`${v} token`)
				break
			}
		}
	} else if (normalized.includes('ancestrydna') || normalized.includes('ancestry com dna')) {
		vendor = 'AncestryDNA'
		confidence = 'strong_heuristic'
		evidence.push('AncestryDNA header/export name')
		const version = extractAfterMarker(header, 'array version:')
		if (version) {
			platformVersion = canonicalizeAncestryVersion(version)
			evidence.push('AncestryDNA array version header')
		}
	} else if (
		normalized.includes('family tree dna') ||
		normalized.includes('familytreedna') ||
		normalized.includes('ftdna')
	) {
		vendor = 'FamilyTreeDNA'
		confidence = 'strong_heuristic'
		evidence.push('FamilyTreeDNA header/export name')
	} else if (
		normalized.includes('dynamic dna') ||
		normalized.includes('dynamicdnalabs') ||
		normalized.includes('ddna laboratories') ||
		normalized.includes('ddna')
	) {
		vendor = 'Dynamic DNA'
		confidence = 'strong_heuristic'
		evidence.push('Dynamic DNA header')
		if (normalized.includes('gsav3 dtc')) {
			platformVersion = 'GSAv3-DTC'
			evidence.push('GSAv3-DTC token')
		} else if (normalized.includes('gsav3')) {
			platformVersion = 'GSAv3'
			evidence.push('GSAv3 token')
		}
	} else if (normalized.includes('myheritage')) {
		vendor = 'MyHeritage'
		confidence = 'strong_heuristic'
		evidence.push('MyHeritage header/export name')
	} else if (normalized.includes('sequencing com') && kind === 'vcf') {
		vendor = 'Sequencing.com'
		confidence = 'weak_heuristic'
		evidence.push('sequencing.com header text')
	}

	if (!vendor) return undefined
	return { vendor, platformVersion, confidence, evidence }
}

function extractAfterMarker(text: string, marker: string): string | undefined {
	for (const line of text.split('\n')) {
		const trimmed = line.trim()
		const idx = trimmed.toLowerCase().indexOf(marker)
		if (idx >= 0) {
			return trimmed
				.slice(idx + marker.length)
				.trim()
				.replace(/\.+$/, '')
		}
	}
	return undefined
}

function extractTokenAfterMarker(text: string, marker: string): string | undefined {
	const after = extractAfterMarker(text, marker)
	if (!after) return undefined
	const first = after.split(/\s+/)[0] ?? ''
	return first.replace(/:+$/, '')
}

function canonicalizeAncestryVersion(value: string): string {
	const trimmed = value.trim()
	if (trimmed.startsWith('v')) return `V${trimmed.slice(1)}`
	return trimmed
}

function detectAssembly(lowerNameCombined: string, sampleLines: string[]): Assembly | undefined {
	const header = sampleLines.join('\n').toLowerCase()
	const combined = `${lowerNameCombined}\n${header}`
	if (combined.includes('build 38') || combined.includes('grch38') || combined.includes('hg38')) {
		return 'grch38'
	}
	if (
		combined.includes('build 37') ||
		combined.includes('grch37') ||
		combined.includes('hg19') ||
		combined.includes('37.1')
	) {
		return 'grch37'
	}
	return undefined
}

function detectVcfPhasing(lines: string[]): boolean | undefined {
	let sawSlash = false
	for (const line of lines) {
		if (line.startsWith('#')) continue
		const fields = line.split('\t')
		if (fields.length < 10) continue
		const gt = (fields[9] ?? '').split(':')[0]?.trim() ?? ''
		if (gt.includes('|')) return true
		if (gt.includes('/')) sawSlash = true
	}
	return sawSlash ? false : undefined
}

function classifyConfidence(
	kind: DetectedKind,
	sampleLines: string[],
	source: SourceMetadata | undefined,
): DetectionConfidence {
	if (kind === 'vcf' && looksLikeVcfLines(sampleLines)) return 'authoritative'
	if (kind === 'alignment_cram' || kind === 'alignment_bam' || kind === 'reference_fasta') {
		return 'authoritative'
	}
	if (kind === 'genotype_text') return source ? 'strong_heuristic' : 'weak_heuristic'
	if (kind === 'unknown') return 'unknown'
	if (kind === 'vcf') return 'strong_heuristic'
	return 'unknown'
}

export function sampleLinesFromText(text: string, limit: number = MAX_SAMPLE_LINES): string[] {
	const out: string[] = []
	let start = 0
	for (let i = 0; i < text.length && out.length < limit; i += 1) {
		if (text.charCodeAt(i) === 10 /* \n */) {
			let end = i
			if (end > start && text.charCodeAt(end - 1) === 13 /* \r */) end -= 1
			out.push(text.slice(start, end))
			start = i + 1
		}
	}
	if (out.length < limit && start < text.length) {
		out.push(text.slice(start).replace(/\r$/, ''))
	}
	return out
}
