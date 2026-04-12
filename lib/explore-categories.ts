import { type AssayDiscoverCategory, type AssayManifest } from '@/lib/assay-manifests'
import { listAvailableAssayManifestsSync } from '@/lib/assay-registry'

export type ExploreCategorySlug = AssayDiscoverCategory

export type ExploreCategoryDefinition = {
	description: string
	example: string
	icon: 'eye' | 'heart-pulse' | 'person-standing' | 'pill'
	slug: ExploreCategorySlug
	subtitle: string
	title: string
}

export const exploreCategories: ExploreCategoryDefinition[] = [
	{
		slug: 'traits',
		title: 'Traits',
		subtitle: 'Observable features',
		description: 'Explore personal traits inferred from common variants in your local genomic file.',
		example: 'Example: eye color',
		icon: 'eye',
	},
	{
		slug: 'ancestry',
		title: 'Ancestry',
		subtitle: 'Population and heritage views',
		description: 'Browse ancestry-oriented analyses that help break down heritage mix and lineage signals.',
		example: 'Example: heritage mix',
		icon: 'person-standing',
	},
	{
		slug: 'pgx',
		title: 'Pgx',
		subtitle: 'Drug response',
		description: 'See pharmacogenomic analyses focused on how genetic variants may affect medication response.',
		example: 'Example: medication sensitivity',
		icon: 'pill',
	},
	{
		slug: 'health-risk',
		title: 'Health Risk',
		subtitle: 'Predisposition and screening',
		description: 'Review analyses around inherited risk markers and prevention-oriented health categories.',
		example: 'Example: cardiovascular risk',
		icon: 'heart-pulse',
	},
]

export function getExploreCategory(slug: string) {
	return exploreCategories.find((category) => category.slug === slug) ?? null
}

export function getAssaysForExploreCategory(slug: ExploreCategorySlug): AssayManifest[] {
	return listAvailableAssayManifestsSync()
		.filter((manifest) => manifest.category === slug)
}

export function getTestsForExploreCategory(slug: ExploreCategorySlug): AssayManifest[] {
	return getAssaysForExploreCategory(slug)
}
