import ExpoBiovaultModule from './src/ExpoBiovaultModule'

// ts-prune-ignore-next
export async function processGenomeFile(
	inputPath: string,
	customName: string,
	outputDir: string
): Promise<string> {
	return await ExpoBiovaultModule.processGenomeFile(inputPath, customName, outputDir)
}

// Export types
// ts-prune-ignore-next
export type { ClinVarVariant, GeneGroup } from './src/ExpoBiovaultModule'
