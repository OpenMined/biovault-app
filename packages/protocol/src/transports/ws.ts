import type { ClientMsg, ServerMsg } from '../types'
import { WS_URL } from '../types'
import type { ServerMsgListener, Transport } from '../transport'

export class WsTransport implements Transport {
  private ws: WebSocket | null = null
  private queue: ClientMsg[] = []
  private listeners = new Set<ServerMsgListener>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private url: string

  constructor(url: string = WS_URL) {
    this.url = url
  }

  connect() {
    if (this.ws && this.ws.readyState <= 1) return
    const ws = new WebSocket(this.url)
    this.ws = ws
    ws.onopen = () => {
      const q = this.queue
      this.queue = []
      q.forEach((m) => this.send(m))
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as ServerMsg
        this.listeners.forEach((l) => l(msg))
      } catch (e) {
        console.warn('[protocol] bad server msg', e)
      }
    }
    ws.onclose = () => {
      this.ws = null
      if (this.reconnectTimer == null) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null
          this.connect()
        }, 500)
      }
    }
    ws.onerror = () => ws.close()
  }

  send(msg: ClientMsg) {
    const payload = JSON.stringify(msg)
    if (this.ws && this.ws.readyState === 1) this.ws.send(payload)
    else this.queue.push(msg)
  }

  subscribe(listener: ServerMsgListener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
