use std::error::Error;
use std::path::Path;

pub mod twenty_three_and_me;
pub mod ancestry_dna;
pub mod vcf;
pub mod pgp_harvard;
pub mod generic_tsv;

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
    pub source_format: String,
    pub total_variants: usize,
    pub rsid_count: usize,
}

/// Result of parsing a genome file
#[derive(Debug)]
pub struct ParseResult {
    pub metadata: GenomeMetadata,
    pub variants: Vec<Variant>,
}

/// Extract single genomic data file from ZIP to a temporary file
/// Returns the path to the extracted temp file
/// Errors if ZIP contains zero or multiple genomic data files
fn extract_single_file_from_zip(zip_path: &Path) -> Result<std::path::PathBuf, Box<dyn Error>> {
    use std::io::{Read, Write};

    let file = std::fs::File::open(zip_path)?;
    let mut archive = zip::ZipArchive::new(file)?;

    let mut file_list = Vec::new();
    let mut genomic_files = Vec::new();

    // Find ALL potential genomic data files in the ZIP
    for i in 0..archive.len() {
        let file = archive.by_index(i)?;
        let filename = file.name();
        let filename_lower = filename.to_lowercase();
        file_list.push(filename.to_string());
        
        // Skip directories and hidden files
        if filename_lower.ends_with('/') || filename_lower.contains("__macosx") || filename.starts_with('.') {
            continue;
        }
        
        // Look for genomic data file extensions
        if filename_lower.ends_with(".txt") || filename_lower.ends_with(".vcf") || 
           filename_lower.ends_with(".tsv") || filename_lower.ends_with(".csv") ||
           filename_lower.ends_with(".vcf.gz") || filename_lower.ends_with(".vcf.bz2") ||
           filename_lower.ends_with(".tsv.bz2") {
            genomic_files.push((i, filename.to_string()));
        }
    }

    // Ensure exactly ONE genomic file
    if genomic_files.is_empty() {
        return Err(format!(
            "No genomic data file found in ZIP.\nLooked for: .txt, .vcf, .tsv, .csv (and compressed variants).\nFiles found: {}",
            file_list.join(", ")
        ).into());
    }

    if genomic_files.len() > 1 {
        let genomic_names: Vec<String> = genomic_files.iter().map(|(_, name)| name.clone()).collect();
        return Err(format!(
            "ZIP contains {} genomic files. Please ensure ZIP contains exactly ONE genomic data file.\nGenomic files found: {}",
            genomic_files.len(),
            genomic_names.join(", ")
        ).into());
    }

    // Extract the single genomic file to temp
    let (idx, original_filename) = &genomic_files[0];
    let mut file = archive.by_index(*idx)?;
    eprintln!("ZIP: Found genomic file: {}", original_filename);
    
    // Create temp file with same extension
    let extension = Path::new(original_filename)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("txt");
    
    let temp_path = std::env::temp_dir()
        .join(format!("biovault_extract_{}.{}", 
                     std::time::SystemTime::now()
                         .duration_since(std::time::UNIX_EPOCH)
                         .unwrap()
                         .as_secs(),
                     extension));
    
    let mut temp_file = std::fs::File::create(&temp_path)?;
    let mut contents = Vec::new();
    file.read_to_end(&mut contents)?;
    temp_file.write_all(&contents)?;
    
    eprintln!("ZIP: Extracted to temp: {:?}", temp_path);
    Ok(temp_path)
}

