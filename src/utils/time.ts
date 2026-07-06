/**
 * 相对时间格式化
 * - 60 秒内 → "刚刚"
 * - 60 分钟内 → "N分钟前"
 * - 24 小时内 → "N小时前"
 * - 超过 24 小时 → "N天前"
 */
export function formatTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return Math.floor(diff / 60_000) + '分钟前'
  if (diff < 86400_000) return Math.floor(diff / 3600_000) + '小时前'
  return Math.floor(diff / 86400_000) + '天前'
}
