export type FileRef =
	| { kind: 'path'; path: string; name: string; size?: number }
	| { kind: 'handle'; handle: FileSystemFileHandle; name: string; size?: number }
	| { kind: 'blob'; file: File }
	| { kind: 'url'; url: string }

export type DetectedKind =
	| 'genotype_text'
	| 'vcf'
	| 'bcf'
	| 'alignment_cram'
	| 'alignment_bam'
	| 'reference_fasta'
	| 'unknown'

export type DetectionConfidence =
	| 'authoritative'
	| 'strong_heuristic'
	| 'weak_heuristic'
	| 'unknown'

export type Assembly = 'grch37' | 'grch38'

export type SourceMetadata = {
	vendor: string
	platformVersion?: string
	confidence: DetectionConfidence
	evidence: string[]
}

export type Inspection = {
	fileName: string
	sizeBytes?: number
	container: 'plain' | 'zip'
	detectedKind: DetectedKind
	confidence: DetectionConfidence
	assembly?: Assembly
	phased?: boolean
	source?: SourceMetadata
	selectedEntry?: string
	hasIndex?: boolean
	referenceMatches?: boolean
	evidence: string[]
	warnings: string[]
	durationMs: number
}

export type InspectOptions = {
	reference?: FileRef
}

export type PickResult = {
	primary: FileRef
	reference?: FileRef
}

export type Backend = {
	pickPrimary(): Promise<FileRef | null>
	pickReference(): Promise<FileRef | null>
	inspect(ref: FileRef, options?: InspectOptions): Promise<Inspection>
	supportsUrlInput: boolean
	supportsDragDrop: boolean
	/** True on platforms that reference files in place (desktop/web Chromium handles). */
	linksInPlace: boolean
	label: string
}

export function fileRefName(ref: FileRef): string {
	switch (ref.kind) {
		case 'path':
			return ref.name
		case 'handle':
			return ref.name
		case 'blob':
			return ref.file.name
		case 'url':
			try {
				const u = new URL(ref.url)
				const last = u.pathname.split('/').filter(Boolean).pop()
				return last ?? ref.url
			} catch {
				return ref.url
			}
	}
}

export function fileRefSize(ref: FileRef): number | undefined {
	switch (ref.kind) {
		case 'path':
			return ref.size
		case 'handle':
			return ref.size
		case 'blob':
			return ref.file.size
		case 'url':
			return undefined
	}
}

export function needsReference(inspection: Inspection): boolean {
	return (
		(inspection.detectedKind === 'alignment_cram' || inspection.detectedKind === 'alignment_bam') &&
		inspection.referenceMatches === undefined
	)
}
