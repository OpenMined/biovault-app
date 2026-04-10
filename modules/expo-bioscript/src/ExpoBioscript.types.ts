export type BioscriptInputFormat = 'auto' | 'text' | 'zip' | 'vcf' | 'cram';

export type RunFileRequest = {
  scriptPath: string;
  root?: string;
  inputFile?: string;
  outputFile?: string;
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
};
