import { NativeModule, requireNativeModule } from 'expo'

declare class ExpoBiovaultModule extends NativeModule {
	processGenomeFile(inputPath: string, customName: string, outputDir: string): Promise<string>
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ExpoBiovaultModule>('ExpoBiovault')
