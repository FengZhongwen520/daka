import { ref } from 'vue'
import {
  ApiError,
  clearRecords,
  deleteRecord,
  loadRecords,
  login as loginRequest,
  logout as logoutRequest,
  putRecord,
  register as registerRequest,
  type CloudUser,
} from './api'

export type StorageMode = 'local' | 'cloud'

const MODE_KEY = 'daka.storage.mode'
const TOKEN_KEY = 'daka.serve.token'
const USER_KEY = 'daka.serve.user'
const LOCAL_PREFIX = 'daka.local:'
const LOCAL_META_PREFIXES = ['daka.storage.', 'daka.serve.']

const cloudValues = new Map<string, string>()
let sessionToken = readRaw(TOKEN_KEY)
let writeChain: Promise<void> = Promise.resolve()

export const storageMode = ref<StorageMode>(readInitialMode())
export const cloudUser = ref<CloudUser | null>(readUser())
export const storageBusy = ref(false)
export const storageError = ref('')
export const storageRevision = ref(0)

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Cloud mode still works for the current tab when metadata storage is blocked.
  }
}

function removeRaw(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Ignore restricted storage.
  }
}

function readInitialMode(): StorageMode {
  return readRaw(MODE_KEY) === 'cloud' && !!sessionToken ? 'cloud' : 'local'
}

function readUser(): CloudUser | null {
  const raw = readRaw(USER_KEY)
  if (!raw) return null
  try {
    const user = JSON.parse(raw) as Partial<CloudUser>
    return typeof user.id === 'string' && typeof user.loginId === 'string'
      ? { id: user.id, loginId: user.loginId }
      : null
  } catch {
    return null
  }
}

function setSession(token: string, user: CloudUser): void {
  sessionToken = token
  cloudUser.value = user
  writeRaw(TOKEN_KEY, token)
  writeRaw(USER_KEY, JSON.stringify(user))
}

function clearSession(): void {
  sessionToken = null
  cloudUser.value = null
  cloudValues.clear()
  removeRaw(TOKEN_KEY)
  removeRaw(USER_KEY)
}

function persistMode(mode: StorageMode): void {
  storageMode.value = mode
  writeRaw(MODE_KEY, mode)
  storageRevision.value += 1
}

function migrateLegacyLocalValues(): void {
  try {
    const keys: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (
        key
        && !key.startsWith(LOCAL_PREFIX)
        && !LOCAL_META_PREFIXES.some(prefix => key.startsWith(prefix))
      ) {
        keys.push(key)
      }
    }
    for (const key of keys) {
      const value = localStorage.getItem(key)
      if (value != null && localStorage.getItem(`${LOCAL_PREFIX}${key}`) == null) {
        localStorage.setItem(`${LOCAL_PREFIX}${key}`, value)
      }
      localStorage.removeItem(key)
    }
  } catch {
    // Reads still fall back to legacy keys if migration cannot complete.
  }
}

export async function initializeStorage(): Promise<void> {
  migrateLegacyLocalValues()
  if (storageMode.value !== 'cloud' || !sessionToken) {
    persistMode('local')
    return
  }
  await hydrateCloud()
}

async function hydrateCloud(): Promise<void> {
  if (!sessionToken) throw new ApiError('请先登录云端存储', 401)
  const records = await loadRecords(sessionToken)
  cloudValues.clear()
  for (const record of records) cloudValues.set(record.key, record.value)
}

function enqueueWrite(task: () => Promise<void>): void {
  writeChain = writeChain
    .then(task)
    .catch((reason) => {
      storageError.value = reason instanceof Error ? reason.message : '云端保存失败'
    })
}

export function getItem(key: string): string | null {
  if (storageMode.value === 'cloud') return cloudValues.get(key) ?? null
  try {
    return localStorage.getItem(`${LOCAL_PREFIX}${key}`)
      ?? localStorage.getItem(key)
  } catch {
    return null
  }
}

export function setItem(key: string, value: string): void {
  if (storageMode.value === 'cloud') {
    cloudValues.set(key, value)
    if (sessionToken) enqueueWrite(() => putRecord(sessionToken!, key, value))
    return
  }
  try {
    localStorage.setItem(`${LOCAL_PREFIX}${key}`, value)
    localStorage.removeItem(key)
  } catch {
    storageError.value = '本地存储空间不足，当前修改可能无法保存'
  }
}

export function removeItem(key: string): void {
  if (storageMode.value === 'cloud') {
    cloudValues.delete(key)
    if (sessionToken) enqueueWrite(() => deleteRecord(sessionToken!, key))
    return
  }
  try {
    localStorage.removeItem(`${LOCAL_PREFIX}${key}`)
    localStorage.removeItem(key)
  } catch {
    // Ignore restricted storage.
  }
}

export function getSessionItem(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

export function setSessionItem(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // Session-only hints do not block the feature when storage is restricted.
  }
}

export function removeSessionItem(key: string): void {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // Ignore restricted storage.
  }
}

export function getAllItems(): Record<string, string> {
  if (storageMode.value === 'cloud') {
    return Object.fromEntries(cloudValues.entries())
  }
  const values: Record<string, string> = {}
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const storageKey = localStorage.key(index)
      if (!storageKey || !storageKey.startsWith(LOCAL_PREFIX)) continue
      const appKey = storageKey.slice(LOCAL_PREFIX.length)
      const value = localStorage.getItem(storageKey)
      if (value != null) values[appKey] = value
    }
  } catch {
    // Return whatever could be read.
  }
  return values
}

export function clearItems(): void {
  if (storageMode.value === 'cloud') {
    cloudValues.clear()
    if (sessionToken) enqueueWrite(() => clearRecords(sessionToken!))
    return
  }
  try {
    const keys: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (
        key
        && !LOCAL_META_PREFIXES.some(prefix => key.startsWith(prefix))
      ) {
        keys.push(key)
      }
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    // Ignore restricted storage.
  }
}

export async function flushStorage(): Promise<void> {
  await writeChain
  if (storageError.value) throw new Error(storageError.value)
}

async function activateCloud(session: Awaited<ReturnType<typeof loginRequest>>): Promise<void> {
  storageBusy.value = true
  storageError.value = ''
  try {
    setSession(session.token, session.user)
    await hydrateCloud()
    persistMode('cloud')
  } catch (reason) {
    clearSession()
    persistMode('local')
    throw reason
  } finally {
    storageBusy.value = false
  }
}

export async function loginCloud(loginId: string, password: string): Promise<void> {
  await activateCloud(await loginRequest(loginId, password))
}

export async function registerCloud(loginId: string, password: string): Promise<void> {
  await activateCloud(await registerRequest(loginId, password))
}

export async function switchStorageMode(mode: StorageMode): Promise<void> {
  if (mode === storageMode.value) return
  if (mode === 'cloud') {
    if (!sessionToken) throw new Error('请先登录云端存储')
    storageBusy.value = true
    storageError.value = ''
    try {
      await hydrateCloud()
      persistMode('cloud')
    } finally {
      storageBusy.value = false
    }
    return
  }
  await flushStorage()
  persistMode('local')
}

export async function logoutCloud(): Promise<void> {
  await flushStorage()
  const token = sessionToken
  clearSession()
  persistMode('local')
  if (token) {
    try {
      await logoutRequest(token)
    } catch {
      // Local logout still succeeds when the server session already expired.
    }
  }
}
