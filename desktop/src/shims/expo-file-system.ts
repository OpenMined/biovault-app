import { invokeOrBridge } from '../lab/invoke-or-bridge'

export class Directory {
  uri: string
  exists = false

  constructor(...parts: Array<{ uri?: string } | string>) {
    this.uri = parts.map((part) => typeof part === 'string' ? part : part.uri ?? '').join('/')
  }

  create(_options?: unknown) {
    this.exists = true
  }
}

export class File {
  uri: string
  exists = false

  constructor(...parts: Array<{ uri?: string } | string>) {
    this.uri = parts.map((part) => typeof part === 'string' ? part : part.uri ?? '').join('/')
  }
}

export const Paths = {
  document: { uri: 'desktop://document' },
  cache: { uri: 'desktop://cache' },
}

export async function readAsStringAsync(uri: string, _options?: unknown): Promise<string> {
  return invokeOrBridge<string>('lab_fs_read_text', 'fs_read_text', { uri })
}

export async function writeAsStringAsync(uri: string, contents: string, _options?: unknown): Promise<void> {
  await invokeOrBridge('lab_fs_write_text', 'fs_write_text', { uri, contents })
}

export async function deleteAsync(uri: string, _options?: unknown): Promise<void> {
  await invokeOrBridge('lab_fs_delete', 'fs_delete', { uri })
}

export async function getInfoAsync(uri: string, _options?: unknown): Promise<{ exists: boolean; uri: string }> {
  return invokeOrBridge<{ exists: boolean; uri: string }>('lab_fs_info', 'fs_info', { uri })
}

export const EncodingType = {
  UTF8: 'utf8',
}
