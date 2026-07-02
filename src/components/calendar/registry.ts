export interface WidgetDef {
  type: string
  name: string
  icon: string
  desc: string
  defaultPos: { x: number; y: number }
}

export const WIDGETS: WidgetDef[] = [
  { type: 'calendar', name: '日历书', icon: '📅', desc: '3D翻页打卡日历', defaultPos: { x: 280, y: 80 } },
  { type: 'sticky', name: '便利贴', icon: '📌', desc: '本月打卡统计', defaultPos: { x: 80, y: 12 } },
  { type: 'photoframe', name: '照片框', icon: '🖼', desc: '照片卡片展示', defaultPos: { x: 60, y: 200 } },
  { type: 'weather', name: '天气', icon: '🌤', desc: '实时天气 + 桌面特效', defaultPos: { x: 40, y: 440 } },
  { type: 'pomodoro', name: '番茄钟', icon: '🍅', desc: '25+5倒计时', defaultPos: { x: 600, y: 380 } },
  { type: 'bookmarks', name: '收藏夹', icon: '📑', desc: '网址图标网格', defaultPos: { x: 100, y: 100 } },
  { type: 'whitenoise', name: '白噪音', icon: '📻', desc: '6种环境音效', defaultPos: { x: 20, y: 280 } },
  { type: 'water', name: '饮水追踪', icon: '💧', desc: '每日饮水记录', defaultPos: { x: 800, y: 400 } },
  { type: 'memo', name: '便签', icon: '📝', desc: '可拖拽文字便签', defaultPos: { x: 100, y: 100 } },
]

export const DEFAULT_WIDGETS = ['calendar', 'sticky', 'photoframe', 'weather']
