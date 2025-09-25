/**
 * User genome database storage and management
 * Reads metadata directly from Rust-created SQLite databases using schema detection
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

/**
 * Check if a SQLite database is a valid genome database created by our Rust code
 */
async function isGenomeDatabase(db: SQLite.SQLiteDatabase): Promise<boolean> {
	try {
		// Check for required tables
		const schemaCheck = await db.getFirstAsync<{ count: number }>(
			`SELECT COUNT(*) as count FROM sqlite_master 
			 WHERE type='table' AND name IN ('genome_metadata', 'variants')`
		)

		if (!schemaCheck || schemaCheck.count < 2) return false

		// Check for required columns in genome_metadata table
		const metadataColumns = await db.getAllAsync<{ name: string }>(
			`PRAGMA table_info(genome_metadata)`
		)
		const columnNames = metadataColumns.map((col) => col.name)
		const requiredColumns = ['file_name', 'upload_date', 'total_variants', 'rsid_count']

		return requiredColumns.every((col) => columnNames.includes(col))
	} catch {
		return false
	}
}

/**
 * Record a database created by Rust - no manifest needed!
 * Just return basic info since Rust already stored all metadata in the database
 */
export async function addDatabaseToManifest(
	dbPath: string,
	fileName: string
): Promise<UserGenomeDatabase> {
	console.log('Database created by Rust:', dbPath, fileName)

	// Extract dbName from path (last component)
	const dbName = dbPath.split('/').pop() || dbPath

	// Return basic info - the real metadata will be read from the database when needed
	return {
		dbName,
		fileName,
		uploadDate: new Date().toISOString(),
		totalVariants: 0, // Will be read from SQLite database when listing
		rsidCount: 0, // Will be read from SQLite database when listing
	}
}

// NOTE: getRsidsFromUserDatabase function moved to Rust for better performance
/**
 * List all user genome databases - pure SQLite approach!
 * Scans the SQLite directory and reads metadata directly from each database
 */
export async function listUserGenomeDatabases(): Promise<UserGenomeDatabase[]> {
	console.log('📂 Scanning SQLite directory for genome databases...')
	const databases: UserGenomeDatabase[] = []

	// Check SQLite directory for database files
	const sqliteDir = new Directory(Paths.document, 'SQLite')
	if (!sqliteDir.exists) {
		console.log('SQLite directory does not exist')
		return []
	}

	try {
		const items = sqliteDir.list()
		console.log(`Found ${items.length} items in SQLite directory`)

		for (const item of items) {
			// Only check SQLite files - let schema detection determine if it's a genome database
			if (!(item instanceof File) || !item.name.endsWith('.sqlite')) {
				continue
			}

			console.log(`📋 Checking if ${item.name} is a genome database...`)

			try {
				const db = await SQLite.openDatabaseAsync(item.name)

				// Check if this is a valid genome database
				if (!(await isGenomeDatabase(db))) {
					console.log(`⏭️  Skipping ${item.name} - not a genome database`)
					await db.closeAsync()
					continue
				}

				// Now read the metadata - we know it's a valid genome database
				const info = await db.getFirstAsync<{
					file_name: string
					upload_date: string
					total_variants: number
					rsid_count: number
				}>('SELECT file_name, upload_date, total_variants, rsid_count FROM genome_metadata LIMIT 1')

				await db.closeAsync()

				if (info) {
					databases.push({
						dbName: item.name,
						fileName: info.file_name,
						uploadDate: info.upload_date,
						totalVariants: info.total_variants,
						rsidCount: info.rsid_count,
					})
					console.log(`✅ Successfully read genome database: ${item.name}`)
				} else {
					console.log(`⏭️  Skipping ${item.name} - no metadata found in genome_metadata table`)
				}
			} catch (error) {
				console.log(`⏭️  Skipping ${item.name} - failed to read database:`, String(error))
				// Skip this database if we can't read it
			}
		}

		console.log(`📊 Found ${databases.length} valid genome databases`)

		// Sort by upload date (newest first)
		return databases.sort(
			(a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
		)
	} catch (error) {
		console.error('Error scanning SQLite directory:', error)
		return []
	}
}

/**
 * Delete a user genome database - pure SQLite approach!
 * Just delete the database file, no manifest to update
 */
export async function deleteUserGenomeDatabase(dbName: string): Promise<void> {
	console.log('🗑️ Deleting database:', dbName)

	try {
		await SQLite.deleteDatabaseAsync(dbName)
		console.log('✅ Database file deleted successfully')
	} catch (error) {
		console.error('❌ Error deleting database file:', error)
		throw error
	}
}
