import { createHash } from 'node:crypto'
import { setMaxListeners } from 'node:events'

const USER_AGENT = 'YechaoNewsRadar/1.0 (+personal start page)'
const SOURCE_TIMEOUT = 12_000
const AI_PATTERN = /AI|人工智能|大模型|多模态|生成式|智能体|机器学习|深度学习|算力|芯片|GPU|机器人|具身智能|英伟达|OpenAI|Anthropic|DeepSeek|豆包|通义|Kimi/i

const SOURCE_DEFINITIONS = {
  qbitai: {
    name: '量子位',
    kind: 'qbitai',
    description: 'AI 行业资讯与大模型动态',
  },
  ithome: {
    name: 'IT之家',
    kind: 'ithome',
    description: '科技与 AI 产品新闻',
  },
  ifanr: {
    name: '爱范儿',
    kind: 'ifanr',
    description: '消费科技与智能产品',
  },
  tmtpost: {
    name: '钛媒体',
    kind: 'tmtpost',
    description: '科技产业、公司与商业模式',
  },
  leiphone: {
    name: '雷峰网',
    kind: 'leiphone',
    description: '人工智能与前沿科技',
  },
  geekpark: {
    name: '极客公园',
    kind: 'geekpark',
    description: '科技趋势与行业动态',
  },
  '36kr': {
    name: '36氪',
    kind: '36kr',
    description: 'AI 商业、公司与融资资讯',
    requiresRssHub: true,
  },
  'shenzhen-gov': {
    name: '深圳市政府',
    kind: 'gov',
    description: '市政府通知公告',
  },
  'shenzhen-gov-procurement': {
    name: '深圳政府采购',
    kind: 'gov',
    description: '政府采购目录与项目',
  },
  'shenzhen-gov-funding': {
    name: '深圳财政资金',
    kind: 'gov',
    description: '财政预决算与资金信息',
  },
  'shenzhen-gov-projects': {
    name: '深圳重大项目',
    kind: 'gov',
    description: '重大项目进展与公示',
  },
  'shenzhen-news': {
    name: '深圳新闻网',
    kind: 'sznews',
    description: '深圳本地焦点新闻',
  },
  bendibao: {
    name: '深圳本地宝',
    kind: 'bendibao',
    description: '交通、生活与本地活动',
    requiresRssHub: true,
  },
  yystv: {
    name: '游研社',
    kind: 'game',
    description: '游戏文化与行业资讯',
  },
  gamelook: {
    name: 'GameLook',
    kind: 'game',
    description: '游戏产业与市场动态',
  },
  'steam-deals': {
    name: 'Steam 特惠',
    kind: 'deal',
    description: 'Steam 当前折扣游戏',
  },
  'epic-free': {
    name: 'Epic 喜加一',
    kind: 'deal',
    description: 'Epic 限免与即将免费',
  },
  '3dm': {
    name: '3DM',
    kind: 'game',
    description: '游戏新闻与推荐',
    requiresRssHub: true,
  },
  gamersky: {
    name: '游民星空',
    kind: 'game',
    description: '游戏与业界资讯',
    requiresRssHub: true,
  },
  '1905': {
    name: '1905电影网',
    kind: 'film',
    description: '电影新闻、定档与首映',
  },
  mtime: {
    name: '时光网',
    kind: 'film',
    description: '电影资讯与行业动态',
  },
  'maoyan-hot': {
    name: '猫眼热映',
    kind: 'film',
    description: '正在热映电影与评分',
    requiresRssHub: true,
  },
  'maoyan-box': {
    name: '猫眼票房',
    kind: 'box',
    description: '实时票房与市场数据',
    requiresRssHub: true,
  },
  'douban-coming': {
    name: '豆瓣待映',
    kind: 'film',
    description: '即将上映的影片',
    requiresRssHub: true,
  },
}

const ALL_SOURCE_IDS = Object.keys(SOURCE_DEFINITIONS)

