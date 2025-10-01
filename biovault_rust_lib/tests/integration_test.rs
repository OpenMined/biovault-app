use biovault_rust_lib::parsers::parse_genome_file;
use std::path::Path;

#[test]
fn test_23andme_v3() {
    let path = Path::new("../.cursor/genomic_data/23AndMe/23andMe_v3.txt");
    if path.exists() {
        let result = parse_genome_file(path);
        assert!(result.is_ok(), "Failed to parse 23andMe v3: {:?}", result.err());
        let parsed = result.unwrap();
        assert_eq!(parsed.metadata.source_format, "23andMe");
        assert!(parsed.metadata.total_variants > 500000, "Expected >500K variants");
        println!("✅ 23andMe v3: {} variants, {} rsIDs", 
                 parsed.metadata.total_variants, parsed.metadata.rsid_count);
    }
}

#[test]
fn test_23andme_v4() {
    let path = Path::new("../.cursor/genomic_data/23AndMe/23andMe_v4.txt");
    if path.exists() {
        let result = parse_genome_file(path);
        assert!(result.is_ok(), "Failed to parse 23andMe v4: {:?}", result.err());
        let parsed = result.unwrap();
        assert_eq!(parsed.metadata.source_format, "23andMe");
        println!("✅ 23andMe v4: {} variants, {} rsIDs", 
                 parsed.metadata.total_variants, parsed.metadata.rsid_count);
    }
}

#[test]
fn test_23andme_v5() {
    let path = Path::new("../.cursor/genomic_data/23AndMe/23andMe_v5.txt");
    if path.exists() {
        let result = parse_genome_file(path);
        assert!(result.is_ok(), "Failed to parse 23andMe v5: {:?}", result.err());
        let parsed = result.unwrap();
        assert_eq!(parsed.metadata.source_format, "23andMe");
        assert!(parsed.metadata.total_variants > 600000, "Expected >600K variants");
        println!("✅ 23andMe v5: {} variants, {} rsIDs", 
                 parsed.metadata.total_variants, parsed.metadata.rsid_count);
    }
}

#[test]
fn test_ancestrydna_v1() {
    let path = Path::new("../.cursor/genomic_data/AncestryDNA/AncestryDNA_v1.txt");
    if path.exists() {
        let result = parse_genome_file(path);
        assert!(result.is_ok(), "Failed to parse AncestryDNA v1: {:?}", result.err());
        let parsed = result.unwrap();
        assert_eq!(parsed.metadata.source_format, "AncestryDNA");
        assert!(parsed.metadata.total_variants > 500000, "Expected >500K variants");
        println!("✅ AncestryDNA v1: {} variants, {} rsIDs", 
                 parsed.metadata.total_variants, parsed.metadata.rsid_count);
    }
}

#[test]
fn test_ancestrydna_v2() {
    let path = Path::new("../.cursor/genomic_data/AncestryDNA/AncestryDNA_v2.txt");
    if path.exists() {
        let result = parse_genome_file(path);
        assert!(result.is_ok(), "Failed to parse AncestryDNA v2: {:?}", result.err());
        let parsed = result.unwrap();
        assert_eq!(parsed.metadata.source_format, "AncestryDNA");
        println!("✅ AncestryDNA v2: {} variants, {} rsIDs", 
                 parsed.metadata.total_variants, parsed.metadata.rsid_count);
    }
}

#[test]
fn test_ancestrydna_vcf() {
    let path = Path::new("../.cursor/genomic_data/AncestryDNA/AncestryDNA_unknown.vcf");
    if path.exists() {
        let result = parse_genome_file(path);
        assert!(result.is_ok(), "Failed to parse AncestryDNA VCF: {:?}", result.err());
        let parsed = result.unwrap();
        assert_eq!(parsed.metadata.source_format, "VCF");
        println!("✅ AncestryDNA VCF: {} variants, {} rsIDs", 
                 parsed.metadata.total_variants, parsed.metadata.rsid_count);
    }
}

#[test]
fn test_ancestrydna_vcf_bz2() {
    let path = Path::new("../.cursor/genomic_data/AncestryDNA/AncestryDNA_unknown.vcf.bz2");
    if path.exists() {
        let result = parse_genome_file(path);
        assert!(result.is_ok(), "Failed to parse AncestryDNA VCF.bz2: {:?}", result.err());
        let parsed = result.unwrap();
        assert_eq!(parsed.metadata.source_format, "VCF");
        println!("✅ AncestryDNA VCF.bz2: {} variants, {} rsIDs", 
                 parsed.metadata.total_variants, parsed.metadata.rsid_count);
    }
}

#[test]
fn test_genesforgood_vcf() {
    let path = Path::new("../.cursor/genomic_data/GenesForGood/GenesForGood_unphased.vcf");
    if path.exists() {
        let result = parse_genome_file(path);
        assert!(result.is_ok(), "Failed to parse GenesForGood VCF: {:?}", result.err());
        let parsed = result.unwrap();
        assert_eq!(parsed.metadata.source_format, "VCF");
        println!("✅ GenesForGood VCF: {} variants, {} rsIDs", 
                 parsed.metadata.total_variants, parsed.metadata.rsid_count);
    }
}

