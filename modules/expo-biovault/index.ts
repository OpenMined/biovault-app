import ExpoBiovaultModule from './src/ExpoBiovaultModule'

export async function processGenomeFile(
	inputPath: string,
	customName: string,
	outputDir: string
): Promise<string> {
	return await ExpoBiovaultModule.processGenomeFile(inputPath, customName, outputDir)
}
