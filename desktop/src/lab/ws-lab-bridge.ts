import { AUTH_TOKEN, WS_PORT } from '@biovault/protocol'

type LabResponse = {
  type: 'lab_response'
  id: string
  ok: boolean
  value?: unknown
  error?: string
}

class WsLabBridge {
  private ws: WebSocket | null = null
  private connecting: Promise<WebSocket> | null = null
  private pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private sequence = 0

  async request<T>(action: string, payload: unknown): Promise<T> {
    const ws = await this.connect()
    const id = `lab-${Date.now()}-${this.sequence++}`
    const response = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      window.setTimeout(() => {
        const pending = this.pending.get(id)
        if (!pending) return
        this.pending.delete(id)
        pending.reject(new Error(`Lab bridge request timed out: ${action}`))
      }, 120_000)
    })
    ws.send(JSON.stringify({ type: 'lab_request', id, action, payload }))
    return response
  }

  private async connect(): Promise<WebSocket> {
    if (this.ws?.readyState === WebSocket.OPEN) return this.ws
    if (this.connecting) return this.connecting
    this.connecting = new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}/ws?token=${AUTH_TOKEN}`)
      ws.onopen = () => {
        this.ws = ws
        this.connecting = null
        resolve(ws)
      }
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as unknown
        if (!isLabResponse(msg)) return
        const pending = this.pending.get(msg.id)
        if (!pending) return
        this.pending.delete(msg.id)
        if (msg.ok) pending.resolve(msg.value)
        else pending.reject(new Error(msg.error ?? 'Lab bridge request failed'))
      }
      ws.onerror = () => {
        this.connecting = null
        reject(new Error('Failed to connect to desktop Lab bridge'))
      }
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null
      }
    })
    return this.connecting
  }
}

export const wsLabBridge = new WsLabBridge()

function isLabResponse(value: unknown): value is LabResponse {
  return Boolean(value && typeof value === 'object' && (value as { type?: unknown }).type === 'lab_response')
}
