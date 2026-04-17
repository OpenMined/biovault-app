import fs from 'node:fs/promises'
import path from 'node:path'

import YAML from 'yaml'

const repoRoot = process.cwd()
const defaultSourceRoot = path.resolve(repoRoot, '../exvitae/exvitae/assays')
const targetRoot = path.resolve(repoRoot, 'assays/generated/exvitae')

function parseArgs(argv) {
	const args = { clean: false, source: defaultSourceRoot }
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i]
		if (arg === '--clean') {
			args.clean = true
			continue
		}
		if (arg === '--source') {
			const next = argv[i + 1]
			if (!next) throw new Error('--source requires a path')
			args.source = path.resolve(repoRoot, next)
			i += 1
			continue
		}
		throw new Error(`Unknown argument: ${arg}`)
	}
	return args
}

async function listFiles(root) {
	const results = []
	async function walk(dir) {
		const entries = await fs.readdir(dir, { withFileTypes: true })
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name)
			if (entry.isDirectory()) {
				await walk(fullPath)
				continue
			}
			results.push(fullPath)
		}
	}
	await walk(root)
	return results
}

function normaliseRsids(rsids) {
	if (!Array.isArray(rsids)) return []
	return rsids
		.map((value) => {
			if (typeof value === 'string') return value
			if (value && typeof value === 'object' && 'value' in value) return String(value.value)
			return null
		})
		.filter(Boolean)
}

function toCatalogEntry(doc, relativePath) {
	const coordinates = doc.coordinates ?? {}
	return {
		name: String(doc.name ?? path.basename(relativePath)),
		gene: String(doc.gene ?? ''),
		rsids: normaliseRsids(doc.identifiers?.rsids),
		schema: String(doc.schema ?? ''),
		summary: String(doc.summary ?? ''),
		relativePath,
		coordinates: {
			grch37: coordinates.grch37 ?? null,
			grch38: coordinates.grch38 ?? null,
		},
	}
}

async function main() {
	const { clean, source } = parseArgs(process.argv.slice(2))

	const sourceStat = await fs.stat(source).catch(() => null)
	if (!sourceStat?.isDirectory()) {
		throw new Error(`Source directory not found: ${source}`)
	}

	if (clean) {
		await fs.rm(targetRoot, { recursive: true, force: true })
	}
	await fs.mkdir(targetRoot, { recursive: true })

	const files = await listFiles(source)
	const yamlFiles = files.filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
	const imported = []

	for (const sourceFile of yamlFiles) {
		const relativePath = path.relative(source, sourceFile)
		const raw = await fs.readFile(sourceFile, 'utf8')
		let doc
		try {
			doc = YAML.parse(raw)
		} catch (error) {
			console.warn(`Skipping invalid YAML: ${relativePath} (${error instanceof Error ? error.message : String(error)})`)
			continue
		}
		const schema = String(doc?.schema ?? '')
		if (!schema.startsWith('bioscript:variant:')) continue

		const targetFile = path.join(targetRoot, relativePath)
		await fs.mkdir(path.dirname(targetFile), { recursive: true })
		await fs.writeFile(targetFile, raw, 'utf8')
		imported.push(toCatalogEntry(doc, relativePath))
	}

	imported.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
	await fs.writeFile(
		path.join(targetRoot, 'catalog.json'),
		`${JSON.stringify(
			{
				generatedAt: new Date().toISOString(),
				sourceRoot: source,
				totalAssays: imported.length,
				assays: imported,
			},
			null,
			2,
		)}\n`,
		'utf8',
	)

	console.log(`Synced ${imported.length} simple assays from ${source} to ${targetRoot}`)
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error))
	process.exitCode = 1
})
