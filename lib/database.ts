/**
 * ClinVar SQLite database manager for Biovault app.
 * Handles one-time asset copying and provides query interface.
 */

import * as SQLite from 'expo-sqlite'

export interface ClinVarVariant {
	rsid: string
	chrom: string
	pos: number
	ref: string
	alt: string
	gene: string
	clnsig: string
	clnrevstat: string
	condition: string
}

// export interface DatabaseStats {
// 	totalVariants: number
// 	pathogenicCount: number
// 	likelyPathogenicCount: number
// 	uncertainCount: number
// }

// Note: Database instance is now managed by SQLiteProvider at the root level.
// Components should use useSQLiteContext() hook to access the database directly.

// /**
//  * Get database statistics for summary display.
//  * Note: This function should be called from components that have access to useSQLiteContext().
//  */
// export async function getDatabaseStats(db: SQLite.SQLiteDatabase): Promise<DatabaseStats> {
// 	const totalResult = await db.getFirstAsync<{ count: number }>(
// 		'SELECT COUNT(*) as count FROM variants'
// 	)
//
// 	const pathogenicResult = await db.getFirstAsync<{ count: number }>(
// 		'SELECT COUNT(*) as count FROM variants WHERE clnsig LIKE "%Pathogenic%" AND clnsig NOT LIKE "%Likely_pathogenic%"'
// 	)
//
// 	const likelyPathogenicResult = await db.getFirstAsync<{ count: number }>(
// 		'SELECT COUNT(*) as count FROM variants WHERE clnsig LIKE "%Likely_pathogenic%"'
// 	)
//
// 	const uncertainResult = await db.getFirstAsync<{ count: number }>(
// 		'SELECT COUNT(*) as count FROM variants WHERE clnsig LIKE "%Uncertain%"'
// 	)
//
// 	return {
// 		totalVariants: totalResult?.count || 0,
// 		pathogenicCount: pathogenicResult?.count || 0,
// 		likelyPathogenicCount: likelyPathogenicResult?.count || 0,
// 		uncertainCount: uncertainResult?.count || 0,
// 	}
// }

/**
 * Batch lookup variants by rsID list.
 * SQLite has a limit of 999 parameters, so we chunk large lists.
 */
export async function lookupVariantsByRsid(
	db: SQLite.SQLiteDatabase,
	rsids: string[]
): Promise<ClinVarVariant[]> {
	if (rsids.length === 0) return []

	const results: ClinVarVariant[] = []

	// Process in chunks of 999 to stay under SQLite parameter limit
	const chunkSize = 999
	for (let i = 0; i < rsids.length; i += chunkSize) {
		const chunk = rsids.slice(i, i + chunkSize)
		const placeholders = chunk.map(() => '?').join(',')
		const query = `
      SELECT rsid, chrom, pos, ref, alt, gene, clnsig, clnrevstat, condition
      FROM variants
      WHERE rsid IN (${placeholders})
      ORDER BY
        CASE
          WHEN clnsig LIKE '%Pathogenic%' AND clnsig NOT LIKE '%Likely_pathogenic%' THEN 1
          WHEN clnsig LIKE '%Likely_pathogenic%' THEN 2
          WHEN clnsig LIKE '%Uncertain%' THEN 3
          ELSE 4
        END,
        gene
    `

		const chunkResults = await db.getAllAsync<ClinVarVariant>(query, chunk)
		results.push(...chunkResults)
	}

	return results
}

// /**
//  * Filter variants by clinical significance.
//  */
// export function filterVariantsBySignificance(
// 	variants: ClinVarVariant[],
// 	includePathogenic: boolean = true,
// 	includeLikelyPathogenic: boolean = true,
// 	includeUncertain: boolean = true,
// 	includeOther: boolean = true
// ): ClinVarVariant[] {
// 	return variants.filter((variant) => {
// 		const sig = variant.clnsig.toLowerCase()
//
// 		if (includePathogenic && sig.includes('pathogenic') && !sig.includes('likely_pathogenic')) {
// 			return true
// 		}
// 		if (includeLikelyPathogenic && sig.includes('likely_pathogenic')) {
// 			return true
// 		}
// 		if (includeUncertain && sig.includes('uncertain')) {
// 			return true
// 		}
// 		if (includeOther && !sig.includes('pathogenic') && !sig.includes('uncertain')) {
// 			return true
// 		}
//
// 		return false
// 	})
// }

// /**
//  * Get unique conditions from a list of variants.
//  */
// export function getUniqueConditions(variants: ClinVarVariant[]): string[] {
// 	const conditions = new Set<string>()
//
// 	variants.forEach((variant) => {
// 		if (
// 			variant.condition &&
// 			variant.condition !== 'not_provided' &&
// 			variant.condition !== 'not_specified'
// 		) {
// 			// Handle multiple conditions separated by |
// 			const conditionList = variant.condition.split('|')
// 			conditionList.forEach((condition) => {
// 				const cleaned = condition.trim().replace(/_/g, ' ')
// 				if (cleaned) {
// 					conditions.add(cleaned)
// 				}
// 			})
// 		}
// 	})
//
// 	return Array.from(conditions).sort()
// }

// Database lifecycle is managed by SQLiteProvider at the app root.