const FEEDS = {
  qbitai: 'https://www.qbitai.com/category/%E8%B5%84%E8%AE%AF/feed',
  ithome: 'https://www.ithome.com/rss/',
  ifanr: 'https://www.ifanr.com/feed',
  tmtpost: 'https://www.tmtpost.com/rss.xml',
  leiphone: 'https://www.leiphone.com/feed',
  geekpark: 'https://www.geekpark.net/rss',
  shenzhenGov: 'http://www.sz.gov.cn/cn/xxgk/zfxxgj/tzgg/',
  shenzhenProcurement: 'http://www.sz.gov.cn/cn/xxgk/zfxxgj/zfcg/zfcgml/',
  shenzhenFunding: 'http://www.sz.gov.cn/cn/xxgk/zfxxgj/zjxx/szfczyjs/',
  shenzhenProjects: 'http://www.sz.gov.cn/cn/xxgk/zfxxgj/zdxm/',
  yystv: 'https://www.yystv.cn/rss/feed',
  gamelook: 'http://www.gamelook.com.cn/',
  steamDeals: 'https://store.steampowered.com/api/featuredcategories?cc=cn&l=schinese',
  epicFree: 'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=zh-CN&country=CN&allowCountries=CN',
  news1905: 'https://www.1905.com/news/',
  mtimeNews: 'https://news.mtime.com/',
}
const FRESH_WINDOW_MS = 30 * 86_400_000

function decodeEntities(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
}

function plainText(value = '') {
  return decodeEntities(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractTag(block, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i'))
  return match ? plainText(match[1]) : ''
}

function normalizeUrl(value, base) {
  try {
    const url = new URL(decodeEntities(value), base)
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|spm|from|source|track|share)/i.test(key)) url.searchParams.delete(key)
    }
    if (url.hostname === 'www.sznews.com' || url.hostname.endsWith('.sznews.com')) {
      url.protocol = 'https:'
    }
    return url.href
  } catch {
    return ''
  }
}

