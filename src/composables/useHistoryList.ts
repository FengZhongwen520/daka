import { shallowRef } from 'vue'

/**
 * 历史记录管理 composable
 * - 自动从 localStorage 加载
 * - addRecord 自动去重 + 上限截断 + 持久化
 * - deleteRecord / clearHistory
 */
export function useHistoryList<T>(
  storageKey: string,
  dedupKeyFn: (item: T) => string,
  maxSize = 20,
) {
  const history = shallowRef<T[]>([])

  // Load
  const saved = localStorage.getItem(storageKey)
  if (saved) {
    try { history.value = JSON.parse(saved) } catch { /* ignore */ }
  }

  function persist() {
    localStorage.setItem(storageKey, JSON.stringify(history.value))
  }

  function addRecord(item: T) {
    history.value.unshift(item)
    // Deduplicate
    const seen = new Set<string>()
    const deduped: T[] = []
    for (const h of history.value) {
      const key = dedupKeyFn(h)
      if (!seen.has(key)) { seen.add(key); deduped.push(h) }
    }
    history.value = deduped.slice(0, maxSize)
    persist()
  }

  function deleteRecord(index: number) {
    history.value.splice(index, 1)
    persist()
  }

  function clearHistory() {
    history.value = []
    persist()
  }

  return { history, addRecord, deleteRecord, clearHistory }
}
