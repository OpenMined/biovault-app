/**
 * Super-fast user genome storage using direct SQLite file creation
 * Similar to the ClinVar converter approach
 */

import * as SQLite from 'expo-sqlite'
import { Directory, File, Paths } from 'expo-file-system'
import { type ParsedGenomeData } from './23andme-parser'

export interface UserGenomeDatabase {
	dbName: string
	fileName: string
	uploadDate: string
	totalVariants: number
	rsidCount: number
}

const MANIFEST_FILE_NAME = 'user_genomes.json'

async function readManifest(): Promise<UserGenomeDatabase[]> {
	try {
		const manifest = new File(Paths.document, MANIFEST_FILE_NAME)
		if (!manifest.exists) return []
		const content = await manifest.text()
		if (!content) return []
		const parsed = JSON.parse(content)
		return Array.isArray(parsed) ? (parsed as UserGenomeDatabase[]) : []
	} catch {
		return []
	}
}

async function writeManifest(entries: UserGenomeDatabase[]): Promise<void> {
	const manifest = new File(Paths.document, MANIFEST_FILE_NAME)
	try {
		if (!manifest.exists) {
			// Ensure file exists
			manifest.create()
		}
		await manifest.write(JSON.stringify(entries))
	} catch {
		// Ignore manifest write failures; listing will still fall back to scanning
	}
}

/**
 * Create user genome database instantly using direct SQLite creation
 */
export async function createFastGenomeDatabase(
	data: ParsedGenomeData,
	onProgress?: (message: string) => void
): Promise<UserGenomeDatabase> {
	onProgress?.('Creating optimized database...')

	// Create unique database name
	const timestamp = Date.now()
	const dbName = `user_genome_${timestamp}.db`

	// Open new database
	const db = await SQLite.openDatabaseAsync(dbName)

	try {
		// Setup for maximum speed
		await db.execAsync(`
			PRAGMA journal_mode = OFF;
			PRAGMA synchronous = OFF;
			PRAGMA cache_size = 50000;

			CREATE TABLE genome_info (
				fileName TEXT,
				uploadDate TEXT,
				totalVariants INTEGER,
				rsidCount INTEGER,
				chromosomeCount INTEGER,
				parseErrors INTEGER
			);

			CREATE TABLE variants (
				rsid TEXT,
				chromosome TEXT,
				position INTEGER,
				genotype TEXT
			);
		`)

		onProgress?.('Inserting metadata...')

		// Insert file info
		await db.runAsync(`INSERT INTO genome_info VALUES (?, ?, ?, ?, ?, ?)`, [
			data.fileName,
			new Date().toISOString(),
			data.totalVariants,
			data.rsidCount,
			new Set(data.variants.map((v) => v.chromosome)).size,
			data.parseErrors.length,
		])

		onProgress?.('Bulk inserting all variants...')

		// Create one giant INSERT statement (fastest possible)
		const valueStrings = data.variants
			.map(
				(v) =>
					`('${v.rsid.replace(/'/g, "''")}','${v.chromosome}',${v.position},'${v.genotype.replace(
						/'/g,
						"''"
					)}')`
			)
			.join(',')

		await db.execAsync(`
			INSERT INTO variants (rsid, chromosome, position, genotype)
			VALUES ${valueStrings}
		`)

		onProgress?.('Creating indexes...')

		// Add indexes after all data is inserted
		await db.execAsync(`
			CREATE INDEX idx_rsid ON variants(rsid);
			CREATE INDEX idx_chr_pos ON variants(chromosome, position);
			VACUUM;
		`)

		onProgress?.('Database ready!')
	} finally {
		await db.closeAsync()
	}

	const created: UserGenomeDatabase = {
		dbName,
		fileName: data.fileName,
		uploadDate: new Date().toISOString(),
		totalVariants: data.totalVariants,
		rsidCount: data.rsidCount,
	}

	// Persist in manifest for fast listing
	const current = await readManifest()
	const withoutDupes = current.filter((e) => e.dbName !== created.dbName)
	await writeManifest([created, ...withoutDupes])

	return created
}

/**
 * Get rsIDs from a user genome database for ClinVar matching
 */
