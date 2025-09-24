/**
 * User genome data storage using SQLite
 * Stores uploaded 23andMe data locally on device
 */

import * as SQLite from 'expo-sqlite'
import { type TwentyThreeAndMeVariant, type ParsedGenomeData } from './23andme-parser'

export interface StoredGenomeFile {
	id: number
	fileName: string
	sourceFormat: string
	totalVariants: number
	rsidCount: number
	assembly: string | null
	uploadDate: string
	dbName: string
}

export interface UserGenomeVariant extends TwentyThreeAndMeVariant {
	id: number
	fileId: number
}

let userDbInstance: SQLite.SQLiteDatabase | null = null

/**
 * Initialize user genome database
 */
export async function initializeUserGenomeDatabase(): Promise<SQLite.SQLiteDatabase> {
	if (userDbInstance) {
		return userDbInstance
	}

	userDbInstance = await SQLite.openDatabaseAsync('user_genome.db')

	// Create tables for user data
	await userDbInstance.execAsync(`
		PRAGMA journal_mode = WAL;

		CREATE TABLE IF NOT EXISTS genome_metadata (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			file_name TEXT NOT NULL,
			source_format TEXT NOT NULL,
			total_variants INTEGER NOT NULL,
			rsid_count INTEGER NOT NULL,
			assembly TEXT,
			upload_date TEXT NOT NULL,
			db_name TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS variants (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			file_id INTEGER NOT NULL,
			rsid TEXT,
			chromosome TEXT NOT NULL,
			position INTEGER NOT NULL,
			genotype TEXT NOT NULL,
			source_format TEXT NOT NULL,
			FOREIGN KEY (file_id) REFERENCES genome_metadata (id) ON DELETE CASCADE
		);

		CREATE INDEX IF NOT EXISTS idx_variants_rsid ON variants(rsid);
		CREATE INDEX IF NOT EXISTS idx_variants_file ON variants(file_id);
		CREATE INDEX IF NOT EXISTS idx_variants_chr_pos ON variants(chromosome, position);
	`)

	return userDbInstance
}

// /**
//  * Store parsed 23andMe data in local database
//  */
// export async function storeGenomeData(
// 	data: ParsedGenomeData,
// 	onProgress?: (current: number, total: number) => void
// ): Promise<number> {
// 	const db = await initializeUserGenomeDatabase()

// 	// Insert file record
// 	const fileResult = await db.runAsync(
// 		`INSERT INTO genome_metadata (file_name, source_format, total_variants, rsid_count, assembly, upload_date, db_name)
// 		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
// 		[
// 			data.fileName,
// 			'23andMe', // Assuming source format is always 23andMe for this example
// 			data.totalVariants,
// 			data.rsidCount,
// 			data.assembly || null, // Assuming assembly is part of ParsedGenomeData
// 			new Date().toISOString(),
// 			`${data.fileName}_${Date.now()}` // Example dbName generation
// 		]
// 	)

// 	const fileId = fileResult.lastInsertRowId

// 	// Optimized chunked insert with large batches
// 	const batchSize = 5000 // Larger batches for speed
// 	const totalBatches = Math.ceil(data.variants.length / batchSize)

// 	// Disable sync and use WAL mode for speed
// 	await db.execAsync(`
// 		PRAGMA synchronous = OFF;
// 		PRAGMA journal_mode = WAL;
// 		BEGIN IMMEDIATE;
// 	`)

// 	try {
// 		for (let i = 0; i < data.variants.length; i += batchSize) {
// 			const batch = data.variants.slice(i, i + batchSize)
// 			const currentBatch = Math.floor(i / batchSize) + 1

// 			onProgress?.(currentBatch, totalBatches)

// 			// Build VALUES clause for this batch
// 			const valuesClauses = batch.map(() => '(?, ?, ?, ?, ?, ?)').join(',')
// 			const batchValues = batch.flatMap((variant) => [
// 				fileId,
// 				variant.rsid,
// 				variant.chromosome,
// 				variant.position,
// 				variant.genotype,
// 				'23andMe', // Assuming source format is always 23andMe for this example
// 			])

