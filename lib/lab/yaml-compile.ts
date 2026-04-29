import { unzipSync } from 'fflate'

export async function extractTextFromZip(
	file: File,
): Promise<{ entryName: string; contents: string } | null> {
	const buf = new Uint8Array(await file.arrayBuffer())
	let unzipped: Record<string, Uint8Array>
	try {
		unzipped = unzipSync(buf)
	} catch {
		return null
	}
	const entries = Object.keys(unzipped).filter(
		(name) => !name.endsWith('/') && !name.startsWith('__MACOSX/'),
	)
	const preferred = ['.vcf', '.txt', '.tsv', '.csv']
	const entryName = preferred
		.map((ext) => entries.find((name) => name.toLowerCase().endsWith(ext)))
		.find(Boolean)
	if (!entryName) return null
	const bytes = unzipped[entryName]
	if (!bytes) return null
	return { entryName, contents: new TextDecoder('utf-8').decode(bytes) }
}
