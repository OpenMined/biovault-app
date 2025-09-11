/**
 * Gene grouping utilities for organizing ClinVar matches
 */

import { type ClinVarVariant } from './database'

export interface GeneGroup {
	gene: string
	variants: ClinVarVariant[]
	mostSignificant:
		| 'Pathogenic'
		| 'Likely_pathogenic'
		| 'Uncertain_significance'
		| 'Conflicting'
		| 'Benign'
	significanceScore: number
	pathogenicCount: number
	likelyPathogenicCount: number
	uncertainCount: number
	conflictingCount: number
	totalVariants: number
	uniqueRsids: number
	conditions: string[]
	alleles: Array<{ ref: string; alt: string; count: number }>
}

/**
 * Get significance score for sorting (lower = more significant)
 */
function getSignificanceScore(clnsig: string): number {
	const sig = clnsig.toLowerCase()
	if (sig.includes('pathogenic') && !sig.includes('likely')) return 1
	if (sig.includes('likely_pathogenic')) return 2
	if (sig.includes('conflicting')) return 3
	if (sig.includes('uncertain')) return 4
	if (sig.includes('benign')) return 5
	return 6
}

/**
 * Get simplified significance label
 */
function getSignificanceLabel(clnsig: string): GeneGroup['mostSignificant'] {
	const sig = clnsig.toLowerCase()
	if (sig.includes('pathogenic') && !sig.includes('likely')) return 'Pathogenic'
	if (sig.includes('likely_pathogenic')) return 'Likely_pathogenic'
	if (sig.includes('conflicting')) return 'Conflicting'
	if (sig.includes('uncertain')) return 'Uncertain_significance'
	if (sig.includes('benign')) return 'Benign'
	return 'Uncertain_significance'
}

/**
 * Group ClinVar variants by gene and calculate statistics
 */
export function groupVariantsByGene(variants: ClinVarVariant[]): GeneGroup[] {
	// Group variants by gene
	const geneMap = new Map<string, ClinVarVariant[]>()

	variants.forEach((variant) => {
		const gene = variant.gene || 'Unknown'
		if (!geneMap.has(gene)) {
			geneMap.set(gene, [])
		}
		geneMap.get(gene)!.push(variant)
	})

	// Convert to GeneGroup objects with statistics
	const geneGroups: GeneGroup[] = Array.from(geneMap.entries()).map(([gene, geneVariants]) => {
		// Calculate significance counts
		const pathogenicCount = geneVariants.filter(
			(v) =>
				v.clnsig.toLowerCase().includes('pathogenic') && !v.clnsig.toLowerCase().includes('likely')
		).length

		const likelyPathogenicCount = geneVariants.filter((v) =>
			v.clnsig.toLowerCase().includes('likely_pathogenic')
		).length

		const uncertainCount = geneVariants.filter((v) =>
			v.clnsig.toLowerCase().includes('uncertain')
		).length

		const conflictingCount = geneVariants.filter((v) =>
			v.clnsig.toLowerCase().includes('conflicting')
		).length

		// Find most significant variant for this gene
		const mostSignificantVariant = geneVariants.reduce((most, current) =>
			getSignificanceScore(current.clnsig) < getSignificanceScore(most.clnsig) ? current : most
		)

		// Get unique conditions
		const conditions = Array.from(
			new Set(
				geneVariants
					.map((v) => v.condition)
					.filter((c) => c && c !== 'not_provided' && c !== 'not_specified')
					.flatMap((c) => c.split('|'))
					.map((c) => c.trim().replace(/_/g, ' '))
					.filter((c) => c.length > 0)
			)
		).sort()

		// Get unique alleles with counts
		const alleleMap = new Map<string, number>()
		geneVariants.forEach((v) => {
			const alleleKey = `${v.ref}>${v.alt}`
			alleleMap.set(alleleKey, (alleleMap.get(alleleKey) || 0) + 1)
		})

		const alleles = Array.from(alleleMap.entries())
			.map(([allele, count]) => {
				const [ref, alt] = allele.split('>')
				return { ref: ref || '', alt: alt || '', count }
			})
			.sort((a, b) => b.count - a.count) // Sort by frequency

		// Get unique rsIDs
		const uniqueRsids = new Set(geneVariants.map((v) => v.rsid)).size

		return {
			gene,
			variants: geneVariants,
			mostSignificant: getSignificanceLabel(mostSignificantVariant.clnsig),
			significanceScore: getSignificanceScore(mostSignificantVariant.clnsig),
			pathogenicCount,
			likelyPathogenicCount,
			uncertainCount,
			conflictingCount,
			totalVariants: geneVariants.length,
			uniqueRsids,
			conditions: conditions.slice(0, 3), // Limit to top 3 conditions
			alleles: alleles.slice(0, 3), // Limit to top 3 alleles
		}
	})

	// Sort by significance (most significant first), then by gene name
	return geneGroups.sort((a, b) => {
		if (a.significanceScore !== b.significanceScore) {
			return a.significanceScore - b.significanceScore
		}
		return a.gene.localeCompare(b.gene)
	})
}

/**
 * Get color for significance level
 */
export function getSignificanceColor(significance: GeneGroup['mostSignificant']) {
	switch (significance) {
		case 'Pathogenic':
			return '#f44336'
		case 'Likely_pathogenic':
			return '#ff9800'
		case 'Conflicting':
			return '#e91e63'
		case 'Uncertain_significance':
			return '#9e9e9e'
		case 'Benign':
			return '#4caf50'
		default:
			return '#757575'
	}
}

/**
 * Get display text for significance
 */
export function getSignificanceDisplayText(significance: GeneGroup['mostSignificant']): string {
	switch (significance) {
		case 'Pathogenic':
			return 'Pathogenic'
		case 'Likely_pathogenic':
			return 'Likely Pathogenic'
		case 'Conflicting':
			return 'Conflicting'
		case 'Uncertain_significance':
			return 'Uncertain'
		case 'Benign':
			return 'Benign'
		default:
			return 'Unknown'
	}
}