/// Extract .bz2 file to temp (for raw .bz2 without format extension)
fn extract_bz2_to_temp(bz2_path: &Path) -> Result<std::path::PathBuf, Box<dyn Error>> {
    use std::io::{Read, Write};
    
    let file = std::fs::File::open(bz2_path)?;
    let mut decoder = bzip2::read::BzDecoder::new(file);
    
    let temp_path = std::env::temp_dir()
        .join(format!("biovault_bz2_{}.txt", 
                     std::time::SystemTime::now()
                         .duration_since(std::time::UNIX_EPOCH)
                         .unwrap()
                         .as_secs()));
    
    let mut temp_file = std::fs::File::create(&temp_path)?;
    let mut contents = Vec::new();
    decoder.read_to_end(&mut contents)?;
    temp_file.write_all(&contents)?;
    
    eprintln!("BZ2: Decompressed to temp: {:?}", temp_path);
    Ok(temp_path)
}

/// Extract .gz file to temp (for raw .gz without format extension)
fn extract_gz_to_temp(gz_path: &Path) -> Result<std::path::PathBuf, Box<dyn Error>> {
    use std::io::{Read, Write};
    
    let file = std::fs::File::open(gz_path)?;
    let mut decoder = flate2::read::GzDecoder::new(file);
    
    let temp_path = std::env::temp_dir()
        .join(format!("biovault_gz_{}.txt", 
                     std::time::SystemTime::now()
                         .duration_since(std::time::UNIX_EPOCH)
                         .unwrap()
                         .as_secs()));
    
    let mut temp_file = std::fs::File::create(&temp_path)?;
    let mut contents = Vec::new();
    decoder.read_to_end(&mut contents)?;
    temp_file.write_all(&contents)?;
    
    eprintln!("GZ: Decompressed to temp: {:?}", temp_path);
    Ok(temp_path)
}

/// Auto-detect file format and parse accordingly
/// Detection priority: 1) Content analysis 2) File extension 3) Filename (fallback)
/// Handles ZIP extraction (extracts to temp, then processes normally)
pub fn parse_genome_file(file_path: &Path) -> Result<ParseResult, Box<dyn Error>> {
    let path_str = file_path.to_string_lossy();
    
    // STEP 0: Handle containers/compression - extract SINGLE file to temp
    let (actual_path, is_temp) = if path_str.ends_with(".zip") {
        eprintln!("Detected ZIP file, extracting single genomic file...");
        let temp_path = extract_single_file_from_zip(file_path)?;
        (temp_path, true)
    } else if path_str.ends_with(".bz2") && !path_str.contains(".vcf.bz2") && !path_str.contains(".tsv.bz2") {
        // Raw .bz2 file (not .vcf.bz2 or .tsv.bz2 which are handled by specific parsers)
        eprintln!("Detected raw BZ2 file, decompressing...");
        let temp_path = extract_bz2_to_temp(file_path)?;
        (temp_path, true)
    } else if path_str.ends_with(".gz") && !path_str.contains(".vcf.gz") {
        // Raw .gz file (not .vcf.gz which is handled by VCF parser)
        eprintln!("Detected raw GZ file, decompressing...");
        let temp_path = extract_gz_to_temp(file_path)?;
        (temp_path, true)
    } else {
        (file_path.to_path_buf(), false)
    };
    
    // Now process the actual file (could be .txt, .vcf, .vcf.gz, .tsv.bz2, etc.)
    let result = parse_genome_file_internal(&actual_path);
    
    // Cleanup temp file if we created one
    if is_temp {
        std::fs::remove_file(&actual_path).ok();
    }
    
    result
}

