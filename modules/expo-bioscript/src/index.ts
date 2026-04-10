import ExpoBioscriptModule from './ExpoBioscriptModule';

import type { BioscriptInputFormat, RunFileRequest, RunFileResult } from './ExpoBioscript.types';

export type { BioscriptInputFormat, RunFileRequest, RunFileResult } from './ExpoBioscript.types';

export function isBioscriptAvailable(): boolean {
  return ExpoBioscriptModule.isAvailable();
}

export function runFile(request: RunFileRequest): Promise<RunFileResult> {
  return ExpoBioscriptModule.runFile(request);
}
