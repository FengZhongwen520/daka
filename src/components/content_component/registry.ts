export interface WidgetDef {
  type: string
  name: string
  icon: string
  desc: string
  defaultPos: { x: number; y: number }
  cloudOnly?: boolean
}

export const WIDGETS: WidgetDef[] = [
  // 导航与信息
  { type: 'bookmarks', name: '自建收藏夹', icon: '📑', desc: '手动添加常用网站', defaultPos: { x: 100, y: 100 } },
  { type: 'bookmarks-import', name: '书签导入', icon: '📥', desc: '导入浏览器收藏夹文件', defaultPos: { x: 120, y: 120 } },
  { type: 'weather', name: '天气', icon: '🌤', desc: '实时天气 + 桌面特效', defaultPos: { x: 40, y: 440 } },
  { type: 'news', name: '资讯雷达', icon: '📡', desc: 'AI / 深圳 / 游戏 / 影视', defaultPos: { x: 720, y: 160 } },
  { type: 'clock', name: '时钟', icon: '🕐', desc: '数字 / 钟表双模式', defaultPos: { x: 700, y: 80 } },
  // 效率工具
  { type: 'calendar', name: '日历书', icon: '📅', desc: '3D翻页打卡日历', defaultPos: { x: 280, y: 80 } },
  { type: 'pomodoro', name: '番茄钟', icon: '🍅', desc: '云端计时 + 实时推送', defaultPos: { x: 600, y: 380 }, cloudOnly: true },
  { type: 'memo', name: '便签', icon: '📝', desc: '可拖拽文字便签', defaultPos: { x: 100, y: 100 } },
  { type: 'sticky', name: '便利贴', icon: '📌', desc: '可编辑便利贴', defaultPos: { x: 80, y: 12 } },
  { type: 'todo', name: '待办', icon: '✅', desc: '清单 · 待办/进行中/完成', defaultPos: { x: 340, y: 140 } },
  { type: 'diary', name: '日记', icon: '📔', desc: '心情 · 标签 · 往年今日', defaultPos: { x: 440, y: 180 } },
  { type: 'calculator', name: '计算器', icon: '🔢', desc: '实时计算 + 历史记录', defaultPos: { x: 500, y: 100 } },
  { type: 'searchengine', name: '搜索引擎', icon: '🔎', desc: '多引擎搜索', defaultPos: { x: 420, y: 280 } },
  { type: 'translate', name: '翻译', icon: '🌐', desc: '中英互译', defaultPos: { x: 520, y: 200 } },
  // 健康生活
  { type: 'water', name: '饮水追踪', icon: '💧', desc: '云端每日饮水记录', defaultPos: { x: 800, y: 400 }, cloudOnly: true },
  { type: 'whitenoise', name: '白噪音', icon: '📻', desc: '6种环境音效', defaultPos: { x: 20, y: 280 } },
  // 装饰
  { type: 'photoframe', name: '照片框', icon: '🖼', desc: '照片卡片展示', defaultPos: { x: 60, y: 200 } },
  { type: 'fan', name: '电风扇', icon: '🌀', desc: '3档调速桌面风扇', defaultPos: { x: 600, y: 120 } },
]

export const DEFAULT_WIDGETS = ['calendar', 'sticky', 'photoframe', 'weather', 'news']
