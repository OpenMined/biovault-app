import { NativeModule, requireNativeModule } from 'expo';

import type { RunFileRequest, RunFileResult } from './ExpoBioscript.types';

declare class ExpoBioscriptModule extends NativeModule {
  isAvailable(): boolean;
  runFile(request: RunFileRequest): Promise<RunFileResult>;
}

export default requireNativeModule<ExpoBioscriptModule>('ExpoBioscript');