function canonicalKey(value) {
  try {
    const url = new URL(value)
    return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`
  } catch {
    return value
  }
}

function makeId(value) {
  return createHash('sha1').update(value).digest('hex').slice(0, 16)
}

function normalizeDate(value, fallback = null) {
  if (!value) return fallback
  const text = String(value).trim()
  const localDate = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/)
  const parsed = localDate
    ? new Date(`${localDate[1]}-${localDate[2].padStart(2, '0')}-${localDate[3].padStart(2, '0')}T00:00:00+08:00`)
    : new Date(text)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString()
}

async function fetchText(url, { signal, timeout = SOURCE_TIMEOUT } = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(new Error('source timeout')), timeout)
  const abort = () => controller.abort(new Error('request aborted'))
  signal?.addEventListener('abort', abort, { once: true })

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/json, text/html;q=0.9, */*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6',
        'User-Agent': USER_AGENT,
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    return await response.text()
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', abort)
  }
}

function parseRss(xml, source) {
  const blocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(match => match[1])
  return blocks
    .map((block) => {
      const title = extractTag(block, 'title')
      const link = normalizeUrl(extractTag(block, 'link'), source.feed)
      if (!title || !link) return null
      const description = extractTag(block, 'description')
      return {
        id: makeId(`${source.kind}:${canonicalKey(link)}`),
        title,
        url: link,
        source: source.name,
        sourceKind: source.kind,
        summary: description.slice(0, 800),
        publishedAt: normalizeDate(extractTag(block, 'pubDate')),
      }
    })
    .filter(Boolean)
}

async function fetchRss(feed, source, signal, filter) {
  const xml = await fetchText(feed, { signal })
  const items = parseRss(xml, source)
  const filtered = filter ? items.filter(item => filter.test(`${item.title} ${item.summary}`)) : items
  return mergeItems(filtered)
}

async function fetchQbitai(signal) {
  const source = SOURCE_DEFINITIONS.qbitai
  return {
    items: await fetchRss(
      FEEDS.qbitai,
      { ...source, feed: FEEDS.qbitai },
      signal,
    ),
    errors: [],
  }
}

async function fetchIthome(signal) {
  return {
    items: await fetchRss(
      FEEDS.ithome,
      { ...SOURCE_DEFINITIONS.ithome, feed: FEEDS.ithome },
      signal,
      AI_PATTERN,
    ),
    errors: [],
  }
}

async function fetchFilteredRss(sourceId, signal) {
  const source = SOURCE_DEFINITIONS[sourceId]
  return {
    items: await fetchRss(
      FEEDS[sourceId],
      { ...source, feed: FEEDS[sourceId] },
      signal,
      AI_PATTERN,
    ),
    errors: [],
  }
}

async function fetchGovernmentList(sourceId, page, signal) {
  const source = { ...SOURCE_DEFINITIONS[sourceId], feed: page }
  const html = await fetchText(source.feed, { signal })
  const items = []
  const rowPattern = /<span class="tit">\s*<a\b([^>]*)>([\s\S]*?)<\/a>\s*<\/span>\s*<span>([^<]+)<\/span>/gi

  for (const match of html.matchAll(rowPattern)) {
    const attributes = match[1]
    const href = attributes.match(/\bhref="([^"]+)"/i)?.[1]
    const titleAttribute = attributes.match(/\btitle="([^"]+)"/i)?.[1]
    const link = normalizeUrl(href || '', source.feed)
    const title = plainText(titleAttribute || match[2])
    if (!title || !link) continue
    const dateText = plainText(match[3])
    items.push({
      id: makeId(`${source.kind}:${canonicalKey(link)}`),
      title,
      url: link,
      source: source.name,
      sourceKind: source.kind,
      summary: '',
      publishedAt: normalizeDate(dateText),
    })
  }

  return { items: mergeItems(items, 40, 730 * 86_400_000), errors: [] }
}

function shanghaiDate(offsetDays = 0) {
  const shifted = new Date(Date.now() + offsetDays * 86_400_000)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(shifted)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

async function fetchShenzhenNews(signal) {
  const source = SOURCE_DEFINITIONS['shenzhen-news']
  let payload = null
  let lastError = null

  for (const offset of [0, -1]) {
    const date = shanghaiDate(offset)
    try {
      const text = await fetchText(`https://www.sznews.com/ranking/${date}.json`, { signal })
      payload = JSON.parse(text)
      break
    } catch (error) {
      lastError = error
    }
  }

  if (!payload) throw lastError || new Error('深圳新闻网没有返回数据')
  const rows = Array.isArray(payload) ? payload : payload.data
  if (!Array.isArray(rows)) throw new Error('深圳新闻网数据格式异常')

  const items = rows
    .map((row) => {
      const title = plainText(row.TITLE)
      const link = normalizeUrl(row.URL, 'https://www.sznews.com')
      if (!title || !link) return null
      return {
        id: makeId(`${source.kind}:${canonicalKey(link)}`),
        title,
        url: link,
        source: source.name,
        sourceKind: source.kind,
        summary: '',
        publishedAt: normalizeDate(payload.create_time),
      }
    })
    .filter(Boolean)

  return { items: mergeItems(items), errors: [] }
}

async function fetchYystv(signal) {
  const source = SOURCE_DEFINITIONS.yystv
  return {
    items: await fetchRss(
      FEEDS.yystv,
      { ...source, feed: FEEDS.yystv },
      signal,
    ),
    errors: [],
  }
}

async function fetchGameLook(signal) {
  const source = SOURCE_DEFINITIONS.gamelook
  const html = await fetchText(FEEDS.gamelook, { signal })
  const seen = new Set()
  const items = []
  const linkPattern = /<a\b[^>]*href="(https?:\/\/www\.gamelook\.com\.cn\/20\d{2}\/\d{2}\/\d+\/)"[^>]*>([\s\S]*?)<\/a>/gi

  for (const match of html.matchAll(linkPattern)) {
    const link = normalizeUrl(match[1], FEEDS.gamelook)
    const title = plainText(match[2])
    if (!link || title.length < 8 || seen.has(link)) continue
    seen.add(link)
    items.push({
      id: makeId(`${source.kind}:${canonicalKey(link)}`),
      title,
      url: link,
      source: source.name,
      sourceKind: source.kind,
      summary: '',
      publishedAt: null,
    })
  }

  if (items.length === 0) throw new Error('GameLook 没有返回文章')
  return { items: mergeItems(items, 24, 90 * 86_400_000), errors: [] }
}

