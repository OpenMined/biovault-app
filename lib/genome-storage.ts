/**
 * User genome database storage and management
 * Reads metadata directly from Rust-created SQLite databases using schema detection
 */

export interface UserGenomeDatabase {
	dbName: string
	fileName: string
	uploadDate: string
	totalVariants: number
	rsidCount: number
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
	console.warn('SQLite-backed genome listing is temporarily disabled.')
	return []
}

/**
 * Delete a user genome database - pure SQLite approach!
 * Just delete the database file, no manifest to update
 */
export async function deleteUserGenomeDatabase(dbName: string): Promise<void> {
	console.warn('SQLite-backed genome deletion is temporarily disabled.', { dbName })
}
