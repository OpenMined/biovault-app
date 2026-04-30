import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { WsTransport, type AppState, type Command, type ServerMsg } from '@biovault/protocol'

let state: AppState | null = { screen: 'warning', agreed: false }
const listeners = new Set<(state: AppState | null) => void>()
let sendCommand: (command: Command) => void | Promise<void> = async (command) => {
  await invoke<AppState>('app_apply_command', { command }).then(publish)
}

function publish(next: AppState | null) {
  state = next
  listeners.forEach((listener) => listener(state))
}

async function connectNativeState() {
  const unlisten = await listen<AppState>('app-state', (event) => publish(event.payload))
  publish(await invoke<AppState>('app_snapshot'))
  sendCommand = async (command) => {
    publish(await invoke<AppState>('app_apply_command', { command }))
  }
  return unlisten
}

function connectBrowserSmokeState() {
  const transport = new WsTransport()
  transport.subscribe((msg: ServerMsg) => {
    if (msg.type === 'state') publish(msg.state)
  })
  transport.connect()
  sendCommand = (command) => transport.send({ type: 'command', command })
}

const ready = connectNativeState().catch(() => {
  connectBrowserSmokeState()
  return null
})

export function useAppState(): AppState | null {
  const [snapshot, setSnapshot] = useState<AppState | null>(state)
  useEffect(() => {
    listeners.add(setSnapshot)
    return () => {
      listeners.delete(setSnapshot)
    }
  }, [])
  return snapshot
}

export async function send(command: Command) {
  await ready
  try {
    await sendCommand(command)
  } catch (error) {
    console.warn('[desktop] command failed', error)
  }
}