async function fetchSteamDeals(signal) {
  const source = SOURCE_DEFINITIONS['steam-deals']
  const text = await fetchText(FEEDS.steamDeals, { signal, timeout: 12_000 })
  const payload = JSON.parse(text)
  const rows = payload?.specials?.items
  if (!Array.isArray(rows)) throw new Error('Steam 返回格式异常')
  const price = value => `¥${(Number(value || 0) / 100).toFixed(2)}`
  const items = rows
    .filter(item => item?.discounted && item.id && item.name)
    .map((item) => {
      const link = `https://store.steampowered.com/app/${item.id}/`
      return {
        id: makeId(`${source.kind}:${item.id}`),
        title: plainText(item.name),
        url: link,
        source: source.name,
        sourceKind: source.kind,
        summary: [
          `-${Math.abs(Number(item.discount_percent || 0))}%`,
          `现价 ${price(item.final_price)}`,
          `原价 ${price(item.original_price)}`,
        ].join(' · '),
        publishedAt: new Date().toISOString(),
      }
    })

  if (items.length === 0) throw new Error('Steam 没有返回特惠商品')
  return { items: items.slice(0, 20), errors: [] }
}

function shortDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
  }).format(date)
}

async function fetchEpicFree(signal) {
  const source = SOURCE_DEFINITIONS['epic-free']
  const text = await fetchText(FEEDS.epicFree, { signal })
  const payload = JSON.parse(text)
  const elements = payload?.data?.Catalog?.searchStore?.elements
  if (!Array.isArray(elements)) throw new Error('Epic 返回格式异常')
  const now = Date.now()
  const items = []

  for (const game of elements) {
    const promotionGroups = [
      ...(game.promotions?.promotionalOffers || []),
      ...(game.promotions?.upcomingPromotionalOffers || []),
    ]
    const offers = promotionGroups.flatMap(group => group.promotionalOffers || [])
    const active = offers.find((offer) => {
      const start = new Date(offer.startDate).getTime()
      const end = new Date(offer.endDate).getTime()
      return start <= now && now < end
    })
    const upcoming = offers
      .filter(offer => new Date(offer.startDate).getTime() > now)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())[0]
    const offer = active || upcoming
    if (!offer) continue

    const slug = game.catalogNs?.mappings?.find(mapping => mapping.pageSlug)?.pageSlug
    if (!game.title || !slug) continue
    const title = active ? `限免：${plainText(game.title)}` : `即将免费：${plainText(game.title)}`
    const period = `${shortDate(offer.startDate)} - ${shortDate(offer.endDate)}`
    items.push({
      id: makeId(`${source.kind}:${slug}`),
      title,
      url: `https://store.epicgames.com/zh-CN/p/${slug}`,
      source: source.name,
      sourceKind: source.kind,
      summary: `${period} · ${plainText(game.description).slice(0, 120)}`,
      publishedAt: active ? normalizeDate(offer.startDate) : new Date().toISOString(),
    })
  }

  if (items.length === 0) throw new Error('Epic 当前没有限免活动')
  return { items: items.slice(0, 10), errors: [] }
}

async function fetch1905News(signal) {
  const source = SOURCE_DEFINITIONS['1905']
  const html = await fetchText(FEEDS.news1905, { signal })
  const items = []
  const rowPattern = /<a\b[^>]*href="(https:\/\/www\.1905\.com\/news\/(\d{8})\/\d+\.shtml)"[^>]*>([\s\S]*?)<\/a>/gi

  for (const match of html.matchAll(rowPattern)) {
    const link = normalizeUrl(match[1], FEEDS.news1905)
    const title = plainText(match[3])
    if (!link || title.length < 6) continue
    const date = match[2]
    items.push({
      id: makeId(`${source.kind}:${canonicalKey(link)}`),
      title,
      url: link,
      source: source.name,
      sourceKind: source.kind,
      summary: '',
      publishedAt: normalizeDate(
        `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00+08:00`,
      ),
    })
  }

  if (items.length === 0) throw new Error('1905 电影网没有返回新闻')
  return { items: mergeItems(items, 30, 365 * 86_400_000), errors: [] }
}

