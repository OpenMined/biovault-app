# BioVault Genomic Data Parsers

## Overview

The BioVault Rust library now supports **automatic format detection** and parsing of multiple genomic data formats into a unified SQLite schema.

## Supported Formats

### 1. **23andMe** (.txt, .zip)

- **Versions**: v3, v4, v5
- **Format**: Tab-separated (rsID, chromosome, position, genotype)
- **Files supported**: 4
- **Example**: `23andMe_v5.txt`

```
# rsid    chromosome    position    genotype
rs548049170    1    69869    TT
```

### 2. **AncestryDNA** (.txt, .zip)

- **Versions**: v1.0, v2.0
- **Format**: Tab-separated (rsID, chromosome, position, allele1, allele2)
- **Files supported**: 5
- **Example**: `AncestryDNA_v2.txt`

```
rsid    chromosome    position    allele1    allele2
rs3131972    1    752721    A    G
```

### 3. **VCF Format** (.vcf, .vcf.gz, .vcf.bz2)

- **Standard**: VCFv4.1+
- **Compression**: Supports uncompressed, gzip, and bzip2
- **Sources**: GenesForGood, Gencove, PGP-Harvard, AncestryDNA, Imputed WGS
- **Files supported**: 13
- **Example**: `GenesForGood_unphased.vcf`

```
##fileformat=VCFv4.1
#CHROM  POS     ID      REF     ALT     QUAL    FILTER  INFO    FORMAT  SAMPLE
1       69869   rs548049170     T       .       .       PASS    .       GT      0/0
```

### 4. **PGP Harvard Complete Genomics** (.tsv, .tsv.bz2)

- **Source**: Personal Genome Project
- **Format**: Complete Genomics TSV variant format
- **Compression**: Supports uncompressed and bzip2
- **Files supported**: 4
- **Example**: `PGP-Harvard_CompleteGenomics_1.tsv.bz2`

```
>locus    ploidy    allele    chromosome    begin    end    varType    reference    alleleSeq
1        2         all       chr1          11433    11438  ref        =            =
```

### 5. **GenesForGood 23andMe Format** (.txt)

- **Format**: Same as 23andMe (uses 23andMe parser)
- **Files supported**: 1
- **Example**: `GenesForGood_23andMe_format.txt`

## File Coverage

| Format                 | Files  | Percentage |
| ---------------------- | ------ | ---------- |
| 23andMe                | 4      | 8%         |
| AncestryDNA            | 5      | 10%        |
| VCF                    | 13     | 27%        |
| PGP Harvard            | 4      | 8%         |
| GenesForGood (23andMe) | 1      | 2%         |
| **Total Supported**    | **27** | **56%**    |
| Not yet supported      | 21     | 44%        |
| **Grand Total**        | **48** | **100%**   |

### Not Yet Supported

- **BAM files** (1) - Binary alignment format (complex, skip for now)
- **JSON metadata** (4) - Survey data, not genomic variants
- **Promethease reports** (4) - Analysis reports, not raw data
- **Other formats** (12) - Various specialized formats

## Auto-Detection

The library automatically detects the file format based on:

1. **Filename patterns**: `23andme`, `ancestry`, `PGP`, `CompleteGenomics`
2. **File extensions**: `.vcf`, `.vcf.gz`, `.vcf.bz2`, `.tsv`, `.tsv.bz2`
3. **File content**: Header analysis for VCF, 23andMe, AncestryDNA markers

## Usage

### From TypeScript/JavaScript (React Native)

```typescript
import ExpoBiovault from './modules/expo-biovault'

// Works with ANY supported format!
const dbPath = await ExpoBiovault.processGenomeFile(
	filePath, // Can be 23andMe, AncestryDNA, VCF, PGP Harvard
	'My Genome', // Custom name
	documentsDir // Output directory
)
```

### From Rust

```rust
use biovault_rust_lib::process_genome;

// Auto-detects format and creates SQLite database
let db_path = process_genome(
    input_path,
    custom_name,
    output_dir
)?;
```

