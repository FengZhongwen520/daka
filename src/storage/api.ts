const configuredBase = String(import.meta.env.VITE_DAKA_SERVE_URL || '').trim()
const API_BASE = (configuredBase || '/api').replace(/\/+$/, '')

export interface CloudUser {
  id: string
  loginId: string
}

export interface AuthSession {
  token: string
  user: CloudUser
}

export interface StorageRecord {
  key: string
  value: string
}

export class ApiError extends Error {
  readonly status: number

  constructor(
    message: string,
    status: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (options.body != null) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: 'omit',
    })
  } catch {
    throw new ApiError('无法连接 daka_serve，请检查服务和 API 地址', 0)
  }

  if (!response.ok) {
    let message = `请求失败 (${response.status})`
    try {
      const body = await response.json() as { message?: string; error?: string }
      message = body.message || body.error || message
    } catch {
      // Keep the status-based message when the server does not return JSON.
    }
    throw new ApiError(message, response.status)
  }

  if (response.status === 204) return undefined as T
  return await response.json() as T
}

export function register(loginId: string, password: string): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ loginId, password }),
  })
}

export function login(loginId: string, password: string): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ loginId, password }),
  })
}

export function logout(token: string): Promise<void> {
  return apiRequest<void>('/auth/logout', { method: 'POST' }, token)
}

export async function loadRecords(token: string): Promise<StorageRecord[]> {
  const response = await apiRequest<{ records: StorageRecord[] }>('/storage', {}, token)
  return Array.isArray(response.records) ? response.records : []
}

export function putRecord(token: string, key: string, value: string): Promise<void> {
  return apiRequest<void>('/storage', {
    method: 'PUT',
    body: JSON.stringify({ key, value }),
  }, token)
}

export function deleteRecord(token: string, key: string): Promise<void> {
  return apiRequest<void>(`/storage?key=${encodeURIComponent(key)}`, {
    method: 'DELETE',
  }, token)
}

export function clearRecords(token: string): Promise<void> {
  return apiRequest<void>('/storage/all', { method: 'DELETE' }, token)
}

export interface RealtimeTicket {
  ticket: string
  expiresInSeconds: number
}

export function createRealtimeTicket(token: string): Promise<RealtimeTicket> {
  return apiRequest<RealtimeTicket>('/realtime/ticket', { method: 'POST' }, token)
}

export function realtimeUrl(ticket: string): string {
  const url = new URL(API_BASE, window.location.href)
  const basePath = url.pathname.replace(/\/api\/?$/, '')
  const path = `${basePath}/ws/realtime`.replace(/\/+/g, '/')
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${url.host}${path}?ticket=${encodeURIComponent(ticket)}`
}
