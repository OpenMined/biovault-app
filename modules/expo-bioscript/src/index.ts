import ExpoBioscriptModule from './ExpoBioscriptModule';

import type { RunFileRequest, RunFileResult } from './ExpoBioscript.types';

export type { BioscriptInputFormat, RunAssayRequest, RunFileRequest, RunFileResult, UnsupportedAssayVariant } from './ExpoBioscript.types';

export function isBioscriptAvailable(): boolean {
  return ExpoBioscriptModule.isAvailable();
}

export function runFile(request: RunFileRequest): Promise<RunFileResult> {
  return ExpoBioscriptModule.runFile(request);
}

export { runAssay } from './ExpoBioscriptAssays';
