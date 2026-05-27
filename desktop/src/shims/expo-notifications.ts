export type Notification = {
  date?: number
  request: {
    content: {
      body?: string
      data?: Record<string, unknown>
      subtitle?: string
      title?: string
    }
    identifier: string
    trigger?: unknown
  }
}
