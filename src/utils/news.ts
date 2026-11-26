export interface NewsItem {
  id: string
  title: string
  url: string
  source: string
  sourceKind: string
  summary: string
  publishedAt: string | null
}

export interface NewsSourceResult {
  id: string
  name: string
  kind: string
  items: NewsItem[]
  errors: string[]
}

export interface NewsResponse {
  updatedAt: string
  sources: Record<string, NewsSourceResult>
}

export interface NewsTabConfig {
  id: string
  name: string
  categoryId: NewsCategoryId
  sourceIds: string[]
}

export interface NewsWidgetConfig {
  tabs: NewsTabConfig[]
  activeTabId: string
}

export interface NewsSourceOption {
  id: string
  name: string
  categoryId: NewsCategoryId
  description: string
  requiresRssHub?: boolean
}

export type NewsCategoryId = 'ai' | 'shenzhen' | 'games' | 'film'

export const NEWS_CATEGORIES: Array<{
  id: NewsCategoryId
  name: string
  description: string
}> = [
  { id: 'ai', name: 'AI / 科技', description: '人工智能、科技产业和新产品' },
  { id: 'shenzhen', name: '深圳本地', description: '深圳政策、资金、项目与本地新闻' },
  { id: 'games', name: '游戏', description: '游戏资讯、折扣与限免活动' },
  { id: 'film', name: '影视', description: '电影、电视剧、热映与票房' },
]

export const NEWS_SOURCES: NewsSourceOption[] = [
  {
    id: 'qbitai',
    name: '量子位',
    categoryId: 'ai',
    description: 'AI 资讯与大模型动态',
  },
  {
    id: 'ithome',
    name: 'IT之家',
    categoryId: 'ai',
    description: '科技与 AI 产品新闻',
  },
  {
    id: 'ifanr',
    name: '爱范儿',
    categoryId: 'ai',
    description: '消费科技与智能产品',
  },
  {
    id: 'tmtpost',
    name: '钛媒体',
    categoryId: 'ai',
    description: '科技产业、公司与商业模式',
  },
  {
    id: 'leiphone',
    name: '雷峰网',
    categoryId: 'ai',
    description: '人工智能与前沿科技',
  },
  {
    id: 'geekpark',
    name: '极客公园',
    categoryId: 'ai',
    description: '科技趋势与行业动态',
  },
  {
    id: '36kr',
    name: '36氪',
    categoryId: 'ai',
    description: 'AI 商业、公司与融资资讯',
    requiresRssHub: true,
  },
  {
    id: 'shenzhen-gov',
    name: '深圳市政府',
    categoryId: 'shenzhen',
    description: '市政府通知公告',
  },
  {
    id: 'shenzhen-gov-procurement',
    name: '深圳政府采购',
    categoryId: 'shenzhen',
    description: '政府采购目录与项目',
  },
  {
    id: 'shenzhen-gov-funding',
    name: '深圳财政资金',
    categoryId: 'shenzhen',
    description: '财政预决算与资金信息',
  },
  {
    id: 'shenzhen-gov-projects',
    name: '深圳重大项目',
    categoryId: 'shenzhen',
    description: '重大项目进展与公示',
  },
  {
    id: 'shenzhen-news',
    name: '深圳新闻网',
    categoryId: 'shenzhen',
    description: '深圳本地焦点新闻',
  },
  {
    id: 'bendibao',
    name: '深圳本地宝',
    categoryId: 'shenzhen',
    description: '交通、生活与本地活动',
    requiresRssHub: true,
  },
  {
    id: 'yystv',
    name: '游研社',
    categoryId: 'games',
    description: '游戏文化与行业资讯',
  },
  {
    id: 'gamelook',
    name: 'GameLook',
    categoryId: 'games',
    description: '游戏产业与市场动态',
  },
  {
    id: 'steam-deals',
    name: 'Steam 特惠',
    categoryId: 'games',
    description: 'Steam 当前折扣游戏',
  },
  {
    id: 'epic-free',
    name: 'Epic 喜加一',
    categoryId: 'games',
    description: 'Epic 限免与即将免费',
  },
  {
    id: '3dm',
    name: '3DM',
    categoryId: 'games',
    description: '游戏新闻与推荐',
    requiresRssHub: true,
  },
  {
    id: 'gamersky',
    name: '游民星空',
    categoryId: 'games',
    description: '游戏与业界资讯',
    requiresRssHub: true,
  },
  {
    id: '1905',
    name: '1905电影网',
    categoryId: 'film',
    description: '电影新闻、定档与首映',
  },
  {
    id: 'mtime',
    name: '时光网',
    categoryId: 'film',
    description: '电影资讯与行业动态',
  },
  {
    id: 'maoyan-hot',
    name: '猫眼热映',
    categoryId: 'film',
    description: '正在热映电影与评分',
    requiresRssHub: true,
  },
  {
    id: 'maoyan-box',
    name: '猫眼票房',
    categoryId: 'film',
    description: '实时票房与市场数据',
    requiresRssHub: true,
  },
  {
    id: 'douban-coming',
    name: '豆瓣待映',
    categoryId: 'film',
    description: '即将上映的影片',
    requiresRssHub: true,
  },
]

