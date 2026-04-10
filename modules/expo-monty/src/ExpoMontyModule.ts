import { NativeModule, requireNativeModule } from 'expo';

import type { ExpoMontyModuleEvents, RunCodeInputs, RunCodeResult } from './ExpoMonty.types';

declare class ExpoMontyModule extends NativeModule<ExpoMontyModuleEvents> {
  isAvailable(): boolean;
  runCode(code: string, inputs?: RunCodeInputs): Promise<RunCodeResult>;
}

export default requireNativeModule<ExpoMontyModule>('ExpoMonty');
