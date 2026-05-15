export type BioscriptInputFormat = 'auto' | 'text' | 'zip' | 'vcf' | 'cram' | 'bam';

/** Descriptor passed from the web UI to the Monty runtime so `bioscript.load_genome`
 * (and the legacy `bioscript.load_genotypes`) can dispatch to the right backend.
 * See docs/architecture/wasm.md — this is the Phase 2 contract.
 *
 * On web, genome descriptors are served through Rust-backed bioscript-wasm
 * lookups. `cram` / `vcf` retain browser `File` handles for indexed reads;
 * text-shaped inputs pass bytes to Rust for genotype parsing.
 */
export type GenomeDescriptor =
  | { kind: 'text'; name: string; text: string }
  | { kind: 'zip'; name: string; bytes: Uint8Array }
  | { kind: 'vcf'; name: string; vcfFile: File; tbiBytes: Uint8Array }
  | { kind: 'bam'; name: string; bamFile: File; baiBytes: Uint8Array }
  | {
      kind: 'cram'
      name: string
      cramFile: File
      craiBytes: Uint8Array
      fastaFile: File
      faiBytes: Uint8Array
    };

export type RunFileRequest = {
  scriptPath: string;
  scriptContents?: string;
  root?: string;
  inputFile?: string;
  inputContents?: string;
  outputFile?: string;
  fileContents?: Record<string, string>;
  participantId?: string;
  traceReportPath?: string;
  timingReportPath?: string;
  inputFormat?: BioscriptInputFormat;
  inputIndex?: string;
  referenceFile?: string;
  referenceIndex?: string;
  autoIndex?: boolean;
  cacheDir?: string;
  maxDurationMs?: number;
  maxMemoryBytes?: number;
  maxAllocations?: number;
  maxRecursionDepth?: number;
  /**
   * Web-only: rich genome descriptors the script can reference by name.
   * Python calls `bioscript.load_genome(name)` → the runtime looks up
   * `genomes[name]` and dispatches lookups to text/VCF/CRAM accordingly.
   *
   * Legacy `bioscript.load_genotypes(inputFile)` is still supported: if
   * `genomes[inputFile]` exists the new path is used, otherwise the old
   * text-only path via `inputContents` runs.
   */
  genomes?: Record<string, GenomeDescriptor>;
};

export type RunFileResult = {
  ok: true;
  outputText?: string;
  outputFiles?: Record<string, string>;
  assay?: {
    implementationKind: 'panel' | 'script';
    unsupportedVariants: UnsupportedAssayVariant[];
  };
};


export type UnsupportedAssayVariant = {
  variantName: string;
  target: string;
  reason: string;
};

export type RunAssayRequest = {
  assayPath: string;
  assayContents?: string;
  compiledContents?: string;
  compiledPath?: string;
  progressFile?: string;
  root?: string;
  inputFile?: string;
  inputContents?: string;
  outputFile?: string;
  outputFileOverride?: string;
  fileContents?: Record<string, string>;
  participantId?: string;
  traceReportPath?: string;
  timingReportPath?: string;
  inputFormat?: BioscriptInputFormat;
  inputIndex?: string;
  referenceFile?: string;
  referenceIndex?: string;
  autoIndex?: boolean;
  cacheDir?: string;
  maxDurationMs?: number;
  maxMemoryBytes?: number;
  maxAllocations?: number;
  maxRecursionDepth?: number;
};
