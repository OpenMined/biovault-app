# Eye Color Trait

## Overview

Eye color is a complex genetic trait influenced by multiple genes, primarily **OCA2** and **HERC2**. The genetics involve several genes that can modify the eventual outcome.

## Population Genetics

- All populations except Caucasians basically have brown eyes
- Among Caucasians, researchers track blue vs non-blue eye color
- This analysis identifies 3 distinct haplotypes for blue eye color

## Primary Genes

### OCA2 (Oculocutaneous Albinism Type 2)

- **Location**: Chromosome 15
- **Role**: Major determinant of eye color
- **Function**: Variants first linked to albinism and melanoma risk
- **Key variants**: Located in first intron linked to blue/green eyes

### HERC2 (HECT and RLD Domain Containing E3 Ubiquitin Protein Ligase 2)

- **Location**: Chromosome 15
- **Role**: Regulatory control of OCA2 expression
- **Function**: Contains regulatory elements affecting blue eye color
- **Most important SNP**: rs12913832 (found in 97% of blue-eyed individuals)

## Blue Eye Haplotypes

### BEH1 - Blue-Eye Associated Haplotype #1

**Gene**: OCA2  
**SNPs**:

- rs4778138(A) - Weak Amber Gradient
- rs4778241(C) - Low Melanin (basis for gray, blue, green, or yellow eyes)
- rs7495174(A) - Green eye color association

### BEH2 - Blue-Eye Associated Haplotype #2

**Gene**: HERC2  
**SNPs**:

- rs1129038(A) - Penetrance modifier for blue eyes
- rs12913832(C) - Found in 97% of blue-eyed individuals ⭐

### BEH3 - Blue-Eye Associated Haplotype #3

**Gene**: HERC2  
**SNPs**:

- rs916977(G)
- rs1667394(A) - Starburst (Collarette) pattern

### OCA2 First Intron Haplotype

**Occurrence**: 90% of blue/green eyes, 10% of brown eyes  
**SNPs**:

- rs7495174 - Green eye color
- rs6497268 - Blue/green association
- rs11855019 - Blue/green association

## Key SNPs Summary

| RSI        | Gene    | Effect                        | Importance     |
| ---------- | ------- | ----------------------------- | -------------- |
| rs12913832 | HERC2   | 97% of blue eyes (C allele)   | ⭐⭐⭐ Primary |
| rs1129038  | HERC2   | Blue eyes penetrance modifier | ⭐⭐⭐ Primary |
| rs4778241  | OCA2    | Low melanin (CC)              | ⭐⭐ Secondary |
| rs7495174  | OCA2    | Green eye color               | ⭐⭐ Secondary |
| rs1800407  | OCA2    | Eye color variant             | ⭐ Tertiary    |
| rs16891982 | SLC45A2 | Starburst pattern (GG)        | ⭐ Tertiary    |

## Iris Pattern Effects

Some SNPs affect specific iris features:

- **rs989869(CT)**: Contrasting sphincter around pupil
- **rs1667394(TT)**: Starburst (Collarette)
- **rs16891982(GG)**: Starburst (Collarette)
- **rs12203592(CC)**: No pigmented Collarette
- **rs12906280(GG)**: Gray ring around outer edge
- **rs1533995(A)**: More crypts
- **rs3739070(A)**: More pronounced furrows
- **rs12896399(G)**: Pigmented rings

## Melanin Blocking Variants

These variants reduce melanin production, often resulting in lighter eyes:

- rs3794604(CC)
- rs7174027(GG)
- rs9782955(CC)
- rs4778241(CC)

## File Structure

```
eye_color/
├── README.md           # This file - comprehensive overview
├── trait_info.json     # General trait information and metadata
├── genes.json          # Detailed gene information
├── haplotypes.json     # Blue eye haplotype definitions
└── rsids.json          # Complete SNP catalog with effects
```

## References

1. **PMID 17236130**: OCA2 variants linked to blue/green eye color (first intron haplotype)
2. **PMID 18172690**: rs12913832 found in 97% of blue-eyed individuals
3. **DOI 10.1371/journal.pgen.1000934**: Comprehensive eye color genetics study
4. **SNPedia**: https://www.snpedia.com/index.php/Eye_color

## Usage for Analysis

To match against genetic data:

1. Load the user's genetic data file
2. Query for rsids listed in `rsids.json`
3. Check haplotype combinations in `haplotypes.json`
4. Calculate probability based on allele combinations
5. Consider population background if available

### Interpretation Guidelines

**Blue Eyes**: Most likely if:

- rs12913832 = CC or CT
- rs1129038 = AA or AG
- Multiple BEH2 haplotype markers present

**Brown Eyes**: Most likely if:

- rs12913832 = TT
- Multiple melanin-promoting alleles

**Green/Hazel Eyes**: Intermediate patterns or:

- rs7495174(A) present
- Mixed haplotype signals

**Note**: Eye color is polygenic and influenced by multiple genes. These markers provide probabilities, not certainties.