function relativeTimeToIso(value, index) {
  const text = plainText(value)
  const minutes = text.match(/(\d+)\s*分钟前/)
  const hours = text.match(/(\d+)\s*小时前/)
  const days = text.match(/(\d+)\s*天前/)
  if (/刚刚/.test(text)) return new Date().toISOString()
  if (minutes) return new Date(Date.now() - Number(minutes[1]) * 60_000).toISOString()
  if (hours) return new Date(Date.now() - Number(hours[1]) * 3_600_000).toISOString()
  if (days) return new Date(Date.now() - Number(days[1]) * 86_400_000).toISOString()
  if (/昨天/.test(text)) return new Date(Date.now() - 86_400_000).toISOString()
  return new Date(Date.now() - index * 60_000).toISOString()
}

async function fetchMtimeNews(signal) {
  const source = SOURCE_DEFINITIONS.mtime
  const html = await fetchText(FEEDS.mtimeNews, { signal })
  const items = []
  const rowPattern = /<div class="news-cont">[\s\S]*?<h4><a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h4>[\s\S]*?<p><a\b[^>]*>([\s\S]*?)<\/a><\/p>[\s\S]*?<span class="news-time">([^<]+)<\/span>/gi

  for (const [index, match] of [...html.matchAll(rowPattern)].entries()) {
    const link = normalizeUrl(match[1], FEEDS.mtimeNews)
    const title = plainText(match[2])
    if (!link || title.length < 4) continue
    items.push({
      id: makeId(`${source.kind}:${canonicalKey(link)}`),
      title,
      url: link,
      source: source.name,
      sourceKind: source.kind,
      summary: plainText(match[3]).slice(0, 300),
      publishedAt: relativeTimeToIso(match[4], index),
    })
  }

  if (items.length === 0) throw new Error('时光网没有返回新闻')
  return { items: mergeItems(items, 30, 365 * 86_400_000), errors: [] }
}

function rssHubUrl(route) {
  const base = String(process.env.RSSHUB_BASE_URL || '').trim()
  if (!base) return ''
  const url = new URL(route, base.endsWith('/') ? base : `${base}/`)
  url.searchParams.set('format', 'rss')
  url.searchParams.set('limit', '20')
  return url.href
}

async function fetchRssHubSource(sourceId, route, signal, filter) {
  const source = SOURCE_DEFINITIONS[sourceId]
  const feed = rssHubUrl(route)
  if (!feed) {
    return { items: [], errors: ['未配置 RSSHub'] }
  }
  return {
    items: await fetchRss(feed, { ...source, feed }, signal, filter),
    errors: [],
  }
}

const SOURCE_LOADERS = {
  qbitai: fetchQbitai,
  ithome: fetchIthome,
  ifanr: signal => fetchFilteredRss('ifanr', signal),
  tmtpost: signal => fetchFilteredRss('tmtpost', signal),
  leiphone: signal => fetchFilteredRss('leiphone', signal),
  geekpark: signal => fetchFilteredRss('geekpark', signal),
  '36kr': signal => fetchRssHubSource(
    '36kr',
    '36kr/search/articles/人工智能',
    signal,
    AI_PATTERN,
  ),
  'shenzhen-gov': signal => fetchGovernmentList(
    'shenzhen-gov',
    FEEDS.shenzhenGov,
    signal,
  ),
  'shenzhen-gov-procurement': signal => fetchGovernmentList(
    'shenzhen-gov-procurement',
    FEEDS.shenzhenProcurement,
    signal,
  ),
  'shenzhen-gov-funding': signal => fetchGovernmentList(
    'shenzhen-gov-funding',
    FEEDS.shenzhenFunding,
    signal,
  ),
  'shenzhen-gov-projects': signal => fetchGovernmentList(
    'shenzhen-gov-projects',
    FEEDS.shenzhenProjects,
    signal,
  ),
  'shenzhen-news': fetchShenzhenNews,
  bendibao: signal => fetchRssHubSource('bendibao', 'bendibao/news/sz', signal),
  yystv: fetchYystv,
  gamelook: fetchGameLook,
  'steam-deals': fetchSteamDeals,
  'epic-free': fetchEpicFree,
  '3dm': signal => fetchRssHubSource('3dm', '3dmgame/news', signal),
  gamersky: signal => fetchRssHubSource('gamersky', 'gamersky/news/pc', signal),
  '1905': fetch1905News,
  mtime: fetchMtimeNews,
  'maoyan-hot': signal => fetchRssHubSource('maoyan-hot', 'maoyan/hot', signal),
  'maoyan-box': signal => fetchRssHubSource('maoyan-box', 'maoyan/box', signal),
  'douban-coming': signal => fetchRssHubSource(
    'douban-coming',
    'douban/movie/coming',
    signal,
  ),
}

