import {
	assayManifests,
	getAssayManifestById,
	type AssayCatalogCategory,
	type AssayPrivacyLabel,
	type AssayRunMode,
	type AssayVariantExampleGroup,
} from '@/lib/assay-manifests'

export type TestPrivacyLabel = AssayPrivacyLabel

export type TestVariantExample = AssayVariantExampleGroup

export type TestCatalogEntry = {
	category: AssayCatalogCategory
	description: string
	files: string[]
	privacy: TestPrivacyLabel
	resultBuckets: string[]
	runMode: AssayRunMode
	slug: string
	sources: string[]
	subtitle: string
	title: string
	variantExamples: TestVariantExample[]
}

export const testCatalog: TestCatalogEntry[] = assayManifests.map((manifest) => ({
	slug: manifest.id,
	category: manifest.catalogCategory,
	title: manifest.title,
	subtitle: manifest.subtitle,
	description: manifest.description,
	files: manifest.files,
	sources: manifest.sources,
	runMode: manifest.runMode,
	privacy: manifest.privacy,
	resultBuckets: manifest.resultBuckets,
	variantExamples: manifest.variantExamples,
}))

export function getTestBySlug(slug: string) {
	const manifest = getAssayManifestById(slug)
	if (!manifest) {
		return null
	}

	return {
		slug: manifest.id,
		category: manifest.catalogCategory,
		title: manifest.title,
		subtitle: manifest.subtitle,
		description: manifest.description,
		files: manifest.files,
		sources: manifest.sources,
		runMode: manifest.runMode,
		privacy: manifest.privacy,
		resultBuckets: manifest.resultBuckets,
		variantExamples: manifest.variantExamples,
	}
}
