import type { RunFileRequest, RunFileResult } from './ExpoBioscript.types';
import { isWebRuntimeAvailable, runFileOnWeb, warmupWebRuntime } from './ExpoBioscriptWebRuntime';

class ExpoBioscriptWebModule {
  isAvailable(): boolean {
    return isWebRuntimeAvailable();
  }

  async warmup(): Promise<void> {
    await warmupWebRuntime();
  }

  async runFile(request: RunFileRequest): Promise<RunFileResult> {
    return runFileOnWeb(request);
  }
}

export default new ExpoBioscriptWebModule();