/// Internal parsing function (after ZIP extraction)
fn parse_genome_file_internal(file_path: &Path) -> Result<ParseResult, Box<dyn Error>> {
    let path_str = file_path.to_string_lossy();
    let filename = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");


    // STEP 1: Read content to detect format (for non-compressed text files)
    let first_lines: Vec<String> = std::fs::read_to_string(file_path)
        .ok()
        .map(|content| {
            content
                .lines()
                .take(30)
                .map(|l| l.to_string())
                .collect()
        })
        .unwrap_or_default();

    if !first_lines.is_empty() {
        let first_line = &first_lines[0];
        
        // Check for VCF header (very distinctive)
        if first_line.starts_with("##fileformat=VCF") {
            eprintln!("Auto-detected from content: VCF format");
            return vcf::parse_vcf_file(file_path);
        }

        // Check for PGP Harvard Complete Genomics format
        if first_line.contains("Complete Genomics") || first_line.contains("cgatools") {
            eprintln!("Auto-detected from content: PGP Harvard format");
            return pgp_harvard::parse_pgp_harvard_file(file_path);
        }

        // Check for 23andMe format (very distinctive header)
        if first_line.contains("23andMe") || first_line.contains("23andme") {
            eprintln!("Auto-detected from content: 23andMe format");
            return twenty_three_and_me::parse_23andme_file(file_path);
        }

        // Check for AncestryDNA format
        if first_line.contains("AncestryDNA") {
            eprintln!("Auto-detected from content: AncestryDNA format");
            return ancestry_dna::parse_ancestrydna_file(file_path);
        }

        // Check header row to distinguish formats
        for line in &first_lines {
            if line.starts_with("rsid") || line.starts_with("# rsid") {
                let parts: Vec<&str> = line.split('\t').collect();
                
                // AncestryDNA has 5 columns (rsid, chromosome, position, allele1, allele2)
                // 23andMe has 4 columns (rsid, chromosome, position, genotype)
                if parts.len() == 5 && (parts.contains(&"allele1") || parts.contains(&"allele2")) {
                    eprintln!("Auto-detected from header: AncestryDNA format (5 columns)");
                    return ancestry_dna::parse_ancestrydna_file(file_path);
                } else if parts.len() == 4 && parts.contains(&"genotype") {
                    eprintln!("Auto-detected from header: 23andMe format (4 columns)");
                    return twenty_three_and_me::parse_23andme_file(file_path);
                }
            }
            
            // Check for PGP Harvard TSV header
            if line.starts_with(">locus") || line.starts_with(">chromosome") {
                eprintln!("Auto-detected from header: PGP Harvard format");
                return pgp_harvard::parse_pgp_harvard_file(file_path);
            }
        }
    }

    // STEP 2: Check file extensions (reliable for VCF only)
    if path_str.ends_with(".vcf") || path_str.ends_with(".vcf.gz") || path_str.ends_with(".vcf.bz2") {
        eprintln!("Auto-detected from extension: VCF format");
        return vcf::parse_vcf_file(file_path);
    }

    // Note: Don't auto-detect TSV by extension alone - too many non-genomic TSV files exist
    // TSV must be detected by content (Complete Genomics headers) or filename (PGP/CompleteGenomics)

    // STEP 3: Filename patterns (LAST RESORT - least reliable)
    if path_str.contains("23andme") || path_str.contains("23AndMe") {
        eprintln!("Auto-detected from filename: 23andMe format");
        return twenty_three_and_me::parse_23andme_file(file_path);
    }

    if path_str.contains("ancestry") || path_str.contains("AncestryDNA") {
        eprintln!("Auto-detected from filename: AncestryDNA format");
        return ancestry_dna::parse_ancestrydna_file(file_path);
    }

    // STEP 4: Generic TSV/CSV fallback (for .tsv and .csv files)
    // This handles FTDNA and other services with simple column formats
    if path_str.ends_with(".tsv") || path_str.ends_with(".csv") {
        eprintln!("Attempting generic TSV/CSV parser as fallback...");
        if let Ok(result) = generic_tsv::parse_generic_tsv_file(file_path) {
            eprintln!("Successfully parsed as generic TSV/CSV with {} variants", result.metadata.total_variants);
            return Ok(result);
        }
    }

    Err(format!(
        "Could not auto-detect format for file: {}. \
        \nSupported formats: 23andMe, AncestryDNA, VCF, PGP Harvard, or generic TSV/CSV. \
        \nFor TSV/CSV files, ensure headers include: rsid, chromosome, position, and genotype (or allele1+allele2).",
        filename
    )
    .into())
}
