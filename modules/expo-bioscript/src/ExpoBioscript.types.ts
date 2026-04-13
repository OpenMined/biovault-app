export type BioscriptInputFormat = 'auto' | 'text' | 'zip' | 'vcf' | 'cram';

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
