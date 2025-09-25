/**
 * Super-fast user genome storage using direct SQLite file creation
 * Similar to the ClinVar converter approach
 */

import * as SQLite from 'expo-sqlite'
import { Directory, File, Paths } from 'expo-file-system'

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
		if (!manifest.exists) {
			console.log('Manifest file does not exist')
			return []
		}
		const content = await manifest.text()
		if (!content) {
			console.log('Manifest file is empty')
			return []
		}
		console.log('📋 Manifest contents:', content)
		const parsed = JSON.parse(content)
		return Array.isArray(parsed) ? (parsed as UserGenomeDatabase[]) : []
	} catch (error) {
		console.error('Error reading manifest:', error)
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
		const content = JSON.stringify(entries, null, 2)
		console.log('📝 Writing manifest:', content)
		await manifest.write(content)
	} catch (error) {
		console.error('Failed to write manifest:', error)
		// Ignore manifest write failures; listing will still fall back to scanning
	}
}

/**
 * Add a database created by Rust to the manifest
 */
export async function addDatabaseToManifest(
	dbPath: string,
	fileName: string
): Promise<UserGenomeDatabase> {
	console.log('Adding database to manifest:', dbPath, fileName)

	// Extract dbName from path (last component)
	const dbName = dbPath.split('/').pop() || dbPath

	// Don't try to open the database here - it's in Documents directory
	// but SQLite.openDatabaseAsync expects SQLite directory
	// Just create the manifest entry with basic info
	// The actual metadata will be read when listing databases
	const entry: UserGenomeDatabase = {
		dbName,
		fileName,
		uploadDate: new Date().toISOString(),
		totalVariants: 0, // Will be updated when actually reading the database
		rsidCount: 0, // Will be updated when actually reading the database
	}

	// Add to manifest
	const current = await readManifest()
	const withoutDupes = current.filter((e) => e.dbName !== entry.dbName)
	await writeManifest([entry, ...withoutDupes])

	console.log('Database added to manifest:', entry)
	return entry
}

/**
 * Create user genome database instantly using direct SQLite creation
 */
// export async function createFastGenomeDatabase(
// 	data: ParsedGenomeData,
// 	onProgress?: (message: string) => void
// ): Promise<UserGenomeDatabase> {
// 	onProgress?.('Creating optimized database...')

// 	// Create unique database name
// 	const timestamp = Date.now()
// 	const dbName = `user_genome_${timestamp}.db`

// 	// Open new database
// 	const db = await SQLite.openDatabaseAsync(dbName)

// 	try {
// 		// Setup for maximum speed
// 		await db.execAsync(`
// 			PRAGMA journal_mode = OFF;
// 			PRAGMA synchronous = OFF;
// 			PRAGMA cache_size = 50000;

// 			CREATE TABLE genome_metadata (
// 				file_name TEXT,
// 				upload_date TEXT,
// 				total_variants INTEGER,
// 				rsid_count INTEGER,
// 				chromosomeCount INTEGER,
// 				parseErrors INTEGER
// 			);

// 			CREATE TABLE variants (
// 				rsid TEXT,
// 				chromosome TEXT,
// 				position INTEGER,
// 				genotype TEXT
// 			);
// 		`)

// 		onProgress?.('Inserting metadata...')

// 		// Insert file info
// 		await db.runAsync(`INSERT INTO genome_metadata VALUES (?, ?, ?, ?, ?, ?)`, [
// 			data.fileName,
// 			new Date().toISOString(),
// 			data.totalVariants,
// 			data.rsidCount,
// 			new Set(data.variants.map((v) => v.chromosome)).size,
// 			data.parseErrors.length,
// 		])

// 		onProgress?.('Bulk inserting all variants...')

// 		// Create one giant INSERT statement (fastest possible)
// 		const valueStrings = data.variants
// 			.map(
// 				(v) =>
// 					`('${v.rsid.replace(/'/g, "''")}','${v.chromosome}',${v.position},'${v.genotype.replace(
// 						/'/g,
// 						"''"
// 					)}')`
// 			)
// 			.join(',')

// 		await db.execAsync(`
// 			INSERT INTO variants (rsid, chromosome, position, genotype)
// 			VALUES ${valueStrings}
// 		`)

// 		onProgress?.('Creating indexes...')

// 		// Add indexes after all data is inserted
// 		await db.execAsync(`
// 			CREATE INDEX idx_rsid ON variants(rsid);
// 			CREATE INDEX idx_chr_pos ON variants(chromosome, position);
// 			VACUUM;
// 		`)

// 		onProgress?.('Database ready!')
// 	} finally {
// 		await db.closeAsync()
// 	}

// 	const created: UserGenomeDatabase = {
// 		dbName,
// 		fileName: data.fileName,
// 		uploadDate: new Date().toISOString(),
// 		totalVariants: data.totalVariants,
// 		rsidCount: data.rsidCount,
// 	}

