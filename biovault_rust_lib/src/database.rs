use crate::parsers::ParseResult;
use rusqlite::Connection;
use std::error::Error;
use std::path::Path;

/// Create SQLite database from parsed genome data
pub fn create_genome_database(
    parse_result: ParseResult,
    output_path: &Path,
    custom_name: &str,
) -> Result<String, Box<dyn Error>> {
    eprintln!("Rust DB: Opening database at {:?}", output_path);
    let conn = Connection::open(output_path)?;

    eprintln!("Rust DB: Creating tables...");
    // Create tables matching your JS schema
    conn.execute(
        "CREATE TABLE genome_metadata (
            id INTEGER PRIMARY KEY,
            file_name TEXT NOT NULL,
            source_format TEXT NOT NULL,
            total_variants INTEGER NOT NULL,
            rsid_count INTEGER NOT NULL,
            assembly TEXT,
            upload_date TEXT NOT NULL,
            db_name TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE variants (
            id INTEGER PRIMARY KEY,
            file_id INTEGER NOT NULL,
            rsid TEXT,
            chromosome TEXT NOT NULL,
            position INTEGER NOT NULL,
            genotype TEXT NOT NULL,
            source_format TEXT NOT NULL,
            FOREIGN KEY(file_id) REFERENCES genome_metadata(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute("CREATE INDEX idx_variants_rsid ON variants (rsid)", [])?;

    conn.execute(
        "CREATE INDEX idx_variants_chr_pos ON variants (chromosome, position)",
        [],
    )?;

    eprintln!("Rust DB: Tables created successfully");

    // Insert metadata
    let upload_date = chrono::Utc::now().to_rfc3339();
    let db_name = format!(
        "{}_{}",
        custom_name.replace(' ', "_"),
        chrono::Utc::now().timestamp()
    );

    eprintln!("Rust DB: Inserting metadata...");
    conn.execute(
        "INSERT INTO genome_metadata 
         (file_name, source_format, total_variants, rsid_count, assembly, upload_date, db_name)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        [
            custom_name,
            &parse_result.metadata.source_format,
            &parse_result.metadata.total_variants.to_string(),
            &parse_result.metadata.rsid_count.to_string(),
            "GRCh37", // Default for 23andMe
            &upload_date,
            &db_name,
        ],
    )?;

    // Get the last inserted id for genome_metadata
    let file_id = conn.last_insert_rowid();

    // Get variant count before moving the vector
    let variant_count = parse_result.variants.len();

    eprintln!("Rust DB: Inserting {} variants...", variant_count);

    // Insert variants in batches for performance
    let tx = conn.unchecked_transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO variants
             (file_id, rsid, chromosome, position, genotype, source_format)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )?;

        for variant in parse_result.variants {
            stmt.execute([
                &file_id.to_string(),
                variant.rsid.as_deref().unwrap_or(""),
                &variant.chromosome,
                &variant.position.to_string(),
                &variant.genotype,
                &variant.source_format,
            ])?;
        }
    }
    tx.commit()?;

    // Analyze for better query performance
    conn.execute("ANALYZE", [])?;

    eprintln!("Rust DB: Database creation completed successfully. Inserted {} variants", variant_count);

    Ok(db_name)
}

// Removed unused helper `get_documents_dir` to keep the public surface minimal.
