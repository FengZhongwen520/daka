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
  { type: 'weather', x: 16, y: 6 },
  { type: 'todo', x: 16, y: 302 },
  { type: 'diary', x: 272, y: 6 },
  { type: 'calculator', x: 272, y: 430 },
  { type: 'searchengine', x: 628, y: 6 },
  { type: 'translate', x: 628, y: 201 },
  { type: 'photoframe', x: 628, y: 479 },
  { type: 'bookmarks', x: 958, y: 6 },
  { type: 'news', x: 958, y: 242 },
]

export const DEFAULT_TODO_GROUPS = [
  { id: 1, title: '工作安排', collapsed: false },
  { id: 2, title: '生活记录', collapsed: false },
]

export const DEFAULT_TODO_ITEMS = [
  { id: 1, text: '查看今天的行业资讯', status: 'todo', groupId: 1 },
  { id: 2, text: '安排一个番茄钟专注时段', status: 'doing', groupId: 1 },
  { id: 3, text: '写一条今日日记', status: 'todo', groupId: 2 },
  { id: 4, text: '整理常用网站', status: 'done', groupId: 2 },
]

export const DEFAULT_BOOKMARK_SITES = [
  { title: '语雀', url: 'https://www.yuque.com/' },
  { title: 'GPT', url: 'https://chatgpt.com/' },
  { title: 'GitHub', url: 'https://github.com/' },
]
