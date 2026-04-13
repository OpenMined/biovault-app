import type { AssayManifest } from '@/lib/assay-manifests'
import type { HomeImportedDocument } from '@/lib/home-import'

export type AssayCompatibilityStatus = 'likely-supported' | 'unknown' | 'unlikely'

export type AssayInputProfile = {
	displayLabel: string
	extension: string | null
	source: 'chip' | 'vcf' | 'compressed-text' | 'cram' | 'unknown'
}

const COMPOUND_EXTENSIONS = ['.vcf.gz', '.vcf.bz2', '.tsv.bz2', '.txt.zip'] as const

function detectExtension(name: string): string | null {
	const lowerName = name.trim().toLowerCase()
	const compound = COMPOUND_EXTENSIONS.find((extension) => lowerName.endsWith(extension))
	if (compound) {
		return compound
	}

	const lastDot = lowerName.lastIndexOf('.')
	if (lastDot === -1) {
		return null
	}

	return lowerName.slice(lastDot)
}

function detectSource(extension: string | null): AssayInputProfile['source'] {
	if (!extension) {
		return 'unknown'
	}

	if (extension === '.vcf' || extension === '.vcf.gz' || extension === '.vcf.bz2') {
		return 'vcf'
	}

	if (extension === '.cram') {
		return 'cram'
	}

	if (extension === '.zip' || extension === '.gz' || extension === '.bz2' || extension === '.txt.zip' || extension === '.tsv.bz2') {
		return 'compressed-text'
	}

	if (extension === '.txt' || extension === '.tsv' || extension === '.csv') {
		return 'chip'
	}

	return 'unknown'
}

function getCompatibilityTokens(profile: AssayInputProfile): string[] {
	switch (profile.source) {
		case 'chip':
		case 'compressed-text':
			return ['23andme']
		case 'vcf':
			return ['vcf', 'wgs']
		case 'cram':
			return ['cram', 'wgs']
		default:
			return []
	}
}

export function getAssayInputProfile(document: HomeImportedDocument | null): AssayInputProfile {
	if (!document) {
		return {
			displayLabel: 'Bundled sample data',
			extension: '.txt',
			source: 'chip',
		}
	}

	const extension = detectExtension(document.originalName || document.name)
	return {
		displayLabel: document.name,
		extension,
		source: detectSource(extension),
	}
}

export function assessAssayCompatibility(
	assay: AssayManifest,
	document: HomeImportedDocument | null
): {
	matchedByDeclaredInput: boolean
	profile: AssayInputProfile
	status: AssayCompatibilityStatus
	summary: string
} {
	const profile = getAssayInputProfile(document)
	const supportedInputs = assay.compatibility.worksWith.map((value) => value.toLowerCase())
	const profileTokens = getCompatibilityTokens(profile)
	const matchedByDeclaredInput = profileTokens.some((token) => supportedInputs.includes(token))

	let status: AssayCompatibilityStatus = 'unknown'
	let summary = 'This file may work, but the app cannot confidently confirm compatibility yet.'

	if (matchedByDeclaredInput) {
		status = 'likely-supported'
		summary = 'This file type is a strong match for the assay package metadata.'
	} else if (profile.source === 'unknown' && !profile.extension) {
		status = 'unknown'
		summary = 'The file type could not be identified from its name.'
	} else {
		status = 'unlikely'
		summary = 'This file format is not a strong match for the assay metadata.'
	}

	return {
		profile,
		matchedByDeclaredInput,
		status,
		summary,
	}
}
