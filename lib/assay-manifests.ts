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

export type BundledAssayPackageSource = {
	assayAssetModuleId: number
	assayPath: string
	fileAssetModuleIds: Record<string, number>
	type: 'bundled'
}

export type InstalledAssayPackageSource = {
	assayPath: string
	fileUris: Record<string, string>
	installedAt: string
	rootUri: string
	source: string
	type: 'installed'
}

export type AssayPackageSource = BundledAssayPackageSource | InstalledAssayPackageSource

export type AssayManifest = {
	assayMembers: AssayMemberGroup[]
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
	packageSource: AssayPackageSource
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
