import type { ClientMsg, ServerMsg } from './types'

export type ServerMsgListener = (msg: ServerMsg) => void

export interface Transport {
  connect(): void
  send(msg: ClientMsg): void
  subscribe(listener: ServerMsgListener): () => void
}
