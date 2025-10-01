use super::{GenomeMetadata, ParseResult, Variant};
use std::error::Error;
use std::path::Path;

pub fn parse_ancestrydna_file(file_path: &Path) -> Result<ParseResult, Box<dyn Error>> {
    // Note: ZIP extraction is handled by parse_genome_file() before calling this
    let content = std::fs::read_to_string(file_path)?;

    let mut variants = Vec::new();
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
        if parts.len() < 5 {
            // Invalid format; skip this line.
            continue;
        }

        let rsid = parts[0].trim();
        let chromosome = parts[1].trim();
        let position_str = parts[2].trim();
        let allele1 = parts[3].trim();
        let allele2 = parts[4].trim();

        // Skip invalid data (0 represents no-call in AncestryDNA)
        if rsid.is_empty() || chromosome.is_empty() || allele1 == "0" || allele2 == "0" {
            continue;
        }

        // Parse position
        let position = match position_str.parse::<u64>() {
            Ok(p) => p,
            Err(_) => continue,
        };

        // Count rsIDs
        if rsid.starts_with("rs") {
            rsid_count += 1;
        }

        // Combine alleles into genotype format (like 23andMe)
        let genotype = format!("{}{}", allele1, allele2);

        // Create variant
        let variant = Variant {
            rsid: if rsid.starts_with("rs") {
                Some(rsid.to_string())
            } else {
                None
            },
            chromosome: chromosome.to_string(),
            position,
            genotype,
            source_format: "AncestryDNA".to_string(),
        };

        variants.push(variant);
    }

    let metadata = GenomeMetadata {
        source_format: "AncestryDNA".to_string(),
        total_variants: variants.len(),
        rsid_count,
    };

    Ok(ParseResult { metadata, variants })
}

