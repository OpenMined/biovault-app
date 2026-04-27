import { NativeModule, requireNativeModule } from 'expo';
import { Platform } from 'react-native';

import type { RunFileRequest, RunFileResult } from './ExpoBioscript.types';
import ExpoBioscriptWebModule from './ExpoBioscriptModule.web';

declare class ExpoBioscriptNativeModule extends NativeModule {
  isAvailable(): boolean;
  runFile(request: RunFileRequest): Promise<RunFileResult>;
}

type ExpoBioscriptModuleShape = {
  isAvailable(): boolean;
  warmup(): Promise<void>;
  warmupMonty(): Promise<void>;
  runFile(request: RunFileRequest): Promise<RunFileResult>;
};

const ExpoBioscriptModule: ExpoBioscriptModuleShape =
  Platform.OS === 'web'
    ? ExpoBioscriptWebModule
    : (() => {
        const nativeModule = requireNativeModule<ExpoBioscriptNativeModule>('ExpoBioscript');
        return {
          isAvailable: () => nativeModule.isAvailable(),
          runFile: (request: RunFileRequest) => nativeModule.runFile(request),
          warmup: async () => {},
          warmupMonty: async () => {},
        };
      })();

export default ExpoBioscriptModule;
