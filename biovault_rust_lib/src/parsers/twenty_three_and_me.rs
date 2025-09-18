use super::{GenomeMetadata, ParseResult, Variant, extract_from_zip};
use std::error::Error;
use std::path::Path;

pub fn parse_23andme_file(file_path: &Path) -> Result<ParseResult, Box<dyn Error>> {
    let content = if file_path.extension().and_then(|s| s.to_str()) == Some("zip") {
        // Extract from ZIP
        extract_from_zip(file_path, "genome_")?
    } else {
        // Read directly
        std::fs::read_to_string(file_path)?
    };

    let mut variants = Vec::new();
    // Skipping collection of parse errors for now.
    let mut rsid_count = 0;

    for line in content.lines() {
        let line = line.trim();

        // Skip comments and headers
        if line.starts_with('#') || line.is_empty() {
            continue;
        }

        // Skip header row
        if line.starts_with("rsid") {
            continue;
        }

        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 4 {
            // Invalid format; skip this line.
            continue;
        }

        let rsid = parts[0].trim();
        let chromosome = parts[1].trim();
        let position_str = parts[2].trim();
        let genotype = parts[3].trim();

        // Skip invalid data
        if rsid.is_empty() || chromosome.is_empty() || genotype == "--" {
            continue;
        }

        // Parse position
        let position = match position_str.parse::<u64>() {
            Ok(p) => p,
            Err(_) => {
                // Invalid position; skip this line.
                continue;
            }
        };

        // Count rsIDs
        if rsid.starts_with("rs") {
            rsid_count += 1;
        }

        // Create variant
        let variant = Variant {
            rsid: if rsid.starts_with("rs") {
                Some(rsid.to_string())
            } else {
                None
            },
            chromosome: chromosome.to_string(),
            position,
            genotype: genotype.to_string(),
            source_format: "23andMe".to_string(),
        };

        variants.push(variant);
    }

    // parse_errors is collected above but not currently surfaced; consider persisting later.
    let metadata = GenomeMetadata {
        source_format: "23andMe".to_string(),
        total_variants: variants.len(),
        rsid_count,
    };

    Ok(ParseResult { metadata, variants })
}
