import ExpoBiovaultModule from './src/ExpoBiovaultModule'

export async function processGenomeFile(
	inputPath: string,
	customName: string,
	outputDir: string
): Promise<string> {
	return await ExpoBiovaultModule.processGenomeFile(inputPath, customName, outputDir)
}

export function rust_add(a: number, b: number): number {
	return ExpoBiovaultModule.rust_add(a, b)
}
