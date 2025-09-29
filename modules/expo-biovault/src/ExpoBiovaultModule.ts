import { NativeModule, requireNativeModule } from 'expo'
import { Platform } from 'react-native'

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

// Platform-specific module loading
const createModule = (): ExpoBiovaultModule => {
	if (Platform.OS === 'web') {
		// Web fallback - create a mock module
		console.warn('BioVault Rust module is not available on web. Using fallback implementation.')

		return {
			processGenomeFile: async (
				_inputPath: string,
				_customName: string,
				_outputDir: string
			): Promise<string> => {
				throw new Error(
					'Genome processing is not available on web. Please use the iOS or Android app.'
				)
			},
			analyzeClinVarMatches: async (
				_userDbPath: string,
				_clinvarDbPath: string
			): Promise<string> => {
				throw new Error(
					'ClinVar analysis is not available on web. Please use the iOS or Android app.'
				)
			},
			rust_add: (a: number, b: number): number => {
				// Simple fallback for testing
				return a + b
			},
		} as ExpoBiovaultModule
	}

	// Native platforms - load the actual native module
	return requireNativeModule<ExpoBiovaultModule>('ExpoBiovault')
}

export default createModule()
