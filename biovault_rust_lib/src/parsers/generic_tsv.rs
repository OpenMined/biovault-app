use super::{GenomeMetadata, ParseResult, Variant};
use std::error::Error;
use std::path::Path;

/// Parse generic TSV/CSV genomic files
/// Detects columns intelligently by matching common patterns
pub fn parse_generic_tsv_file(file_path: &Path) -> Result<ParseResult, Box<dyn Error>> {
    let content = std::fs::read_to_string(file_path)?;
    
    let mut variants = Vec::new();
    let mut rsid_count = 0;
    
    // Column indices (to be detected)
    let mut rsid_col: Option<usize> = None;
    let mut chr_col: Option<usize> = None;
    let mut pos_col: Option<usize> = None;
    let mut genotype_col: Option<usize> = None;
    let mut allele1_col: Option<usize> = None;
    let mut allele2_col: Option<usize> = None;
    
    // Detect delimiter (tab or comma)
    let delimiter = if content.lines().next().unwrap_or("").contains('\t') { '\t' } else { ',' };
    
    for line in content.lines() {
        let line = line.trim();
        
        // Skip comments
        if line.starts_with('#') || line.is_empty() {
            continue;
        }
        
        let parts: Vec<&str> = line.split(delimiter).map(|s| s.trim().trim_matches('"')).collect();
        
        // Detect header row
        if rsid_col.is_none() {
            // Check if this looks like a header
            let line_lower = line.to_lowercase();
            
            if line_lower.contains("rsid") || line_lower.contains("snp") || 
               line_lower.contains("chromosome") || line_lower.contains("position") {
                
                // Map columns by pattern matching
                for (i, part) in parts.iter().enumerate() {
                    let part_lower = part.to_lowercase();
                    
                    // rsID column (flexible matching)
                    if part_lower == "rsid" || part_lower == "snp" || part_lower == "id" || 
                       part_lower == "snp_id" || part_lower == "variant_id" || part_lower == "# rsid" {
                        rsid_col = Some(i);
                    }
                    
                    // Chromosome column
                    else if part_lower == "chromosome" || part_lower == "chr" || part_lower == "chrom" ||
                            part_lower == "#chrom" || part_lower == "contig" {
                        chr_col = Some(i);
                    }
                    
                    // Position column
                    else if part_lower == "position" || part_lower == "pos" || part_lower == "bp" ||
                            part_lower == "coordinate" || part_lower == "location" {
                        pos_col = Some(i);
                    }
                    
                    // Genotype column (combined alleles)
                    else if part_lower == "genotype" || part_lower == "alleles" || part_lower == "call" ||
                            part_lower == "result" || part_lower == "variant" {
                        genotype_col = Some(i);
                    }
                    
                    // Allele1 column
                    else if part_lower == "allele1" || part_lower == "allele_1" || part_lower == "a1" {
                        allele1_col = Some(i);
                    }
                    
                    // Allele2 column
                    else if part_lower == "allele2" || part_lower == "allele_2" || part_lower == "a2" {
                        allele2_col = Some(i);
                    }
                }
                
                // Validate we found required columns
                if rsid_col.is_none() || chr_col.is_none() || pos_col.is_none() {
                    continue; // Not a valid header, might be data
                }
                
                // Need either genotype OR both allele columns
                if genotype_col.is_none() && (allele1_col.is_none() || allele2_col.is_none()) {
                    continue; // Not enough columns
                }
                
                continue; // Skip header row
            }
        }
        
        // If we haven't detected columns yet, skip
        if rsid_col.is_none() {
            continue;
        }
        
        // Parse data row
        if parts.len() <= rsid_col.unwrap().max(chr_col.unwrap()).max(pos_col.unwrap()) {
            continue; // Not enough columns
        }
        
        let rsid = parts.get(rsid_col.unwrap()).unwrap_or(&"").trim();
        let chromosome = parts.get(chr_col.unwrap()).unwrap_or(&"").trim();
        let position_str = parts.get(pos_col.unwrap()).unwrap_or(&"").trim();
        
        // Get genotype (either from genotype column or combine alleles)
        let genotype = if let Some(g_col) = genotype_col {
            parts.get(g_col).unwrap_or(&"").trim().to_string()
        } else if let (Some(a1_col), Some(a2_col)) = (allele1_col, allele2_col) {
            let a1 = parts.get(a1_col).unwrap_or(&"").trim();
            let a2 = parts.get(a2_col).unwrap_or(&"").trim();
            format!("{}{}", a1, a2)
        } else {
            continue;
        };
        
        // Skip invalid data
        if rsid.is_empty() || chromosome.is_empty() || genotype.is_empty() ||
           genotype == "--" || genotype == "00" || genotype == ".." {
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
            source_format: if delimiter == '\t' { "TSV" } else { "CSV" }.to_string(),
        };
        
        variants.push(variant);
    }
    
    // Validate we parsed something
    if variants.is_empty() {
        return Err(
            "No valid variants found in TSV/CSV file. \
            Expected columns: rsid/SNP, chromosome/chr, position/pos, genotype/result (or allele1+allele2)".into()
        );
    }
    
    let metadata = GenomeMetadata {
        source_format: if delimiter == '\t' { "TSV" } else { "CSV" }.to_string(),
        total_variants: variants.len(),
        rsid_count,
    };
    
    Ok(ParseResult { metadata, variants })
}

