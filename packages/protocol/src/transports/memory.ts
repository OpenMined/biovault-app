import type { ClientMsg, ServerMsg, AppState, Command } from '../types'
import type { ServerMsgListener, Transport } from '../transport'

// In-process transport for mobile (Expo). Wraps a Rust call (expo-bioscript, expo-monty)
// or a pure-JS reducer behind the same Transport interface the WS client uses.
// TODO(mobile): replace the reducer with a call into the native module that owns state.

type Reducer = (state: AppState, cmd: Command) => AppState | { error: string }

const defaultReducer: Reducer = (state, cmd) => {
  switch (cmd.type) {
    case 'set_agreed':
      return { ...state, agreed: cmd.agreed }
    case 'continue':
      if (!state.agreed) return { error: 'must accept terms before continuing' }
      return { ...state, screen: 'home' }
    case 'reset':
      return { screen: 'warning', agreed: false }
  }
}

export class MemoryTransport implements Transport {
  private state: AppState = { screen: 'warning', agreed: false }
  private listeners = new Set<ServerMsgListener>()
  private reducer: Reducer

  constructor(reducer: Reducer = defaultReducer) {
    this.reducer = reducer
  }

  connect() {
    queueMicrotask(() => this.emit({ type: 'state', state: this.state }))
  }

  send(msg: ClientMsg) {
    if (msg.type !== 'command') return
    const next = this.reducer(this.state, msg.command)
    if ('error' in next) {
      this.emit({ type: 'error', message: next.error })
      return
    }
    this.state = next
    this.emit({ type: 'state', state: this.state })
  }

  subscribe(listener: ServerMsgListener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(msg: ServerMsg) {
    this.listeners.forEach((l) => l(msg))
  }
}
