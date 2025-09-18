use std::error::Error;
use std::path::Path;

pub mod twenty_three_and_me;

/// Common variant representation
#[derive(Debug, Clone)]
pub struct Variant {
    pub rsid: Option<String>,
    pub chromosome: String,
    pub position: u64,
    pub genotype: String,
    pub source_format: String,
}

/// Metadata about the parsed genome file
#[derive(Debug, Clone)]
pub struct GenomeMetadata {
    pub file_name: String,
    pub source_format: String,
    pub total_variants: usize,
    pub rsid_count: usize,
    pub parse_errors: Vec<String>,
}

/// Result of parsing a genome file
#[derive(Debug)]
pub struct ParseResult {
    pub metadata: GenomeMetadata,
    pub variants: Vec<Variant>,
}

/// Extract first matching file from ZIP
pub fn extract_from_zip(zip_path: &Path, pattern: &str) -> Result<String, Box<dyn Error>> {
    use std::io::Read;
    
    let file = std::fs::File::open(zip_path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        if file.name().contains(pattern) {
            let mut contents = String::new();
            file.read_to_string(&mut contents)?;
            return Ok(contents);
        }
    }
    
    Err(format!("No file matching '{}' found in ZIP", pattern).into())
}