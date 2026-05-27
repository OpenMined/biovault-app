import { invoke } from '@tauri-apps/api/core'
import { wsLabBridge } from './ws-lab-bridge'

export async function invokeOrBridge<T>(command: string, action: string, payload: unknown): Promise<T> {
  try {
    return await invoke<T>(command, payload as Record<string, unknown>)
  } catch (error) {
    if (!shouldUseBrowserBridge(error)) throw error
    return wsLabBridge.request<T>(action, payload)
  }
}

function shouldUseBrowserBridge(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /__TAURI__|not.*tauri|ipc|invoke/i.test(message)
}
