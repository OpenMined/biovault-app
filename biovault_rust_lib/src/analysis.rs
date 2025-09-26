use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::error::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClinVarVariant {
    pub rsid: String,
    pub chrom: String,
    pub pos: i64,
    pub ref_allele: String,
    pub alt_allele: String,
    pub gene: String,
    pub clnsig: String,
    pub clnrevstat: String,
    pub condition: String,
    pub user_genotype: Option<String>,  // Added to store user's actual genotype
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneGroup {
    pub gene: String,
    pub variants: Vec<ClinVarVariant>,
    pub most_significant: String,
    pub significance_score: i32,
    pub pathogenic_count: i32,
    pub likely_pathogenic_count: i32,
    pub uncertain_count: i32,
    pub conflicting_count: i32,
    pub total_variants: i32,
    pub unique_rsids: i32,
    pub conditions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisResult {
    pub matches: Vec<ClinVarVariant>,
    pub gene_groups: Vec<GeneGroup>,
    pub rsids_searched: i32,
    pub matches_found: i32,
}

/// Get significance score for sorting (lower = more significant)
fn get_significance_score(clnsig: &str) -> i32 {
    let sig = clnsig.to_lowercase();
    if sig.contains("pathogenic") && !sig.contains("likely") {
        return 1;
    }
    if sig.contains("likely_pathogenic") {
        return 2;
    }
    if sig.contains("uncertain") {
        return 3;
    }
    if sig.contains("conflicting") {
        return 4;
    }
    5 // Benign or other
}

/// Get significance label
fn get_significance_label(clnsig: &str) -> String {
    let sig = clnsig.to_lowercase();
    if sig.contains("pathogenic") && !sig.contains("likely") {
        return "Pathogenic".to_string();
    }
    if sig.contains("likely_pathogenic") {
        return "Likely_pathogenic".to_string();
    }
    if sig.contains("conflicting") {
        return "Conflicting".to_string();
    }
    if sig.contains("benign") {
        return "Benign".to_string();
    }
    "Uncertain_significance".to_string()
}

/// Extract rsIDs and genotypes from user genome database
pub fn get_rsids_and_genotypes_from_user_database(db_path: &str) -> Result<HashMap<String, String>, Box<dyn Error>> {
    let conn = Connection::open(db_path)?;

    let mut stmt = conn.prepare(
        "SELECT DISTINCT rsid, genotype FROM variants WHERE rsid LIKE 'rs%' ORDER BY rsid"
    )?;

    let rsid_iter = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,  // rsid
            row.get::<_, String>(1)?   // genotype
        ))
    })?;

    let mut rsid_genotype_map = HashMap::new();
    for result in rsid_iter {
        let (rsid, genotype) = result?;
        rsid_genotype_map.insert(rsid, genotype);
    }

    Ok(rsid_genotype_map)
}

/// Lookup variants by rsID list with batching
pub fn lookup_variants_by_rsid(
    clinvar_db_path: &str,
    rsid_genotype_map: &HashMap<String, String>,
) -> Result<Vec<ClinVarVariant>, Box<dyn Error>> {
    let conn = Connection::open(clinvar_db_path)?;
    let mut results = Vec::new();

    // Convert HashMap keys to Vec for chunking
    let rsids: Vec<String> = rsid_genotype_map.keys().cloned().collect();

    // Process in chunks of 999 to stay under SQLite parameter limit
    const CHUNK_SIZE: usize = 999;
    for chunk in rsids.chunks(CHUNK_SIZE) {
        let placeholders = vec!["?"; chunk.len()].join(",");
        let query = format!(
            "SELECT rsid, chrom, pos, ref, alt, gene, clnsig, clnrevstat, condition
             FROM variants
             WHERE rsid IN ({})
             ORDER BY
               CASE
                 WHEN clnsig LIKE '%Pathogenic%' AND clnsig NOT LIKE '%Likely_pathogenic%' THEN 1
                 WHEN clnsig LIKE '%Likely_pathogenic%' THEN 2
                 WHEN clnsig LIKE '%Uncertain%' THEN 3
                 ELSE 4
               END,
               gene",
            placeholders
        );
        
        let mut stmt = conn.prepare(&query)?;
        let variant_iter = stmt.query_map(
            rusqlite::params_from_iter(chunk.iter()),
            |row| {
                let rsid: String = row.get(0)?;
                let user_genotype = rsid_genotype_map.get(&rsid).cloned();
                Ok(ClinVarVariant {
                    rsid: rsid.clone(),
                    chrom: row.get(1)?,
                    pos: row.get(2)?,
                    ref_allele: row.get(3)?,
                    alt_allele: row.get(4)?,
                    gene: row.get(5)?,
                    clnsig: row.get(6)?,
                    clnrevstat: row.get(7)?,
                    condition: row.get(8)?,
                    user_genotype,
                })
            },
        )?;
        
        for variant in variant_iter {
            results.push(variant?);
        }
    }
    
    Ok(results)
}

