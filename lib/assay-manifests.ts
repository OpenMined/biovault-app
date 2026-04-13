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
	runtimeKind?: string | null
	rsid?: string | null
}

export type AssayMemberGroup = {
	gene: string
	items: AssayMemberItem[]
}

export type RunnableAssayMemberEntry = {
	type: 'runnable'
	variant: AssayMemberItem
}

export type UnsupportedAssayMemberEntry = {
	reason: string
	type: 'unsupported'
	variant: AssayMemberItem
}

export type AssayMemberEntry = RunnableAssayMemberEntry | UnsupportedAssayMemberEntry

export type InstalledAssayPackageSource = {
	assayPath: string
	compiledPath: string
	fileUris: Record<string, string>
	installedAt: string
	rootUri: string
	source: string
	type: 'installed'
}

export type RemoteAssayPackageSource = {
	assayPath: string
	artifactFormat: string
	artifactSha256: string
	artifactSize: number
	artifactUrl: string
	compiledPath: string
	location: {
		baseUrl: string
		owner: string
		path: string
		ref: string
		repo: string
	}
	source: string
	type: 'remote'
}

export type AssayPackageSource =
	| InstalledAssayPackageSource
	| RemoteAssayPackageSource

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
	runnableMembers: AssayMemberEntry[]
	sourceOfTruth: string
	summary: string
	subtitle: string
	tags: string[]
	title: string
	ui: {
		template: string
		version: string
	}
	unsupportedMembers: UnsupportedAssayMemberEntry[]
}