const validSourceIds = new Set(NEWS_SOURCES.map(source => source.id))
const CONFIG_VERSION = 5
const configuredEndpoint = String(import.meta.env.VITE_NEWS_API_URL || '').trim()
const newsEndpoint = configuredEndpoint || '/api/news'

export function createDefaultNewsTabs(): NewsTabConfig[] {
  return [
    {
      id: 'ai',
      name: 'AI 行业',
      categoryId: 'ai',
      sourceIds: ['qbitai', 'ithome', 'ifanr', 'tmtpost'],
    },
    {
      id: 'shenzhen',
      name: '深圳本地',
      categoryId: 'shenzhen',
      sourceIds: ['shenzhen-gov', 'shenzhen-gov-projects', 'shenzhen-news'],
    },
    {
      id: 'games',
      name: '游戏',
      categoryId: 'games',
      sourceIds: ['yystv', 'steam-deals', 'epic-free'],
    },
    {
      id: 'film',
      name: '影视',
      categoryId: 'film',
      sourceIds: ['1905', 'mtime'],
    },
  ]
}

export function createNewsTabId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function isNewsItem(value: unknown): value is NewsItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<NewsItem>
  return (
    typeof item.id === 'string'
    && typeof item.title === 'string'
    && typeof item.url === 'string'
    && typeof item.source === 'string'
    && typeof item.sourceKind === 'string'
  )
}

function normalizeSourceResult(value: unknown, fallbackId: string): NewsSourceResult | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Partial<NewsSourceResult>
  return {
    id: typeof source.id === 'string' ? source.id : fallbackId,
    name: typeof source.name === 'string' ? source.name : fallbackId,
    kind: typeof source.kind === 'string' ? source.kind : 'ai',
    items: Array.isArray(source.items) ? source.items.filter(isNewsItem) : [],
    errors: Array.isArray(source.errors) ? source.errors.filter(Boolean) : [],
  }
}

function parseResponse(value: unknown): NewsResponse {
  if (!value || typeof value !== 'object') throw new Error('资讯接口返回格式异常')
  const payload = value as Partial<NewsResponse>
  if (!payload.sources || typeof payload.sources !== 'object') {
    throw new Error('资讯接口缺少来源数据')
  }
  const sources = Object.fromEntries(
    Object.entries(payload.sources)
      .map(([id, result]) => {
        const normalized = normalizeSourceResult(result, id)
        return normalized ? [id, normalized] : null
      })
      .filter((entry): entry is [string, NewsSourceResult] => entry != null),
  )

  return {
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : new Date().toISOString(),
    sources,
  }
}

