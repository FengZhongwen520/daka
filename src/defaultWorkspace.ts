export const DEFAULT_WORKSPACE_PROJECT = {
  name: '默认项目',
  color: '#2DD4A8',
  icon: '🏠',
} as const

export interface DefaultWidgetPlacement {
  type: string
  x: number
  y: number
}

export const DEFAULT_WORKSPACE_WIDGETS: DefaultWidgetPlacement[] = [
  { type: 'weather', x: 24, y: 24 },
  { type: 'todo', x: 288, y: 24 },
  { type: 'searchengine', x: 552, y: 24 },
  { type: 'clock', x: 896, y: 24 },
  { type: 'bookmarks', x: 24, y: 340 },
  { type: 'calendar', x: 362, y: 340 },
  { type: 'news', x: 806, y: 340 },
]
