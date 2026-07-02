export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

// Returns day of week: 0=Sun, 1=Mon ... 6=Sat
export function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay()
}

export function formatDate(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}

export function todayStr(): string {
  const now = new Date()
  return formatDate(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

export function formatMonthLabel(year: number, month: number): string {
  return `${year}年${month}月`
}

export const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

export interface CalendarDay {
  date: string
  day: number
  isCurrentMonth: boolean
  isToday: boolean
}