### Direct Parser Access

```rust
use biovault_rust_lib::parsers::{
    parse_genome_file,           // Auto-detect
    twenty_three_and_me,          // 23andMe specific
    ancestry_dna,                 // AncestryDNA specific
    vcf,                          // VCF specific
    pgp_harvard,                  // PGP Harvard specific
};

// Auto-detect and parse
let parse_result = parse_genome_file(Path::new("genome.vcf"))?;

// Or use specific parser
let parse_result = vcf::parse_vcf_file(Path::new("genome.vcf.gz"))?;
```

## SQLite Schema

All formats are parsed into a unified schema:

### `genome_metadata` table

```sql
CREATE TABLE genome_metadata (
    id INTEGER PRIMARY KEY,
    file_name TEXT NOT NULL,
    source_format TEXT NOT NULL,      -- "23andMe", "AncestryDNA", "VCF", etc.
    total_variants INTEGER NOT NULL,
    rsid_count INTEGER NOT NULL,
    assembly TEXT,
    upload_date TEXT NOT NULL,
    db_name TEXT NOT NULL
);
```

### `variants` table

```sql
CREATE TABLE variants (
    id INTEGER PRIMARY KEY,
    file_id INTEGER NOT NULL,
    rsid TEXT,                        -- NULL if no rsID
    chromosome TEXT NOT NULL,         -- "1", "2", ..., "X", "Y", "MT"
    position INTEGER NOT NULL,
    genotype TEXT NOT NULL,           -- "AA", "AG", "GG", etc.
    source_format TEXT NOT NULL,
    FOREIGN KEY(file_id) REFERENCES genome_metadata(id) ON DELETE CASCADE
);

CREATE INDEX idx_variants_rsid ON variants (rsid);
CREATE INDEX idx_variants_chr_pos ON variants (chromosome, position);
```

## Compression Support

### What is bz2/gz?

- **`.gz`** = gzip compression (~10x smaller)
- **`.bz2`** = bzip2 compression (~15x smaller, better ratio)
- **Uncompressed** = Original text file (large, ~500MB-2GB)

The library handles all compression formats **transparently** - you don't need to decompress files manually!

## Performance

| Format              | File Size | Variants | Parse Time\* |
| ------------------- | --------- | -------- | ------------ |
| 23andMe v5          | 16 MB     | ~640K    | ~2-3 sec     |
| AncestryDNA v2      | 17 MB     | ~680K    | ~2-3 sec     |
| VCF (uncompressed)  | 500 MB    | ~550K    | ~8-12 sec    |
| VCF.gz              | 50 MB     | ~550K    | ~10-15 sec   |
| VCF.bz2             | 30 MB     | ~550K    | ~15-20 sec   |
| PGP Harvard TSV.bz2 | 250 MB    | ~100K+   | ~20-30 sec   |

\*Approximate times on mobile devices

## Next Steps

To support the remaining 44% of files, add:

1. **FTDNA CSV parser** (1 file) - Simple CSV format
2. **More format variations** - Edge cases and format variants

## Dependencies

```toml
[dependencies]
rusqlite = "0.32"        # SQLite database
zip = "2.2"              # ZIP extraction
flate2 = "1.0"           # .gz decompression
bzip2 = "0.4"            # .bz2 decompression
chrono = "0.4"           # Timestamps
```

## Error Handling

The parser gracefully handles:

- Invalid/corrupt lines (skipped with warning)
- Missing rsIDs (stored as NULL)
- No-call genotypes (skipped)
- Malformed files (returns error with context)
- Unsupported formats (clear error message)

## Testing

Run the CLI tool to test parsing:

```bash
cd biovault_rust_lib
cargo run --release -- \
  --input ../cursor/genomic_data/23AndMe/23andMe_v5.txt \
  --name "Test Genome" \
  --output ./test_output
```

## License

Part of the BioVault project.
