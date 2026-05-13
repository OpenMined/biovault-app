import ExpoBioscriptModule from './ExpoBioscriptModule';

import type { RunFileRequest, RunFileResult } from './ExpoBioscript.types';

export type {
  BioscriptInputFormat,
  GenomeDescriptor,
  RunAssayRequest,
  RunFileRequest,
  RunFileResult,
  UnsupportedAssayVariant,
} from './ExpoBioscript.types';

export function isBioscriptAvailable(): boolean {
  return ExpoBioscriptModule.isAvailable();
}

export function warmupBioscriptRuntime(): Promise<void> {
  return ExpoBioscriptModule.warmup();
}

export function warmupMontyRuntime(): Promise<void> {
  return ExpoBioscriptModule.warmupMonty();
}

export function runFile(request: RunFileRequest): Promise<RunFileResult> {
  return ExpoBioscriptModule.runFile(request);
}

export { runAssay } from './ExpoBioscriptAssays';

export {
  inspectBytes,
  compileVariantYamlText,
  generateBamBaiFile,
  generateCramCraiFile,
  generateFastaFaiFile,
  generateVcfTbiFile,
  lookupGenotypeBytesVariants,
  lookupCramVariants,
  lookupVcfVariants,
  resolveRemoteResourceText,
  resolvePackageZipBytes,
  resolvePackageReleaseText,
  runPackageReportBytes,
  runPackageReportFromBamFile,
  runPackageReportFromCramFile,
  runPackageReportFromVcfFile,
  warmupBioscriptLookupWorker,
  type BioscriptPackageFile,
  type BioscriptPackageReportOptions,
  type BioscriptPackageReportResult,
  type BioscriptPackageRelease,
  type BioscriptPackageResolution,
  type BioscriptPackageResource,
  type BioscriptRemoteDependency,
  type BioscriptRemoteResourceResolution,
  type BioscriptInspection,
  type BioscriptInspectOptions,
  verifyPackageArtifactSha256,
  type CramVariantLookupInput,
  type CramVariantLookupResult,
  type CramVariantObservation,
  type CramVariantSpec,
  type VariantLookupResult,
  type VariantObservation,
  type VariantSpec,
  type VcfVariantLookupInput,
} from './BioscriptLookup';