export async function getRsidsFromUserDatabase(dbName: string): Promise<string[]> {
	const db = await SQLite.openDatabaseAsync(dbName)

	try {
		const results = await db.getAllAsync<{ rsid: string }>(
			`SELECT DISTINCT rsid FROM variants WHERE rsid LIKE 'rs%' ORDER BY rsid`
		)
		return results.map((r) => r.rsid)
	} finally {
		await db.closeAsync()
	}
}

/**
 * Get user's genotype for specific rsIDs
 */
export async function getUserGenotypes(
	dbName: string,
	rsids: string[]
): Promise<
	{
		rsid: string
		chromosome: string
		position: number
		genotype: string
	}[]
> {
	if (rsids.length === 0) return []

	const db = await SQLite.openDatabaseAsync(dbName)

	try {
		const results: {
			rsid: string
			chromosome: string
			position: number
			genotype: string
		}[] = []

		// Process in chunks
		const chunkSize = 999
		for (let i = 0; i < rsids.length; i += chunkSize) {
			const chunk = rsids.slice(i, i + chunkSize)
			const placeholders = chunk.map(() => '?').join(',')

			const chunkResults = await db.getAllAsync<{
				rsid: string
				chromosome: string
				position: number
				genotype: string
			}>(
				`SELECT rsid, chromosome, position, genotype
				 FROM variants
				 WHERE rsid IN (${placeholders})`,
				chunk
			)

			results.push(...chunkResults)
		}

		return results
	} finally {
		await db.closeAsync()
	}
}

/**
 * List all user genome databases
 */
export async function listUserGenomeDatabases(): Promise<UserGenomeDatabase[]> {
	// Prefer manifest for speed and cross-platform compatibility
	const fromManifest = await readManifest()
	const databases: UserGenomeDatabase[] = [...fromManifest]

	function listSqliteFilesFrom(directory: Directory): File[] {
		try {
			const items = directory.list()
			return items.filter(
				(item): item is File =>
					item instanceof File && item.name.startsWith('genome') && item.name.endsWith('.sqlite')
			)
		} catch {
			return []
		}
	}

	// If manifest is empty, scan filesystem as a fallback
	let sqliteFiles: File[] = []
	if (databases.length === 0) {
		// Check default SQLite location first, then common locations with the new FileSystem API
		const candidates: Directory[] = [
			new Directory(SQLite.defaultDatabaseDirectory),
			new Directory(Paths.document),
			new Directory(Paths.document, 'SQLite'),
			new Directory(Paths.cache),
			new Directory(Paths.cache, 'SQLite'),
		]

		for (const dir of candidates) {
			if (sqliteFiles.length > 0) break
			sqliteFiles = listSqliteFilesFrom(dir)
		}
	}

	for (const file of sqliteFiles) {
		try {
			const db = await SQLite.openDatabaseAsync(file.name)

			const info = await db.getFirstAsync<{
				fileName: string
				uploadDate: string
				totalVariants: number
				rsidCount: number
			}>('SELECT * FROM genome_info LIMIT 1')

			await db.closeAsync()

			if (info) {
				const entry: UserGenomeDatabase = {
					dbName: file.name,
					fileName: info.fileName,
					uploadDate: info.uploadDate,
					totalVariants: info.totalVariants,
					rsidCount: info.rsidCount,
				}

				// De-dupe by dbName
				if (!databases.some((d) => d.dbName === entry.dbName)) {
					databases.push(entry)
				}
			}
		} catch (error) {
			console.warn(`Failed to read ${file.name}:`, error)
		}
	}

	// Update manifest with the merged set
	const unique = databases.reduce<UserGenomeDatabase[]>((acc, cur) => {
		if (!acc.some((e) => e.dbName === cur.dbName)) acc.push(cur)
		return acc
	}, [])
	await writeManifest(unique)

	return databases.sort(
		(a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
	)
}

/**
 * Delete a user genome database
 */
export async function deleteUserGenomeDatabase(dbName: string): Promise<void> {
	await SQLite.deleteDatabaseAsync(dbName)

	// Remove from manifest
	const current = await readManifest()
	await writeManifest(current.filter((e) => e.dbName !== dbName))
}
