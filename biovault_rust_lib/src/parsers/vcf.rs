use super::{GenomeMetadata, ParseResult, Variant};
use std::error::Error;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

/// Read VCF file with automatic decompression based on extension
fn read_vcf_content(file_path: &Path) -> Result<Box<dyn BufRead>, Box<dyn Error>> {
    let file = File::open(file_path)?;
    
    // Check for .vcf.gz or .vcf.bz2
    let path_str = file_path.to_string_lossy();

    if path_str.ends_with(".vcf.gz") {
        // Gzip compressed
        let decoder = flate2::read::GzDecoder::new(file);
        Ok(Box::new(BufReader::new(decoder)))
    } else if path_str.ends_with(".vcf.bz2") {
        // Bzip2 compressed
        let decoder = bzip2::read::BzDecoder::new(file);
        Ok(Box::new(BufReader::new(decoder)))
    } else {
        // Uncompressed
        Ok(Box::new(BufReader::new(file)))
    }
}

/// Parse genotype from VCF FORMAT field
/// Handles various genotype formats: 0/0, 0|1, 1/1, etc.
fn parse_genotype(format: &str, sample: &str, ref_allele: &str, alt_alleles: &str) -> Option<String> {
    let format_fields: Vec<&str> = format.split(':').collect();
    let sample_fields: Vec<&str> = sample.split(':').collect();

    // Find GT field index
    let gt_index = format_fields.iter().position(|&f| f == "GT")?;

    if gt_index >= sample_fields.len() {
        return None;
    }

    let gt = sample_fields[gt_index];

    // Parse genotype (e.g., "0/0", "0|1", "1/1", "./.")
    let alleles: Vec<&str> = if gt.contains('/') {
        gt.split('/').collect()
    } else if gt.contains('|') {
        gt.split('|').collect()
    } else {
        return None;
    };

    if alleles.len() != 2 {
        return None;
    }

    // Map allele indices to actual bases
    let alt_allele_vec: Vec<&str> = alt_alleles.split(',').collect();

    let mut genotype = String::new();
    for allele_idx in alleles {
        if allele_idx == "." {
            // No call
            genotype.push('-');
        } else if let Ok(idx) = allele_idx.parse::<usize>() {
            if idx == 0 {
                // Reference allele
                genotype.push_str(ref_allele);
            } else if idx <= alt_allele_vec.len() {
                // Alternate allele
                genotype.push_str(alt_allele_vec[idx - 1]);
            } else {
                genotype.push('-');
            }
        } else {
            genotype.push('-');
        }
    }

    Some(genotype)
}

pub fn parse_vcf_file(file_path: &Path) -> Result<ParseResult, Box<dyn Error>> {
    let reader = read_vcf_content(file_path)?;

    let mut variants = Vec::new();
    let mut rsid_count = 0;

    for line in reader.lines() {
        let line = line?;
        let line = line.trim();

        // Skip header lines
        if line.starts_with('#') || line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split('\t').collect();

        // VCF format: CHROM POS ID REF ALT QUAL FILTER INFO FORMAT SAMPLE
        if parts.len() < 10 {
            continue;
        }

        let chromosome = parts[0].trim();
        let position_str = parts[1].trim();
        let rsid = parts[2].trim();
        let ref_allele = parts[3].trim();
        let alt_alleles = parts[4].trim();
        let format = parts[8].trim();
        let sample = parts[9].trim();

        // Skip if no alternate allele
        if alt_alleles == "." {
            continue;
        }

        // Parse position
        let position = match position_str.parse::<u64>() {
            Ok(p) => p,
            Err(_) => continue,
        };

        // Parse genotype
        let genotype = match parse_genotype(format, sample, ref_allele, alt_alleles) {
            Some(g) if !g.is_empty() && g != "--" => g,
            _ => continue,
        };

        // Count rsIDs (including semicolon-separated multiple rsIDs)
        if rsid != "." && (rsid.starts_with("rs") || rsid.contains("rs")) {
            rsid_count += 1;
        }

        // Create variant
        // Extract first rsID if multiple (e.g., "rs123;rs456" → "rs123")
        let extracted_rsid = if rsid != "." && rsid.contains("rs") {
            // Handle multiple rsIDs separated by semicolon
            rsid.split(';')
                .find(|id| id.starts_with("rs"))
                .map(|id| id.to_string())
        } else {
            None
        };
        
        let variant = Variant {
            rsid: extracted_rsid,
            chromosome: chromosome.to_string(),
            position,
            genotype,
            source_format: "VCF".to_string(),
        };

        variants.push(variant);
    }

    let metadata = GenomeMetadata {
        source_format: "VCF".to_string(),
        total_variants: variants.len(),
        rsid_count,
    };

    Ok(ParseResult { metadata, variants })
}

