export type LabRuntimeRoot = {
	root: string
	outputFile: string
	cacheDir?: string
	readOutputText: () => Promise<string>
}

export async function prepareLabRuntimeRoot(_outputFileName: string): Promise<LabRuntimeRoot | null> {
	return null
}