#[test]
fn test_genesforgood_vcf_gz() {
    let path = Path::new("../.cursor/genomic_data/GenesForGood/GenesForGood_raw.vcf.gz");
    if path.exists() {
        let result = parse_genome_file(path);
        assert!(result.is_ok(), "Failed to parse GenesForGood VCF.gz: {:?}", result.err());
        let parsed = result.unwrap();
        assert_eq!(parsed.metadata.source_format, "VCF");
        println!("✅ GenesForGood VCF.gz: {} variants, {} rsIDs", 
                 parsed.metadata.total_variants, parsed.metadata.rsid_count);
    }
}

#[test]
fn test_genesforgood_23andme_format() {
    let path = Path::new("../.cursor/genomic_data/GenesForGood/GenesForGood_23andMe_format.txt");
    if path.exists() {
        let result = parse_genome_file(path);
        assert!(result.is_ok(), "Failed to parse GenesForGood 23andMe format: {:?}", result.err());
        let parsed = result.unwrap();
        assert_eq!(parsed.metadata.source_format, "23andMe");
        println!("✅ GenesForGood 23andMe format: {} variants, {} rsIDs", 
                 parsed.metadata.total_variants, parsed.metadata.rsid_count);
    }
}

#[test]
fn test_gencove_vcf_gz() {
    let path = Path::new("../.cursor/genomic_data/Gencove/Gencove_imputed.vcf.gz");
    if path.exists() {
        let result = parse_genome_file(path);
        assert!(result.is_ok(), "Failed to parse Gencove VCF.gz: {:?}", result.err());
        let parsed = result.unwrap();
        assert_eq!(parsed.metadata.source_format, "VCF");
        println!("✅ Gencove VCF.gz: {} variants, {} rsIDs", 
                 parsed.metadata.total_variants, parsed.metadata.rsid_count);
    }
}

#[test]
fn test_pgp_harvard_tsv_bz2() {
    let path = Path::new("../.cursor/genomic_data/PGP-Harvard/PGP-Harvard_CompleteGenomics_1.tsv.bz2");
    if path.exists() {
        let result = parse_genome_file(path);
        assert!(result.is_ok(), "Failed to parse PGP Harvard TSV.bz2: {:?}", result.err());
        let parsed = result.unwrap();
        assert_eq!(parsed.metadata.source_format, "PGP-Harvard");
        println!("✅ PGP Harvard TSV.bz2: {} variants, {} rsIDs", 
                 parsed.metadata.total_variants, parsed.metadata.rsid_count);
    }
}

#[test]
fn test_pgp_harvard_vcf_bz2() {
    let path = Path::new("../.cursor/genomic_data/PGP-Harvard/PGP-Harvard_CompleteGenomics_4.vcf.bz2");
    if path.exists() {
        let result = parse_genome_file(path);
        assert!(result.is_ok(), "Failed to parse PGP Harvard VCF.bz2: {:?}", result.err());
        let parsed = result.unwrap();
        assert_eq!(parsed.metadata.source_format, "VCF");
        println!("✅ PGP Harvard VCF.bz2: {} variants, {} rsIDs", 
                 parsed.metadata.total_variants, parsed.metadata.rsid_count);
    }
}

#[test]
fn test_promethease_23andme() {
    let path = Path::new("../.cursor/genomic_data/Promethease/Promethease_23andMe_raw.txt");
    if path.exists() {
        let result = parse_genome_file(path);
        assert!(result.is_ok(), "Failed to parse Promethease 23andMe: {:?}", result.err());
        let parsed = result.unwrap();
        assert_eq!(parsed.metadata.source_format, "23andMe");
        println!("✅ Promethease 23andMe: {} variants, {} rsIDs", 
                 parsed.metadata.total_variants, parsed.metadata.rsid_count);
    }
}

#[test]
fn test_promethease_vcf() {
    let path = Path::new("../.cursor/genomic_data/Promethease/Promethease_clinical.vcf");
    if path.exists() {
        let result = parse_genome_file(path);
        assert!(result.is_ok(), "Failed to parse Promethease VCF: {:?}", result.err());
        let parsed = result.unwrap();
        assert_eq!(parsed.metadata.source_format, "VCF");
        println!("✅ Promethease VCF: {} variants, {} rsIDs", 
                 parsed.metadata.total_variants, parsed.metadata.rsid_count);
    }
}

#[test]
fn test_imputed_wgs_vcf_bz2() {
    let path = Path::new("../.cursor/genomic_data/Other-Genomic/Imputed_WGS_1.vcf.bz2");
    if path.exists() {
        let result = parse_genome_file(path);
        assert!(result.is_ok(), "Failed to parse Imputed WGS VCF.bz2: {:?}", result.err());
        let parsed = result.unwrap();
        assert_eq!(parsed.metadata.source_format, "VCF");
        println!("✅ Imputed WGS VCF.bz2: {} variants, {} rsIDs", 
                 parsed.metadata.total_variants, parsed.metadata.rsid_count);
    }
}

