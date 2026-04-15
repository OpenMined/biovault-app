import { useEffect, useState } from 'react'
import type { AppState, Command, ServerMsg } from './types'
import type { Transport } from './transport'

export interface Store {
  useAppState: () => AppState | null
  send: (command: Command) => void
  transport: Transport
}

export function createStore(transport: Transport): Store {
  let state: AppState | null = null
  const listeners = new Set<(s: AppState | null) => void>()

  transport.subscribe((msg: ServerMsg) => {
    if (msg.type === 'state') {
      state = msg.state
      listeners.forEach((l) => l(state))
    } else if (msg.type === 'error') {
      console.warn('[protocol] server error:', msg.message)
    }
  })
  transport.connect()

  const useAppState = (): AppState | null => {
    const [s, setS] = useState<AppState | null>(state)
    useEffect(() => {
      listeners.add(setS)
      return () => {
        listeners.delete(setS)
      }
    }, [])
    return s
  }

  const send = (command: Command) => {
    transport.send({ type: 'command', command })
  }

  return { useAppState, send, transport }
}
