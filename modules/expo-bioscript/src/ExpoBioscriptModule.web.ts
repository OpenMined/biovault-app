import type { RunFileRequest, RunFileResult } from './ExpoBioscript.types';
import { isWebRuntimeAvailable, runFileOnWeb } from './ExpoBioscriptWebRuntime';

class ExpoBioscriptWebModule {
  isAvailable(): boolean {
    return isWebRuntimeAvailable();
  }

  async runFile(request: RunFileRequest): Promise<RunFileResult> {
    return runFileOnWeb(request);
  }
}

export default new ExpoBioscriptWebModule();
