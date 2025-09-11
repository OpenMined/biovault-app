/**
 * User genome data storage using SQLite
 * Stores uploaded 23andMe data locally on device
 */

import * as SQLite from 'expo-sqlite'
import { type TwentyThreeAndMeVariant, type ParsedGenomeData } from './23andme-parser'

export interface StoredGenomeFile {
	id: number
	fileName: string
	uploadDate: string
	totalVariants: number
	rsidCount: number
	chromosomeCount: number
	parseErrors: number
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

		CREATE TABLE IF NOT EXISTS genome_files (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			fileName TEXT NOT NULL,
			uploadDate TEXT NOT NULL,
			totalVariants INTEGER NOT NULL,
			rsidCount INTEGER NOT NULL,
			chromosomeCount INTEGER NOT NULL,
			parseErrors INTEGER NOT NULL DEFAULT 0
		);

		CREATE TABLE IF NOT EXISTS user_variants (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			fileId INTEGER NOT NULL,
			rsid TEXT NOT NULL,
			chromosome TEXT NOT NULL,
			position INTEGER NOT NULL,
			genotype TEXT NOT NULL,
			FOREIGN KEY (fileId) REFERENCES genome_files (id) ON DELETE CASCADE
		);

		CREATE INDEX IF NOT EXISTS idx_user_variants_rsid ON user_variants(rsid);
		CREATE INDEX IF NOT EXISTS idx_user_variants_file ON user_variants(fileId);
		CREATE INDEX IF NOT EXISTS idx_user_variants_chr_pos ON user_variants(chromosome, position);
	`)

	return userDbInstance
}

/**
 * Store parsed 23andMe data in local database
 */
export async function storeGenomeData(
	data: ParsedGenomeData,
	onProgress?: (current: number, total: number) => void
): Promise<number> {
	const db = await initializeUserGenomeDatabase()

	// Insert file record
	const fileResult = await db.runAsync(
		`INSERT INTO genome_files (fileName, uploadDate, totalVariants, rsidCount, chromosomeCount, parseErrors)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		[
			data.fileName,
			new Date().toISOString(),
			data.totalVariants,
			data.rsidCount,
			new Set(data.variants.map((v) => v.chromosome)).size,
			data.parseErrors.length,
		]
	)

	const fileId = fileResult.lastInsertRowId

	// Optimized chunked insert with large batches
	const batchSize = 5000 // Larger batches for speed
	const totalBatches = Math.ceil(data.variants.length / batchSize)

	// Disable sync and use WAL mode for speed
	await db.execAsync(`
		PRAGMA synchronous = OFF;
		PRAGMA journal_mode = WAL;
		BEGIN IMMEDIATE;
	`)

	try {
		for (let i = 0; i < data.variants.length; i += batchSize) {
			const batch = data.variants.slice(i, i + batchSize)
			const currentBatch = Math.floor(i / batchSize) + 1

			onProgress?.(currentBatch, totalBatches)

			// Build VALUES clause for this batch
			const valuesClauses = batch.map(() => '(?, ?, ?, ?, ?)').join(',')
			const batchValues = batch.flatMap((variant) => [
				fileId,
				variant.rsid,
				variant.chromosome,
				variant.position,
				variant.genotype,
			])

			// Single INSERT for entire batch
			const statement = await db.prepareAsync(
				`INSERT INTO user_variants (fileId, rsid, chromosome, position, genotype) VALUES ${valuesClauses}`
			)

			try {
				await statement.executeAsync(batchValues)
			} finally {
				await statement.finalizeAsync()
			}
		}

		await db.execAsync('COMMIT;')
	} catch (error) {
		await db.execAsync('ROLLBACK;')
		throw error
	}

	return fileId
}

/**
 * Get all stored genome files
 */
export async function getStoredGenomeFiles(): Promise<StoredGenomeFile[]> {
	const db = await initializeUserGenomeDatabase()

	return await db.getAllAsync<StoredGenomeFile>(
		`SELECT id, fileName, uploadDate, totalVariants, rsidCount, chromosomeCount, parseErrors
		 FROM genome_files
		 ORDER BY uploadDate DESC`
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
			SELECT id, fileId, rsid, chromosome, position, genotype
			FROM user_variants
			WHERE fileId = ? AND rsid IN (${placeholders})
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
		`SELECT DISTINCT rsid FROM user_variants WHERE fileId = ? AND rsid LIKE 'rs%' ORDER BY rsid`,
		[fileId]
	)

	return results.map((r) => r.rsid)
}

/**
 * Delete a genome file and all its variants
 */
export async function deleteGenomeFile(fileId: number): Promise<void> {
	const db = await initializeUserGenomeDatabase()

	await db.runAsync('DELETE FROM genome_files WHERE id = ?', [fileId])
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
		'SELECT COUNT(*) as count FROM genome_files'
	)

	const variantCount = await db.getFirstAsync<{ count: number }>(
		'SELECT COUNT(*) as count FROM user_variants'
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
