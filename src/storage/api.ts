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

async function request<T>(
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
  return request<AuthSession>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ loginId, password }),
  })
}

export function login(loginId: string, password: string): Promise<AuthSession> {
  return request<AuthSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ loginId, password }),
  })
}

export function logout(token: string): Promise<void> {
  return request<void>('/auth/logout', { method: 'POST' }, token)
}

export async function loadRecords(token: string): Promise<StorageRecord[]> {
  const response = await request<{ records: StorageRecord[] }>('/storage', {}, token)
  return Array.isArray(response.records) ? response.records : []
}

export function putRecord(token: string, key: string, value: string): Promise<void> {
  return request<void>('/storage', {
    method: 'PUT',
    body: JSON.stringify({ key, value }),
  }, token)
}

export function deleteRecord(token: string, key: string): Promise<void> {
  return request<void>(`/storage?key=${encodeURIComponent(key)}`, {
    method: 'DELETE',
  }, token)
}

export function clearRecords(token: string): Promise<void> {
  return request<void>('/storage/all', { method: 'DELETE' }, token)
}
