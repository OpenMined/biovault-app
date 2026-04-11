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
  runFile(request: RunFileRequest): Promise<RunFileResult>;
};

const ExpoBioscriptModule: ExpoBioscriptModuleShape =
  Platform.OS === 'web'
    ? ExpoBioscriptWebModule
    : requireNativeModule<ExpoBioscriptNativeModule>('ExpoBioscript');

export default ExpoBioscriptModule;