function mergeItems(items, limit = 40, maxAge = FRESH_WINDOW_MS) {
  const unique = new Map()
  for (const item of items) {
    const publishedAt = new Date(item.publishedAt || 0).getTime()
    if (maxAge > 0 && publishedAt > 0 && Date.now() - publishedAt > maxAge) continue
    const key = `${item.sourceKind}:${item.title.replace(/\s+/g, '').slice(0, 100)}`
    const current = unique.get(key)
    if (!current || new Date(item.publishedAt || 0) > new Date(current.publishedAt || 0)) {
      unique.set(key, item)
    }
  }
  return [...unique.values()]
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
    .slice(0, limit)
}

function normalizeSourceIds(values) {
  const requested = Array.isArray(values) ? values : []
  const valid = requested.filter(id => Object.hasOwn(SOURCE_DEFINITIONS, id))
  return valid.length > 0 ? [...new Set(valid)] : ALL_SOURCE_IDS
}

async function loadSource(sourceId, signal) {
  const definition = SOURCE_DEFINITIONS[sourceId]
  try {
    const result = await SOURCE_LOADERS[sourceId](signal)
    return {
      id: sourceId,
      name: definition.name,
      kind: definition.kind,
      items: result.items,
      errors: [...new Set(result.errors || [])],
    }
  } catch (error) {
    if (signal?.aborted) throw error
    console.warn(`[news] ${definition.name}: ${error instanceof Error ? error.message : String(error)}`)
    return {
      id: sourceId,
      name: definition.name,
      kind: definition.kind,
      items: [],
      errors: [`${definition.name}暂时不可用`],
    }
  }
}

export async function collectNews(sourceIds, signal) {
  const requested = normalizeSourceIds(sourceIds)
  if (signal) setMaxListeners(requested.length + 2, signal)
  const results = new Array(requested.length)
  let nextIndex = 0
  const worker = async () => {
    while (nextIndex < requested.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await loadSource(requested[index], signal)
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(4, requested.length) },
      () => worker(),
    ),
  )
  return {
    updatedAt: new Date().toISOString(),
    sources: Object.fromEntries(results.map(result => [result.id, result])),
  }
}

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.end(JSON.stringify(body))
}

export async function handleNewsRequest(req, res) {
  if (req.method === 'OPTIONS') {
    json(res, 204, {})
    return
  }

  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' })
    return
  }

  const url = new URL(req.url || '/', 'http://localhost')
  if (url.pathname === '/api/health') {
    json(res, 200, { ok: true })
    return
  }
  if (url.pathname !== '/api/news') {
    json(res, 404, { error: 'Not found' })
    return
  }

  const controller = new AbortController()
  const abort = () => controller.abort(new Error('client disconnected'))
  req.once('aborted', abort)
  res.once('close', () => {
    if (!res.writableEnded) abort()
  })

  try {
    const sourceIds = (url.searchParams.get('sources') || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
    const payload = await collectNews(sourceIds, controller.signal)
    if (!res.writableEnded && !controller.signal.aborted) json(res, 200, payload)
  } catch (error) {
    if (controller.signal.aborted || res.writableEnded) return
    console.error('[news]', error)
    json(res, 502, {
      error: '资讯来源暂时不可用',
      detail: error instanceof Error ? error.message : String(error),
    })
  } finally {
    req.removeListener('aborted', abort)
  }
}
