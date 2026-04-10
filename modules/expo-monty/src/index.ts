import ExpoMontyModule from './ExpoMontyModule';

import type { RunCodeInputs, RunCodeResult } from './ExpoMonty.types';

export type { MontyValue, RunCodeInputs, RunCodeResult } from './ExpoMonty.types';

export function isMontyAvailable(): boolean {
  return ExpoMontyModule.isAvailable();
}

function normalizeRunCodeResult(result: any): RunCodeResult {
  const metadata = result?.metadata ?? {};

  return {
    ...result,
    metadata: {
      codeLength: metadata.codeLength ?? metadata.code_length ?? 0,
      inputKeys: metadata.inputKeys ?? metadata.input_keys ?? [],
      runtime: metadata.runtime ?? 'monty',
      linked: metadata.linked ?? false,
    },
  };
}

export function runCode(code: string, inputs: RunCodeInputs = {}): Promise<RunCodeResult> {
  return ExpoMontyModule.runCode(code, inputs).then(normalizeRunCodeResult);
}