/// Group variants by gene and calculate statistics
pub fn group_variants_by_gene(variants: Vec<ClinVarVariant>) -> Vec<GeneGroup> {
    let mut gene_map: HashMap<String, Vec<ClinVarVariant>> = HashMap::new();
    
    // Group variants by gene
    for variant in variants {
        let gene = if variant.gene.is_empty() {
            "Unknown".to_string()
        } else {
            variant.gene.clone()
        };
        
        gene_map.entry(gene).or_insert_with(Vec::new).push(variant);
    }
    
    // Convert to GeneGroup objects with statistics
    let mut gene_groups: Vec<GeneGroup> = gene_map
        .into_iter()
        .map(|(gene, gene_variants)| {
            // Calculate significance counts
            let pathogenic_count = gene_variants
                .iter()
                .filter(|v| {
                    let sig = v.clnsig.to_lowercase();
                    sig.contains("pathogenic") && !sig.contains("likely")
                })
                .count() as i32;
                
            let likely_pathogenic_count = gene_variants
                .iter()
                .filter(|v| v.clnsig.to_lowercase().contains("likely_pathogenic"))
                .count() as i32;
                
            let uncertain_count = gene_variants
                .iter()
                .filter(|v| v.clnsig.to_lowercase().contains("uncertain"))
                .count() as i32;
                
            let conflicting_count = gene_variants
                .iter()
                .filter(|v| v.clnsig.to_lowercase().contains("conflicting"))
                .count() as i32;
            
            // Find most significant variant
            let most_significant_variant = gene_variants
                .iter()
                .min_by_key(|v| get_significance_score(&v.clnsig))
                .unwrap();
            
            // Get unique conditions
            let mut conditions: Vec<String> = gene_variants
                .iter()
                .filter_map(|v| {
                    if v.condition.is_empty() || v.condition == "not_provided" || v.condition == "not_specified" {
                        None
                    } else {
                        Some(v.condition.replace('_', " "))
                    }
                })
                .collect::<std::collections::HashSet<_>>()
                .into_iter()
                .collect();
            conditions.sort();
            conditions.truncate(3); // Limit to top 3
            
            // Get unique rsIDs
            let unique_rsids = gene_variants
                .iter()
                .map(|v| &v.rsid)
                .collect::<std::collections::HashSet<_>>()
                .len() as i32;
            
            GeneGroup {
                gene: gene.clone(),
                variants: gene_variants.clone(),
                most_significant: get_significance_label(&most_significant_variant.clnsig),
                significance_score: get_significance_score(&most_significant_variant.clnsig),
                pathogenic_count,
                likely_pathogenic_count,
                uncertain_count,
                conflicting_count,
                total_variants: gene_variants.len() as i32,
                unique_rsids,
                conditions,
            }
        })
        .collect();
    
    // Sort by significance, then by gene name
    gene_groups.sort_by(|a, b| {
        a.significance_score
            .cmp(&b.significance_score)
            .then_with(|| a.gene.cmp(&b.gene))
    });
    
    gene_groups
}

/// Main analysis function - combines all steps
pub fn analyze_clinvar_matches(
    user_db_path: &str,
    clinvar_db_path: &str,
) -> Result<AnalysisResult, Box<dyn Error>> {
    eprintln!("Rust Analysis: Starting ClinVar analysis...");

    // Step 1: Extract rsIDs AND genotypes from user database
    let rsid_genotype_map = get_rsids_and_genotypes_from_user_database(user_db_path)?;
    let rsids_searched = rsid_genotype_map.len() as i32;
    eprintln!("Rust Analysis: Found {} rsIDs to search", rsids_searched);

    // Step 2: Query ClinVar for matches with genotype info
    let matches = lookup_variants_by_rsid(clinvar_db_path, &rsid_genotype_map)?;
    let matches_found = matches.len() as i32;
    eprintln!("Rust Analysis: Found {} ClinVar matches", matches_found);
    
    // Step 3: Group by gene
    let gene_groups = group_variants_by_gene(matches.clone());
    eprintln!("Rust Analysis: Grouped into {} genes", gene_groups.len());
    
    Ok(AnalysisResult {
        matches,
        gene_groups,
        rsids_searched,
        matches_found,
    })
}
