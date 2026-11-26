export interface Project {
  id?: number
  name: string
  color: string
  icon: string
  createdAt: Date
}

export interface CheckIn {
  id?: number
  projectId: number
  date: string // 'YYYY-MM-DD'
  createdAt: Date
}

export interface Photo {
  id?: number
  position: 'left' | 'right'
  dataUrl: string
  createdAt: Date
}

export interface Memo {
  id?: number
  memoKey: string
  text: string
  bgColor: string
  x: number
  y: number
  width: number
  height: number
  createdAt: Date
}

export interface DiaryEntry {
  id?: number
  widgetId: number
  date: string
  title: string
  content: string
  mood: string
  tags: string[]
  createdAt: Date
  updatedAt: Date
}

export const MEMO_COLORS = ['#fff385', '#ffd4b8', '#c5f0d2', '#d4e4ff', '#f5d4ff']

export interface ExportData {
  version: number
  exportedAt: string
  projects: Project[]
  checkins: CheckIn[]
  photos: Photo[]
  memos: Memo[]
  diaryEntries?: DiaryEntry[]
  sites: any[]
  widgets: any[]
  wallpaper: any[]
  lsData?: Record<string, string>
}

export const PRESET_COLORS = [
  '#2DD4A8', '#3B82F6', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
]

export const PRESET_ICONS = [
  '🏃', '📚', '💪', '🧘', '🎸', '🎨', '✍️', '💻',
  '🏊', '🚴', '🧑‍🍳', '🌱', '💧', '☀️', '🌙', '⭐',
  '📝', '🎯', '💡', '🔥', '🎵', '📖', '✈️', '🐾',
]