// 			// Single INSERT for entire batch
// 			const statement = await db.prepareAsync(
// 				`INSERT INTO variants (file_id, rsid, chromosome, position, genotype, source_format) VALUES ${valuesClauses}`
// 			)

// 			try {
// 				await statement.executeAsync(batchValues)
// 			} finally {
// 				await statement.finalizeAsync()
// 			}
// 		}

// 		await db.execAsync('COMMIT;')
// 	} catch (error) {
// 		await db.execAsync('ROLLBACK;')
// 		throw error
// 	}

// 	return fileId
// }

/**
 * Get all stored genome files
 */
export async function getStoredGenomeFiles(): Promise<StoredGenomeFile[]> {
	const db = await initializeUserGenomeDatabase()

	return await db.getAllAsync<StoredGenomeFile>(
		`SELECT id, file_name as fileName, source_format as sourceFormat, total_variants as totalVariants, 
		rsid_count as rsidCount, assembly, upload_date as uploadDate, db_name as dbName
		 FROM genome_metadata
		 ORDER BY upload_date DESC`
	)
}

/**
 * Get user variants by rsID list for matching against ClinVar
 */
export async function getUserVariantsByRsid(
	fileId: number,
	rsids: string[]
): Promise<UserGenomeVariant[]> {
	if (rsids.length === 0) return []

	const db = await initializeUserGenomeDatabase()
	const results: UserGenomeVariant[] = []

	// Process in chunks to stay under SQLite parameter limit
	const chunkSize = 999
	for (let i = 0; i < rsids.length; i += chunkSize) {
		const chunk = rsids.slice(i, i + chunkSize)
		const placeholders = chunk.map(() => '?').join(',')
		const query = `
			SELECT id, file_id as fileId, rsid, chromosome, position, genotype
			FROM variants
			WHERE file_id = ? AND rsid IN (${placeholders})
			ORDER BY chromosome, position
		`

		const chunkResults = await db.getAllAsync<UserGenomeVariant>(query, [fileId, ...chunk])
		results.push(...chunkResults)
	}

	return results
}

/**
 * Get all rsIDs for a file (for ClinVar matching)
 */
export async function getAllRsidsForFile(fileId: number): Promise<string[]> {
	const db = await initializeUserGenomeDatabase()

	const results = await db.getAllAsync<{ rsid: string }>(
		`SELECT DISTINCT rsid FROM variants WHERE file_id = ? AND rsid LIKE 'rs%' ORDER BY rsid`,
		[fileId]
	)

	return results.map((r) => r.rsid)
}

/**
 * Delete a genome file and all its variants
 */
export async function deleteGenomeFile(fileId: number): Promise<void> {
	const db = await initializeUserGenomeDatabase()

	await db.runAsync('DELETE FROM genome_metadata WHERE id = ?', [fileId])
	// Variants will be deleted automatically due to CASCADE
}

/**
 * Get storage statistics
 */
export async function getUserGenomeStats(): Promise<{
	totalFiles: number
	totalVariants: number
	totalStorage: string
}> {
	const db = await initializeUserGenomeDatabase()

	const fileCount = await db.getFirstAsync<{ count: number }>(
		'SELECT COUNT(*) as count FROM genome_metadata'
	)

	const variantCount = await db.getFirstAsync<{ count: number }>(
		'SELECT COUNT(*) as count FROM variants'
	)

	// Get database file size
	const dbPath = `${SQLite.defaultDatabaseDirectory}/user_genome.db`
	// Note: You'd need expo-file-system to get actual file size
	// For now, estimate based on variant count
	const estimatedSizeMB = Math.round(((variantCount?.count || 0) * 100) / 1024 / 1024)

	return {
		totalFiles: fileCount?.count || 0,
		totalVariants: variantCount?.count || 0,
		totalStorage: `~${estimatedSizeMB} MB`,
	}
}
