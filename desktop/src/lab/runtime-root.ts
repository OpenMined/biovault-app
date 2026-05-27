import { invokeOrBridge } from './invoke-or-bridge'

export type LabRuntimeRoot = {
  root: string
  outputFile: string
  cacheDir?: string
  readOutputText: () => Promise<string>
}

type RuntimeRootResponse = {
  cacheDir?: string
  outputFile: string
  root: string
}

function joinPath(root: string, path: string): string {
  if (/^([a-zA-Z]:[\\/]|\/)/.test(path)) return path
  return `${root.replace(/[\\/]+$/, '')}/${path.replace(/^[\\/]+/, '')}`
}

export async function prepareLabRuntimeRoot(outputFileName: string): Promise<LabRuntimeRoot> {
  const prepared = await invokeOrBridge<RuntimeRootResponse>(
    'lab_prepare_runtime_root',
    'prepare_runtime_root',
    { outputFileName },
  )
  return {
    root: prepared.root,
    outputFile: prepared.outputFile,
    cacheDir: prepared.cacheDir,
    readOutputText: async () => {
      try {
        return await invokeOrBridge<string>('lab_read_file_text', 'read_file_text', {
          path: joinPath(prepared.root, prepared.outputFile),
        })
      } catch {
        return ''
      }
    },
  }
}
