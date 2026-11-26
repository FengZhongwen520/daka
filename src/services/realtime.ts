import { createRealtimeTicket, realtimeUrl } from '../storage/api'
import { getCloudToken } from '../storage'

type RealtimeListener = (data: unknown) => void

const listeners = new Map<string, Set<RealtimeListener>>()
let socket: WebSocket | null = null
let connecting: Promise<WebSocket | null> | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempt = 0
let closedManually = false

export function subscribeRealtime(event: string, listener: RealtimeListener): () => void {
  const eventListeners = listeners.get(event) || new Set<RealtimeListener>()
  eventListeners.add(listener)
  listeners.set(event, eventListeners)
  void ensureRealtimeConnection()
  return () => {
    const current = listeners.get(event)
    current?.delete(listener)
    if (current?.size === 0) listeners.delete(event)
  }
}

export async function ensureRealtimeConnection(): Promise<WebSocket | null> {
  if (socket?.readyState === WebSocket.OPEN) return socket
  if (connecting) return connecting
  const token = getCloudToken()
  if (!token) return null

  connecting = (async () => {
    try {
      const ticket = await createRealtimeTicket(token)
      const next = new WebSocket(realtimeUrl(ticket.ticket))
      socket = next
      next.addEventListener('open', () => {
        reconnectAttempt = 0
      })
      next.addEventListener('message', (message) => {
        try {
          const payload = JSON.parse(String(message.data)) as {
            event?: string
            data?: unknown
          }
          if (!payload.event) return
          for (const listener of listeners.get(payload.event) || []) {
            listener(payload.data)
          }
        } catch {
          // Ignore malformed server frames and keep the connection alive.
        }
      })
      next.addEventListener('close', () => {
        if (socket === next) socket = null
        if (!closedManually) scheduleReconnect()
      })
      next.addEventListener('error', () => {
        next.close()
      })
      return next
    } catch {
      scheduleReconnect()
      return null
    } finally {
      connecting = null
    }
  })()
  return connecting
}

export function disconnectRealtime(): void {
  closedManually = true
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
  socket?.close()
  socket = null
}

function scheduleReconnect() {
  if (closedManually || reconnectTimer || !getCloudToken()) return
  const delay = Math.min(15_000, 1_000 * 2 ** Math.min(reconnectAttempt++, 4))
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void ensureRealtimeConnection()
  }, delay)
}
