import { NativeModule, requireNativeModule } from 'expo'

export interface AnalysisResult {
	matches: ClinVarVariant[]
	gene_groups: GeneGroup[]
	rsids_searched: number
	matches_found: number
}

export interface ClinVarVariant {
	rsid: string
	chrom: string
	pos: number
	ref_allele: string
	alt_allele: string
	gene: string
	clnsig: string
	clnrevstat: string
	condition: string
	user_genotype?: string
}

export interface GeneGroup {
	gene: string
	variants: ClinVarVariant[]
	most_significant: string
	significance_score: number
	pathogenic_count: number
	likely_pathogenic_count: number
	uncertain_count: number
	conflicting_count: number
	total_variants: number
	unique_rsids: number
	conditions: string[]
}

declare class ExpoBiovaultModule extends NativeModule {
	processGenomeFile(inputPath: string, customName: string, outputDir: string): Promise<string>
	analyzeClinVarMatches(userDbPath: string, clinvarDbPath: string): Promise<string>
	rust_add(a: number, b: number): number
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ExpoBiovaultModule>('ExpoBiovault')
