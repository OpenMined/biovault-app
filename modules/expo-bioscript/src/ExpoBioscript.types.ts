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
};