// 	// Persist in manifest for fast listing
// 	const current = await readManifest()
// 	const withoutDupes = current.filter((e) => e.dbName !== created.dbName)
// 	await writeManifest([created, ...withoutDupes])

// 	return created
// }

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

// /**
//  * Get user's genotype for specific rsIDs
//  */
// export async function getUserGenotypes(
// 	dbName: string,
// 	rsids: string[]
// ): Promise<
// 	{
// 		rsid: string
// 		chromosome: string
// 		position: number
// 		genotype: string
// 	}[]
// > {
// 	if (rsids.length === 0) return []

// 	const db = await SQLite.openDatabaseAsync(dbName)

// 	try {
// 		const results: {
// 			rsid: string
// 			chromosome: string
// 			position: number
// 			genotype: string
// 		}[] = []

// 		// Process in chunks
// 		const chunkSize = 999
// 		for (let i = 0; i < rsids.length; i += chunkSize) {
// 			const chunk = rsids.slice(i, i + chunkSize)
// 			const placeholders = chunk.map(() => '?').join(',')

// 			const chunkResults = await db.getAllAsync<{
// 				rsid: string
// 				chromosome: string
// 				position: number
// 				genotype: string
// 			}>(
// 				`SELECT rsid, chromosome, position, genotype
// 				 FROM variants
// 				 WHERE rsid IN (${placeholders})`,
// 				chunk
// 			)

// 			results.push(...chunkResults)
// 		}

// 		return results
// 	} finally {
// 		await db.closeAsync()
// 	}
// }

/**
 * Clean up orphaned database files that aren't in the manifest
 */
async function cleanOrphanedDatabases(manifestEntries: UserGenomeDatabase[]): Promise<void> {
	const manifestDbNames = new Set(manifestEntries.map((e) => e.dbName))

	// Check SQLite directory for orphaned files
	const sqliteDir = new Directory(Paths.document, 'SQLite')
	if (!sqliteDir.exists) return

	try {
		const items = sqliteDir.list()
		for (const item of items) {
			if (item instanceof File && item.name.endsWith('.sqlite')) {
				if (!manifestDbNames.has(item.name) && item.name.startsWith('genome')) {
					console.log('🧹 Found orphaned database, removing:', item.name)
					try {
						await SQLite.deleteDatabaseAsync(item.name)
						console.log('Orphaned database removed:', item.name)
					} catch (error) {
						console.error('Failed to remove orphaned database:', item.name, error)
					}
				}
			}
		}
	} catch (error) {
		console.error('Error cleaning orphaned databases:', error)
	}
}

/**
 * List all user genome databases
 */
export async function listUserGenomeDatabases(): Promise<UserGenomeDatabase[]> {
	// Prefer manifest for speed and cross-platform compatibility
	const fromManifest = await readManifest()

	// Clean up any orphaned database files
	await cleanOrphanedDatabases(fromManifest)

	const databases: UserGenomeDatabase[] = [...fromManifest]

	// Now update the manifest with actual metadata from the databases
	const updatedDatabases: UserGenomeDatabase[] = []

	for (const entry of databases) {
		try {
			console.log('Reading metadata for:', entry.dbName)
			const db = await SQLite.openDatabaseSync(entry.dbName)

			const info = await db.getFirstAsync<{
				file_name: string
				upload_date: string
				total_variants: number
				rsid_count: number
			}>('SELECT file_name, upload_date, total_variants, rsid_count FROM genome_metadata LIMIT 1')

			await db.closeAsync()

			if (info) {
				updatedDatabases.push({
					dbName: entry.dbName,
					fileName: info.file_name || entry.fileName,
					uploadDate: info.upload_date || entry.uploadDate,
					totalVariants: info.total_variants || 0,
					rsidCount: info.rsid_count || 0,
				})
			} else {
				// Keep the original entry if no metadata found
				updatedDatabases.push(entry)
			}
		} catch (error) {
			console.warn(`Failed to read metadata for ${entry.dbName}:`, error)
			// Keep the original entry if error reading
			updatedDatabases.push(entry)
		}
	}

	// Update manifest with the actual metadata
	if (JSON.stringify(databases) !== JSON.stringify(updatedDatabases)) {
		await writeManifest(updatedDatabases)
	}

	return databases.sort(
		(a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
	)
}

/**
 * Delete a user genome database
 */
export async function deleteUserGenomeDatabase(dbName: string): Promise<void> {
	console.log('🗑️ Deleting database:', dbName)

	try {
		await SQLite.deleteDatabaseAsync(dbName)
		console.log('Database file deleted')
	} catch (error) {
		console.error('Error deleting database file:', error)
	}

	// Remove from manifest
	const current = await readManifest()
	const updated = current.filter((e) => e.dbName !== dbName)
	console.log(`Removing from manifest: ${current.length} entries -> ${updated.length} entries`)
	await writeManifest(updated)
}
