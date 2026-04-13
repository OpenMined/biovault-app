import { generatedAssayManifests } from '@/lib/generated-assay-manifests'

export type AssayDiscoverCategory = 'traits' | 'ancestry' | 'pgx' | 'risk'

export type AssayPrivacy = {
	externalUrls: string[]
	mode: string
	storesResultsLocally: boolean
	uploadsData: boolean
}

export type AssayInterpretationState = {
	body: string
	caveat: string | null
	headline: string
}

export type AssayMemberItem = {
	alts: string[]
	id: string
	kind: 'SNV' | 'INDEL'
	location: string | null
	note: string
	ref?: string | null
	rsid?: string | null
}

export type AssayMemberGroup = {
	gene: string
	items: AssayMemberItem[]
}

export type AssayManifest = {
	assayMembers: AssayMemberGroup[]
	bundledAssay: {
		assayAssetModuleId: number
		assayPath: string
		fileAssetModuleIds: Record<string, number>
	}
	category: AssayDiscoverCategory
	compatibility: {
		assemblies: string[]
		notes: string[]
		worksWith: string[]
	}
	description: string
	disclaimer: string | null
	files: string[]
	id: string
	interpretation: {
		matched: AssayInterpretationState
		missing: AssayInterpretationState
		normal: AssayInterpretationState
		partial: AssayInterpretationState
	}
	packageVersion: string
	privacy: AssayPrivacy
	sourceOfTruth: string
	summary: string
	subtitle: string
	tags: string[]
	title: string
	ui: {
		template: string
		version: string
	}
}

export const assayManifests: AssayManifest[] = generatedAssayManifests

export function getAssayManifestById(id: string) {
	return assayManifests.find((manifest) => manifest.id === id) ?? null
}

export function listAssayManifests() {
	return assayManifests
}
