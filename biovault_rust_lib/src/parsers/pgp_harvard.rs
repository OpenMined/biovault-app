use super::{GenomeMetadata, ParseResult, Variant};
use std::error::Error;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

/// Read TSV file with automatic decompression for .bz2
fn read_tsv_content(file_path: &Path) -> Result<Box<dyn BufRead>, Box<dyn Error>> {
    let file = File::open(file_path)?;
    let path_str = file_path.to_string_lossy();

    if path_str.ends_with(".tsv.bz2") {
        // Bzip2 compressed
        let decoder = bzip2::read::BzDecoder::new(file);
        Ok(Box::new(BufReader::new(decoder)))
    } else {
        // Uncompressed
        Ok(Box::new(BufReader::new(file)))
    }
}

pub fn parse_pgp_harvard_file(file_path: &Path) -> Result<ParseResult, Box<dyn Error>> {
    let reader = read_tsv_content(file_path)?;

    let mut variants = Vec::new();
    let mut rsid_count = 0;
    let mut header_cols: Vec<String> = Vec::new();
    let mut found_cg_header = false;

    for line in reader.lines() {
        let line = line?;
        let line = line.trim();

        // Skip metadata lines starting with #
        if line.starts_with('#') {
            // Validate this is actually Complete Genomics format
            if line.contains("Complete Genomics") || line.contains("cgatools") {
                found_cg_header = true;
            }
            continue;
        }
        
        if line.is_empty() {
            continue;
        }

        // Handle column header line (starts with >)
        if line.starts_with('>') {
            header_cols = line[1..]
                .split('\t')
                .map(|s| s.trim().to_string())
                .collect();
            
            // Validate required columns exist
            if !header_cols.contains(&"chromosome".to_string()) 
                || !header_cols.contains(&"begin".to_string()) 
                || !header_cols.contains(&"varType".to_string()) {
                return Err("Not a valid Complete Genomics TSV file - missing required columns".into());
            }
            
            found_cg_header = true;
            continue;
        }

        // Skip if we haven't seen headers yet
        if header_cols.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split('\t').collect();

        if parts.len() < header_cols.len() {
            continue;
        }

        // Find column indices
        let chr_idx = header_cols.iter().position(|h| h == "chromosome");
        let begin_idx = header_cols.iter().position(|h| h == "begin");
        let var_type_idx = header_cols.iter().position(|h| h == "varType");
        let allele_seq_idx = header_cols.iter().position(|h| h == "alleleSeq");
        let xref_idx = header_cols.iter().position(|h| h == "xRef");

        // Ensure we have required columns
        let (chr_idx, begin_idx) = match (chr_idx, begin_idx) {
            (Some(c), Some(b)) => (c, b),
            _ => continue,
        };

        let chromosome = parts[chr_idx].trim();
        let position_str = parts[begin_idx].trim();

        // Parse position
        let position = match position_str.parse::<u64>() {
            Ok(p) => p,
            Err(_) => continue,
        };

        // Skip non-variant rows
        if let Some(vt_idx) = var_type_idx {
            let var_type = parts.get(vt_idx).map(|s| s.trim()).unwrap_or("");
            if var_type == "no-call" || var_type == "no-ref" || var_type == "ref" {
                continue;
            }
        }

        // Get genotype/allele sequence
        let genotype = if let Some(as_idx) = allele_seq_idx {
            let seq = parts.get(as_idx).map(|s| s.trim()).unwrap_or("?");
            if seq == "?" || seq == "=" || seq.is_empty() {
                continue;
            }
            seq.to_string()
        } else {
            continue;
        };

        // Extract rsID from xRef if available
        let rsid = if let Some(xr_idx) = xref_idx {
            parts
                .get(xr_idx)
                .and_then(|xref| {
                    xref.split(';')
                        .find_map(|entry| {
                            if entry.starts_with("dbsnp:rs") {
                                Some(entry.trim_start_matches("dbsnp:").to_string())
                            } else {
                                None
                            }
                        })
                })
        } else {
            None
        };

        // Count rsIDs
        if rsid.is_some() {
            rsid_count += 1;
        }

        // Create variant
        let variant = Variant {
            rsid,
            chromosome: chromosome.to_string(),
            position,
            genotype,
            source_format: "PGP-Harvard".to_string(),
        };

        variants.push(variant);
    }

    // Validate we actually parsed Complete Genomics data
    if !found_cg_header && variants.is_empty() {
        return Err("Not a Complete Genomics file - no valid header or variants found. \
                    This may be a different TSV format.".into());
    }

    let metadata = GenomeMetadata {
        source_format: "PGP-Harvard".to_string(),
        total_variants: variants.len(),
        rsid_count,
    };

    Ok(ParseResult { metadata, variants })
}

