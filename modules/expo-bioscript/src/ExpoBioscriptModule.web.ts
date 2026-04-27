import type { RunFileRequest, RunFileResult } from './ExpoBioscript.types';
import { runFileOnWeb, warmupMontyWebRuntime, warmupWebRuntime } from './ExpoBioscriptWebRuntime';

class ExpoBioscriptWebModule {
  isAvailable(): boolean {
    return true;
  }

  async warmup(): Promise<void> {
    await warmupWebRuntime();
  }

  async warmupMonty(): Promise<void> {
    await warmupMontyWebRuntime();
  }

  async runFile(request: RunFileRequest): Promise<RunFileResult> {
    return runFileOnWeb(request);
  }
}

export default new ExpoBioscriptWebModule();
