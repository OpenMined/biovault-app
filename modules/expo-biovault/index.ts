import ExpoBiovaultModule, { type AnalysisResult } from './src/ExpoBiovaultModule'

// ts-prune-ignore-next
export async function processGenomeFile(
	inputPath: string,
	customName: string,
	outputDir: string
): Promise<string> {
	return await ExpoBiovaultModule.processGenomeFile(inputPath, customName, outputDir)
}

// ts-prune-ignore-next
export async function analyzeClinVarMatches(
	userDbPath: string,
	clinvarDbPath: string
): Promise<AnalysisResult> {
	const resultJson = await ExpoBiovaultModule.analyzeClinVarMatches(userDbPath, clinvarDbPath)
	return JSON.parse(resultJson)
}

// ts-prune-ignore-next
export function rust_add(a: number, b: number): number {
	return ExpoBiovaultModule.rust_add(a, b)
}

// Export types
// ts-prune-ignore-next
export type { AnalysisResult, ClinVarVariant, GeneGroup } from './src/ExpoBiovaultModule'