function canonicalUrl(value: string) {
  try {
    const url = new URL(value)
    return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`
  } catch {
    return value
  }
}

export function mergeNewsItems(sourceIds: string[], sources: Record<string, NewsSourceResult>) {
  const unique = new Map<string, NewsItem>()
  for (const sourceId of sourceIds) {
    for (const item of sources[sourceId]?.items ?? []) {
      const key = canonicalUrl(item.url)
      const current = unique.get(key)
      if (
        !current
        || new Date(item.publishedAt || 0).getTime() > new Date(current.publishedAt || 0).getTime()
      ) {
        unique.set(key, item)
      }
    }
  }
  return [...unique.values()]
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
}

export async function fetchNews(sourceIds: string[], signal?: AbortSignal): Promise<NewsResponse> {
  const requested = [...new Set(sourceIds.filter(id => validSourceIds.has(id)))]
  if (requested.length === 0) {
    return { updatedAt: new Date().toISOString(), sources: {} }
  }

  const url = new URL(newsEndpoint, window.location.href)
  url.searchParams.set('sources', requested.join(','))
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  })

  if (!response.ok) {
    throw new Error(`资讯接口返回 ${response.status}`)
  }

  return parseResponse(await response.json())
}

function configStorageKey(widgetId?: number) {
  return `news-config${widgetId != null ? `-${widgetId}` : ''}`
}

const categoryIds = new Set(NEWS_CATEGORIES.map(category => category.id))
const sourceById = new Map(NEWS_SOURCES.map(source => [source.id, source]))

function sourcesForCategory(categoryId: NewsCategoryId) {
  return NEWS_SOURCES
    .filter(source => source.categoryId === categoryId)
    .map(source => source.id)
}

function inferCategoryId(name: string, sourceIds: string[]): NewsCategoryId {
  const normalizedName = name.toLowerCase()
  if (/(游戏|game|steam|epic|折扣|促销|喜加一)/i.test(normalizedName)) return 'games'
  if (/(影视|电影|电视|票房|剧集|动漫)/i.test(normalizedName)) return 'film'
  if (/(深圳|鹏城)/i.test(normalizedName)) return 'shenzhen'
  if (/(ai|人工智能|科技|模型|芯片)/i.test(normalizedName)) return 'ai'

  const counts: Record<NewsCategoryId, number> = {
    ai: 0,
    shenzhen: 0,
    games: 0,
    film: 0,
  }
  for (const sourceId of sourceIds) {
    const categoryId = sourceById.get(sourceId)?.categoryId
    if (categoryId) counts[categoryId] += 1
  }
  return (Object.entries(counts) as Array<[NewsCategoryId, number]>)
    .sort((a, b) => b[1] - a[1])[0][0]
}

function sanitizeTabs(value: unknown, savedVersion = CONFIG_VERSION): NewsTabConfig[] {
  if (!Array.isArray(value)) return []
  const usedIds = new Set<string>()
  return value
    .map((candidate): NewsTabConfig | null => {
      if (!candidate || typeof candidate !== 'object') return null
      const tab = candidate as Partial<NewsTabConfig>
      const name = typeof tab.name === 'string' ? tab.name.trim().slice(0, 16) : ''
      const rawSourceIds = Array.isArray(tab.sourceIds) ? tab.sourceIds : []
      const validIds = [...new Set(
        rawSourceIds.filter((id): id is string => typeof id === 'string' && validSourceIds.has(id)),
      )]
      if (!name) return null
      const categoryId = categoryIds.has(tab.categoryId as NewsCategoryId)
        ? tab.categoryId as NewsCategoryId
        : inferCategoryId(name, validIds)
      let sourceIds = validIds.filter(id => sourceById.get(id)?.categoryId === categoryId)
      if (sourceIds.length === 0 && savedVersion < 3) {
        sourceIds = sourcesForCategory(categoryId).slice(0, 4)
      }
      if (!name || sourceIds.length === 0) return null
      let id = typeof tab.id === 'string' && tab.id ? tab.id : createNewsTabId()
      while (usedIds.has(id)) id = createNewsTabId()
      usedIds.add(id)
      return { id, name, categoryId, sourceIds }
    })
    .filter((tab): tab is NewsTabConfig => tab != null)
}

export function readNewsConfig(widgetId?: number): NewsWidgetConfig {
  try {
    const saved = JSON.parse(localStorage.getItem(configStorageKey(widgetId)) || 'null')
    if (typeof saved?.version === 'number' && saved.version <= CONFIG_VERSION) {
      const tabs = sanitizeTabs(saved.tabs, saved.version)
      if (saved.version < 5 && !tabs.some(tab => tab.categoryId === 'film')) {
        tabs.push({
          id: tabs.some(tab => tab.id === 'film') ? createNewsTabId() : 'film',
          name: '影视',
          categoryId: 'film',
          sourceIds: ['1905', 'mtime'],
        })
      }
      if (tabs.length > 0) {
        const activeTabId = tabs.some(tab => tab.id === saved.activeTabId)
          ? saved.activeTabId
          : tabs[0].id
        localStorage.setItem(configStorageKey(widgetId), JSON.stringify({
          version: CONFIG_VERSION,
          tabs,
          activeTabId,
        }))
        return { tabs, activeTabId }
      }
    }
  } catch {
    // Invalid local data falls back to the default topic set.
  }

  const tabs = createDefaultNewsTabs()
  return { tabs, activeTabId: tabs[0].id }
}

export function writeNewsConfig(widgetId: number | undefined, config: NewsWidgetConfig) {
  localStorage.setItem(configStorageKey(widgetId), JSON.stringify({
    version: CONFIG_VERSION,
    tabs: config.tabs,
    activeTabId: config.activeTabId,
  }))
}

export function normalizeNewsTabs(tabs: NewsTabConfig[]) {
  return sanitizeTabs(tabs)
}
