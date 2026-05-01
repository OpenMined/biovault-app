// Mirror of src-tauri/src/protocol.rs — keep in sync (codegen target).

export const AUTH_TOKEN = 'biovault-dev-token'
export const WS_PORT = 17890
export const WS_URL = `ws://127.0.0.1:${WS_PORT}/ws?token=${AUTH_TOKEN}`

export type Screen = 'warning' | 'home'

export interface AppState {
  screen: Screen
  agreed: boolean
}

export type Command =
  | { type: 'set_agreed'; agreed: boolean }
  | { type: 'continue' }
  | { type: 'reset' }

export type ClientMsg = { type: 'command'; command: Command }
  | { type: 'lab_request'; id: string; action: string; payload: unknown }

export type ServerMsg =
  | { type: 'state'; state: AppState }
  | { type: 'lab_response'; id: string; ok: boolean; value?: unknown; error?: string }
  | { type: 'error'; message: string }
