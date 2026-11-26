<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import {
  NEWS_CATEGORIES,
  NEWS_SOURCES,
  createNewsTabId,
  fetchNews,
  mergeNewsItems,
  normalizeNewsTabs,
  readNewsConfig,
  writeNewsConfig,
  type NewsCategoryId,
  type NewsResponse,
  type NewsTabConfig,
} from '../../utils/news'
import DragBar from '../common/DragBar.vue'
import UiDialog from '../common/UiDialog.vue'

const REFRESH_INTERVAL = 5 * 60 * 1000
const RESIZE_STEP = 8
const MIN_WIDTH = 300
const MIN_HEIGHT = 320
const MAX_WIDTH = 760
const MAX_HEIGHT = 760

const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()
const posKey = `news-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const { x, y, onDragStart } = useWidgetDrag(props, posKey, 720, 160)

const initialConfig = readNewsConfig(props.widgetId)
const tabs = ref<NewsTabConfig[]>(initialConfig.tabs)
const activeTabId = ref(initialConfig.activeTabId)
const payload = ref<NewsResponse | null>(null)
const loading = ref(false)
const refreshing = ref(false)
const error = ref('')
const lastLocalUpdate = ref<Date | null>(null)
const configOpen = ref(false)
const configDraft = ref<NewsTabConfig[]>([])
const configActiveId = ref('')
const readStateKey = `news-read-${props.widgetId ?? 'default'}`
const summaryTooltip = ref<{
  visible: boolean
  text: string
  left: number
  top: number
  placement: 'above' | 'below'
} | null>(null)

function readReadState(): Record<string, string[]> {
  try {
    const value = JSON.parse(localStorage.getItem(readStateKey) || '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, ids]) => Array.isArray(ids))
        .map(([tabId, ids]) => [
          tabId,
          (ids as string[]).filter(id => typeof id === 'string').slice(-1000),
        ]),
    )
  } catch {
    return {}
  }
}

const readIdsByTab = ref<Record<string, string[]>>(readReadState())

let mounted = false
let pollTimer: ReturnType<typeof setInterval> | null = null
let activeRequest: AbortController | null = null
let summaryTooltipTimer: ReturnType<typeof setTimeout> | null = null

const activeTab = computed(() => (
  tabs.value.find(tab => tab.id === activeTabId.value) || tabs.value[0]
))
const requestedSourceIds = computed(() => [
  ...new Set(tabs.value.flatMap(tab => tab.sourceIds)),
])
const activeSourceResults = computed(() => (
  activeTab.value?.sourceIds
    .map(sourceId => payload.value?.sources[sourceId])
    .filter(result => result != null) ?? []
))
const items = computed(() => (
  activeTab.value
    ? tabItems(activeTab.value).slice(0, 40)
    : []
))
const unreadCounts = computed<Record<string, number>>(() => (
  Object.fromEntries(
    tabs.value.map((tab) => {
      const readIds = new Set(readIdsByTab.value[tab.id] || [])
      return [tab.id, tabItems(tab).filter(item => !readIds.has(item.id)).length]
    }),
  )
))
const activeUnreadCount = computed(() => (
  unreadCounts.value[activeTab.value?.id ?? ''] ?? 0
))
const sourceErrors = computed(() => [
  ...new Set(activeSourceResults.value.flatMap(result => result.errors)),
])
const hasPartialFailure = computed(() => sourceErrors.value.length > 0)
const displayError = computed(() => error.value || sourceErrors.value[0] || '')
const lastUpdatedText = computed(() => {
  if (!lastLocalUpdate.value) return '等待首次更新'
  return `${lastLocalUpdate.value.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })} 更新`
})
const selectedSourceNames = computed(() => (
  activeTab.value?.sourceIds
    .map(sourceId => NEWS_SOURCES.find(source => source.id === sourceId)?.name)
    .filter(Boolean)
    .join(' · ') || '未选择来源'
))
const configTab = computed(() => (
  configDraft.value.find(tab => tab.id === configActiveId.value) || configDraft.value[0]
))
const configCategory = computed(() => (
  NEWS_CATEGORIES.find(category => category.id === configTab.value?.categoryId)
  || NEWS_CATEGORIES[0]
))
const configCategorySources = computed(() => (
  NEWS_SOURCES.filter(source => source.categoryId === configTab.value?.categoryId)
))
const configInvalidHint = computed(() => {
  if (configDraft.value.length === 0) return '至少保留一个 tab'
  if (configDraft.value.some(tab => !tab.name.trim())) return '每个 tab 都需要填写名称'
  if (configDraft.value.some(tab => tab.sourceIds.length === 0)) {
    return '每个 tab 至少选择一个来源'
  }
  return ''
})
const configValid = computed(() => configInvalidHint.value === '')

function clearPollTimer() {
  if (pollTimer != null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function hideSummaryTooltip() {
  if (summaryTooltipTimer != null) {
    clearTimeout(summaryTooltipTimer)
    summaryTooltipTimer = null
  }
  if (summaryTooltip.value) summaryTooltip.value.visible = false
}

function showSummaryTooltip(event: Event, text: string) {
  hideSummaryTooltip()
  if (!text.trim()) return
  const row = event.currentTarget as HTMLElement
  const summary = row.querySelector<HTMLElement>('.news-summary')
  if (!summary) return

  summaryTooltipTimer = setTimeout(() => {
    if (
      !summary.isConnected
      || summary.scrollHeight <= summary.clientHeight + 1
    ) return
    const rect = summary.getBoundingClientRect()
    const maxWidth = Math.min(460, window.innerWidth - 24)
    const left = Math.min(
      Math.max(12, rect.left),
      window.innerWidth - maxWidth - 12,
    )
    const placement = rect.top > window.innerHeight * 0.58 ? 'above' : 'below'
    summaryTooltip.value = {
      visible: true,
      text: text.trim(),
      left,
      top: placement === 'above' ? rect.top - 8 : rect.bottom + 8,
      placement,
    }
  }, 750)
}

function cancelRequest() {
  activeRequest?.abort()
  activeRequest = null
  refreshing.value = false
}

function persistReadState() {
  localStorage.setItem(readStateKey, JSON.stringify(readIdsByTab.value))
}

function tabItems(tab: NewsTabConfig) {
  return mergeNewsItems(tab.sourceIds, payload.value?.sources ?? {})
}

function tabUnreadCount(tab: NewsTabConfig) {
  return unreadCounts.value[tab.id] ?? 0
}

function markTabRead(tab: NewsTabConfig) {
  if (!payload.value) return
  const previous = readIdsByTab.value[tab.id] || []
  readIdsByTab.value = {
    ...readIdsByTab.value,
    [tab.id]: [...new Set([...previous, ...tabItems(tab).map(item => item.id)])].slice(-1000),
  }
  persistReadState()
}

function markItemRead(itemId: string) {
  const tab = activeTab.value
  if (!tab) return
  const previous = readIdsByTab.value[tab.id] || []
  readIdsByTab.value = {
    ...readIdsByTab.value,
    [tab.id]: [...new Set([...previous, itemId])].slice(-1000),
  }
  persistReadState()
}

function stopPolling() {
  clearPollTimer()
  cancelRequest()
}

function pageIsHidden() {
  return document.visibilityState === 'hidden'
}

async function refreshNews() {
  if (!mounted || pageIsHidden()) return
  const sourceIds = requestedSourceIds.value
  if (sourceIds.length === 0) return

  activeRequest?.abort()
  const controller = new AbortController()
  activeRequest = controller
  refreshing.value = true
  loading.value = payload.value == null
  error.value = ''

  try {
    const next = await fetchNews(sourceIds, controller.signal)
    if (
      !mounted
      || controller.signal.aborted
      || pageIsHidden()
    ) return

    payload.value = next
    lastLocalUpdate.value = new Date()
  } catch (reason) {
    if (
      !mounted
      || controller.signal.aborted
      || pageIsHidden()
    ) return
    error.value = reason instanceof Error ? reason.message : '资讯暂时无法更新'
  } finally {
    if (activeRequest === controller) {
      activeRequest = null
      refreshing.value = false
      loading.value = false
    }
  }
}

function beginVisibleCycle() {
  clearPollTimer()
  if (!mounted || pageIsHidden()) return
  void refreshNews()
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void refreshNews()
  }, REFRESH_INTERVAL)
}

function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    stopPolling()
  } else {
    beginVisibleCycle()
  }
}

function handlePageShow(event: PageTransitionEvent) {
  if (event.persisted && document.visibilityState === 'visible') beginVisibleCycle()
}

function selectTab(tabId: string) {
  activeTabId.value = tabId
  writeNewsConfig(props.widgetId, {
    tabs: tabs.value,
    activeTabId: tabId,
  })
}

function formatTime(value: string | null) {
  if (!value) return '最新'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '最新'
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

function sourceTone(kind: string) {
  if (kind === 'gov') return 'gov'
  if (kind === 'sznews' || kind === 'bendibao') return 'local'
  if (kind === 'game') return 'game'
  if (kind === 'deal') return 'deal'
  if (kind === 'film' || kind === 'box') return 'film'
  if (kind === '36kr' || kind === 'tmtpost') return 'business'
  if (kind === 'ithome' || kind === 'ifanr' || kind === 'leiphone' || kind === 'geekpark') {
    return 'tech'
  }
  return 'ai'
}

function openConfig() {
  configDraft.value = tabs.value.map(tab => ({
    ...tab,
    sourceIds: [...tab.sourceIds],
  }))
  configActiveId.value = activeTabId.value
  configOpen.value = true
}

function addConfigTab() {
  const tab: NewsTabConfig = {
    id: createNewsTabId(),
    name: `专题 ${configDraft.value.length + 1}`,
    categoryId: 'ai',
    sourceIds: [],
  }
  configDraft.value.push(tab)
  configActiveId.value = tab.id
}

function removeConfigTab(tabId: string) {
  if (configDraft.value.length <= 1) return
  const index = configDraft.value.findIndex(tab => tab.id === tabId)
  configDraft.value = configDraft.value.filter(tab => tab.id !== tabId)
  configActiveId.value = configDraft.value[Math.max(0, index - 1)]?.id || configDraft.value[0].id
}

function toggleConfigSource(sourceId: string) {
  const tab = configTab.value
  if (!tab) return
  const selected = tab.sourceIds.includes(sourceId)
  tab.sourceIds = selected
    ? tab.sourceIds.filter(id => id !== sourceId)
    : [...tab.sourceIds, sourceId]
}

function setConfigCategory(categoryId: NewsCategoryId) {
  const tab = configTab.value
  if (!tab || tab.categoryId === categoryId) return
  tab.categoryId = categoryId
  tab.sourceIds = tab.sourceIds.filter((sourceId) => (
    NEWS_SOURCES.find(source => source.id === sourceId)?.categoryId === categoryId
  ))
}

function saveConfig() {
  if (!configValid.value) return
  const beforeSourceIds = [...requestedSourceIds.value].sort()
  const normalized = normalizeNewsTabs(configDraft.value)
  if (normalized.length === 0) return

  tabs.value = normalized
  activeTabId.value = normalized.some(tab => tab.id === activeTabId.value)
    ? activeTabId.value
    : normalized[0].id
  writeNewsConfig(props.widgetId, {
    tabs: normalized,
    activeTabId: activeTabId.value,
  })
  const tabIds = new Set(normalized.map(tab => tab.id))
  readIdsByTab.value = Object.fromEntries(
    Object.entries(readIdsByTab.value).filter(([tabId]) => tabIds.has(tabId)),
  )
  persistReadState()
  configOpen.value = false

  const afterSourceIds = [...new Set(normalized.flatMap(tab => tab.sourceIds))].sort()
  if (beforeSourceIds.join('|') !== afterSourceIds.join('|')) {
    payload.value = null
    error.value = ''
    beginVisibleCycle()
  }
}

type ResizeAxis = 'width' | 'height' | 'both'
const sizeKey = `news-size${props.widgetId != null ? '-' + props.widgetId : ''}`

function readCardSize() {
  try {
    const saved = JSON.parse(localStorage.getItem(sizeKey) || 'null')
    return clampSize(
      Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Number(saved?.width) || 392)),
      Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Number(saved?.height) || 464)),
    )
  } catch {
    return { width: 392, height: 464 }
  }
}

const cardSize = ref(readCardSize())
const viewportWidth = ref(window.innerWidth)
const viewportHeight = ref(window.innerHeight)
const resizeAxis = ref<ResizeAxis | null>(null)
const displayWidth = computed(() => Math.min(cardSize.value.width, viewportWidth.value - 16))
const displayHeight = computed(() => Math.min(cardSize.value.height, viewportHeight.value - 16))
const displayX = computed(() => {
  const maxX = Math.max(8, viewportWidth.value - displayWidth.value - 8)
  return Math.min(Math.max(8, x.value), maxX)
})
const displayY = computed(() => {
  const maxY = Math.max(8, viewportHeight.value - displayHeight.value - 8)
  return Math.min(Math.max(8, y.value), maxY)
})

watch(cardSize, (value) => {
  localStorage.setItem(sizeKey, JSON.stringify(value))
}, { deep: true })

let resizeState: {
  axis: ResizeAxis
  startX: number
  startY: number
  width: number
  height: number
} | null = null

function clampSize(width: number, height: number) {
  return {
    width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(width / RESIZE_STEP) * RESIZE_STEP)),
    height: Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(height / RESIZE_STEP) * RESIZE_STEP)),
  }
}

function beginResize(event: PointerEvent, axis: ResizeAxis) {
  event.preventDefault()
  event.stopPropagation()
  resizeState = {
    axis,
    startX: event.clientX,
    startY: event.clientY,
    width: cardSize.value.width,
    height: cardSize.value.height,
  }
  resizeAxis.value = axis
  window.addEventListener('pointermove', onResizeMove, { passive: false })
  window.addEventListener('pointerup', stopResize, { once: true })
  window.addEventListener('pointercancel', stopResize, { once: true })
}

function onResizeMove(event: PointerEvent) {
  if (!resizeState) return
  event.preventDefault()
  const width = resizeState.axis === 'height'
    ? resizeState.width
    : resizeState.width + event.clientX - resizeState.startX
  const height = resizeState.axis === 'width'
    ? resizeState.height
    : resizeState.height + event.clientY - resizeState.startY
  cardSize.value = clampSize(width, height)
}

function stopResize() {
  resizeState = null
  resizeAxis.value = null
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', stopResize)
  window.removeEventListener('pointercancel', stopResize)
}

function nudgeResize(event: KeyboardEvent, axis: ResizeAxis) {
  const widthStep = event.key === 'ArrowLeft' ? -RESIZE_STEP : event.key === 'ArrowRight' ? RESIZE_STEP : 0
  const heightStep = event.key === 'ArrowUp' ? -RESIZE_STEP : event.key === 'ArrowDown' ? RESIZE_STEP : 0
  const widthAllowed = axis !== 'height' && widthStep !== 0
  const heightAllowed = axis !== 'width' && heightStep !== 0
  if (!widthAllowed && !heightAllowed) return
  event.preventDefault()
  event.stopPropagation()
  cardSize.value = clampSize(
    cardSize.value.width + (widthAllowed ? widthStep : 0),
    cardSize.value.height + (heightAllowed ? heightStep : 0),
  )
}

function beginWidgetDrag(event: MouseEvent) {
  if (x.value !== displayX.value) x.value = displayX.value
  if (y.value !== displayY.value) y.value = displayY.value
  onDragStart(event)
}

function updateViewport() {
  viewportWidth.value = window.innerWidth
  viewportHeight.value = window.innerHeight
}

onMounted(() => {
  mounted = true
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('pageshow', handlePageShow)
  window.addEventListener('resize', updateViewport)
  if (document.visibilityState === 'visible') beginVisibleCycle()
})

onUnmounted(() => {
  mounted = false
  clearPollTimer()
  cancelRequest()
  stopResize()
  hideSummaryTooltip()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('pageshow', handlePageShow)
  window.removeEventListener('resize', updateViewport)
})
</script>

<template>
  <section
    class="news-radar widget-card"
    :class="{ 'is-resizing': resizeAxis != null }"
    :style="{
      left: displayX + 'px',
      top: displayY + 'px',
      width: displayWidth + 'px',
      height: displayHeight + 'px',
    }"
    aria-label="资讯雷达"
  >
    <DragBar variant="header" :on-drag-start="beginWidgetDrag" title="📡 资讯雷达">
      <span
        class="news-live-dot"
        :class="{ 'is-loading': refreshing }"
        :title="refreshing ? '正在更新' : '页面可见时每 5 分钟更新'"
        aria-hidden="true"
      />
      <button
        type="button"
        class="news-icon-btn"
        aria-label="设置专题与订阅来源"
        title="设置专题"
        @click="openConfig"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
          <circle cx="6" cy="4.5" r="1.3" />
          <circle cx="10.4" cy="8" r="1.3" />
          <circle cx="7.4" cy="11.5" r="1.3" />
        </svg>
      </button>
      <button
        type="button"
        class="news-icon-btn news-refresh"
        :class="{ 'is-spinning': refreshing }"
        :disabled="refreshing"
        aria-label="立即刷新资讯"
        title="立即刷新"
        @click="refreshNews"
      >
        ↻
      </button>
    </DragBar>

    <div class="news-toolbar">
      <div class="news-tabs" role="tablist" aria-label="资讯专题">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          class="news-tab-item"
          :class="{ active: activeTab?.id === tab.id }"
        >
          <button
            type="button"
            class="news-tab-main"
            role="tab"
            :aria-selected="activeTab?.id === tab.id"
            @click="selectTab(tab.id)"
          >
            {{ tab.name }}
          </button>
          <button
            v-if="tabUnreadCount(tab)"
            type="button"
            class="news-tab-count"
            :aria-label="`${tab.name}有 ${tabUnreadCount(tab)} 条未读，点击全部标为已读`"
            title="全部标为已读"
            @click.stop="markTabRead(tab)"
          >
            {{ tabUnreadCount(tab) > 99 ? '99+' : tabUnreadCount(tab) }}
          </button>
        </div>
      </div>
      <span class="news-updated" title="最近一次成功刷新时间">{{ lastUpdatedText }}</span>
    </div>

    <div class="news-status" aria-live="polite">
      <span v-if="hasPartialFailure" class="news-warning">部分来源未更新</span>
      <span v-else>{{ selectedSourceNames }}</span>
      <span class="news-status-refresh">
        {{ activeUnreadCount ? '点数字标为已读 · 5 分钟刷新' : '每 5 分钟更新 · 离开暂停' }}
      </span>
    </div>

    <div class="news-scroll" role="tabpanel" @scroll="hideSummaryTooltip">
      <div v-if="loading" class="news-skeleton-list" aria-label="正在加载资讯">
        <div v-for="index in 5" :key="index" class="news-skeleton">
          <span />
          <strong />
          <strong class="is-short" />
        </div>
      </div>

      <div v-else-if="displayError && items.length === 0" class="news-state">
        <span class="news-state-icon">🛰</span>
        <strong>暂时没有收到信号</strong>
        <p>{{ displayError }}</p>
        <button type="button" @click="refreshNews">重新获取</button>
      </div>

      <div v-else-if="items.length === 0" class="news-state">
        <span class="news-state-icon">📭</span>
        <strong>这个专题还没有新内容</strong>
        <p>可以调整订阅来源，或等待下一次自动更新。</p>
      </div>

      <TransitionGroup v-else name="news-list" tag="div" class="news-list">
        <a
          v-for="item in items"
          :key="item.id"
          class="news-item"
          :href="item.url"
          target="_blank"
          rel="noopener noreferrer"
          @click="markItemRead(item.id)"
          @mouseenter="showSummaryTooltip($event, item.summary)"
          @mouseleave="hideSummaryTooltip"
          @focus="showSummaryTooltip($event, item.summary)"
          @blur="hideSummaryTooltip"
        >
          <span class="news-item-meta">
            <span class="news-source" :class="'is-' + sourceTone(item.sourceKind)">
              {{ item.source }}
            </span>
            <time :datetime="item.publishedAt || undefined">{{ formatTime(item.publishedAt) }}</time>
          </span>
          <strong class="news-title">{{ item.title }}</strong>
          <p v-if="item.summary" class="news-summary">{{ item.summary }}</p>
        </a>
      </TransitionGroup>
    </div>

    <div class="news-resize-controls">
      <button
        type="button"
        class="news-resize-handle news-resize-right"
        :aria-label="`调整宽度，当前 ${displayWidth} 像素，使用左右方向键`"
        title="拖动调整宽度"
        @pointerdown="beginResize($event, 'width')"
        @keydown="nudgeResize($event, 'width')"
      />
      <button
        type="button"
        class="news-resize-handle news-resize-bottom"
        :aria-label="`调整高度，当前 ${displayHeight} 像素，使用上下方向键`"
        title="拖动调整高度"
        @pointerdown="beginResize($event, 'height')"
        @keydown="nudgeResize($event, 'height')"
      />
      <button
        type="button"
        class="news-resize-handle news-resize-corner"
        :aria-label="`调整宽高，当前 ${displayWidth} × ${displayHeight}，使用方向键`"
        title="拖动调整宽高"
        @pointerdown="beginResize($event, 'both')"
        @keydown="nudgeResize($event, 'both')"
      >
        <span aria-hidden="true" />
      </button>
    </div>
  </section>

  <Teleport to="body">
    <Transition name="news-tooltip">
      <div
        v-if="summaryTooltip?.visible"
        class="news-summary-tooltip"
        :class="{ 'is-above': summaryTooltip.placement === 'above' }"
        :style="{ left: summaryTooltip.left + 'px', top: summaryTooltip.top + 'px' }"
        role="tooltip"
      >{{ summaryTooltip.text }}</div>
    </Transition>
  </Teleport>

  <UiDialog
    v-model="configOpen"
    title="专题设置"
    width="660px"
    :close-on-click-modal="false"
  >
    <div class="news-config-tabs" role="tablist" aria-label="待设置的专题">
      <button
        v-for="(tab, index) in configDraft"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="configTab?.id === tab.id"
        :class="{ active: configTab?.id === tab.id }"
        @click="configActiveId = tab.id"
      >
        <span>{{ tab.name.trim() || `专题 ${index + 1}` }}</span>
        <small>{{ tab.sourceIds.length }}</small>
      </button>
      <button type="button" class="news-config-add-tab" aria-label="添加 tab" @click="addConfigTab">
        ＋
      </button>
    </div>

    <div v-if="configTab" class="news-config-editor">
      <div class="news-config-heading">
        <div class="news-config-fields">
          <div class="news-config-category">
            <span>内容类型</span>
            <div role="tablist" aria-label="Tab 内容类型">
              <button
                v-for="category in NEWS_CATEGORIES"
                :key="category.id"
                type="button"
                role="tab"
                :aria-selected="configTab.categoryId === category.id"
                :class="{ active: configTab.categoryId === category.id }"
                @click="setConfigCategory(category.id)"
              >
                {{ category.name }}
              </button>
            </div>
          </div>
          <label class="news-config-name">
            <span>Tab 名称（仅用于命名与区分）</span>
            <input v-model="configTab.name" maxlength="16" placeholder="例如：本周游戏折扣" />
            <small>不会作为关键词筛选新闻，订阅内容由下方媒体源决定。</small>
          </label>
        </div>
        <button
          type="button"
          class="news-config-remove-tab"
          :disabled="configDraft.length <= 1"
          @click="removeConfigTab(configTab.id)"
        >
          删除此 tab
        </button>
      </div>

      <div class="news-source-group">
        <div class="news-source-group-title">
          <span>{{ configCategory.name }}相关媒体</span>
          <small>{{ configCategory.description }}</small>
        </div>
        <div class="news-source-grid">
          <label
            v-for="source in configCategorySources"
            :key="source.id"
            class="news-source-option"
            :class="{ selected: configTab.sourceIds.includes(source.id) }"
          >
            <input
              type="checkbox"
              :checked="configTab.sourceIds.includes(source.id)"
              @change="toggleConfigSource(source.id)"
            />
            <span class="news-source-option-copy">
              <strong>
                {{ source.name }}
                <small v-if="source.requiresRssHub">需 RSSHub</small>
              </strong>
              <span>{{ source.description }}</span>
            </span>
            <span class="news-source-option-check" aria-hidden="true">✓</span>
          </label>
        </div>
      </div>
    </div>

    <div class="news-config-footnote">
      <span>{{ configInvalidHint || `${configDraft.length} 个 tab · 共用一次数据请求` }}</span>
    </div>

    <template #footer>
      <button type="button" class="ui-button" @click="configOpen = false">取消</button>
      <button
        type="button"
        class="ui-button ui-button-primary"
        :disabled="!configValid"
        @click="saveConfig"
      >
        保存设置
      </button>
    </template>
  </UiDialog>
</template>

<style scoped>
.news-radar {
  position: absolute;
  display: flex;
  flex-direction: column;
  z-index: 54;
  min-width: 300px;
  min-height: 320px;
}
.news-radar.is-resizing { user-select: none; }

.news-live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 13%, transparent);
}
.news-live-dot.is-loading {
  animation: news-pulse 900ms ease-in-out infinite alternate;
}
.news-icon-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent);
  border-radius: 50%;
  background: color-mix(in srgb, var(--color-surface) 52%, transparent);
  color: var(--color-ink-3);
  cursor: pointer;
  font: 700 12px/1 var(--font-family);
  transition: color 150ms ease, border-color 150ms ease, background 150ms ease;
}
.news-icon-btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--color-primary) 52%, var(--color-border));
  background: var(--color-primary-soft);
  color: var(--color-primary-hover);
}
.news-icon-btn svg {
  width: 11px;
  height: 11px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.35;
  stroke-linecap: round;
}
.news-refresh:disabled { cursor: wait; }
.news-refresh.is-spinning { animation: news-spin 800ms linear infinite; }

.news-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px 0;
  min-width: 0;
}
.news-tabs {
  flex: 0 1 auto;
  width: fit-content;
  min-width: 0;
  max-width: calc(100% - 70px);
  display: flex;
  gap: 5px;
  overflow-x: auto;
  padding: 4px 4px 3px 1px;
  scrollbar-width: none;
}
.news-tabs::-webkit-scrollbar { display: none; }
.news-tab-item {
  position: relative;
  height: 29px;
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
  border-radius: 9px;
  background: color-mix(in srgb, var(--color-surface) 40%, transparent);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.34) inset;
  transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease;
}
.news-tab-item:hover {
  border-color: color-mix(in srgb, var(--color-primary) 30%, var(--color-border));
  background: color-mix(in srgb, var(--color-surface) 65%, transparent);
}
.news-tab-item.active {
  border-color: color-mix(in srgb, var(--color-primary) 34%, var(--color-border));
  background: color-mix(in srgb, var(--color-surface) 90%, transparent);
  box-shadow:
    0 2px 8px rgba(15, 23, 42, 0.07),
    0 1px 0 rgba(255, 255, 255, 0.58) inset;
}
.news-tab-main {
  min-width: max-content;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 9px;
  border: 0;
  background: transparent;
  color: var(--color-ink-3);
  cursor: pointer;
  font: 650 0.63rem/1 var(--font-family);
  transition: color 150ms ease;
}
.news-tab-item:hover .news-tab-main { color: var(--color-ink-2); }
.news-tab-item.active .news-tab-main {
  color: var(--color-ink);
  font-weight: 740;
}
.news-tab-count {
  position: absolute;
  top: -5px;
  right: -4px;
  z-index: 1;
  min-width: 17px;
  height: 17px;
  display: inline-grid;
  place-items: center;
  margin: 0;
  padding: 0 5px;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: color-mix(in srgb, var(--color-primary-hover) 76%, var(--color-ink));
  cursor: pointer;
  font: 720 0.51rem/1 var(--font-family);
  font-variant-numeric: tabular-nums;
  box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--color-surface) 88%, transparent);
  transition: background 140ms ease, color 140ms ease;
}
.news-tab-count:hover {
  background: var(--color-primary);
  color: #12382f;
}
.news-config-tabs small {
  min-width: 16px;
  height: 16px;
  display: inline-grid;
  place-items: center;
  padding: 0 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: color-mix(in srgb, var(--color-primary-hover) 72%, var(--color-ink));
  font-size: 0.52rem;
  font-variant-numeric: tabular-nums;
}
.news-updated {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-ink) 4%, transparent);
  color: var(--color-ink-3);
  font-size: 0.57rem;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.news-updated::before {
  content: "";
  width: 4px;
  height: 4px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--color-primary);
}

.news-status {
  min-height: 22px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 14px 5px;
  color: var(--color-ink-3);
  font-size: 0.55rem;
  min-width: 0;
}
.news-status > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.news-status-refresh {
  flex-shrink: 0;
  margin-left: auto;
  opacity: 0.72;
}
.news-warning {
  color: color-mix(in srgb, var(--status-idle-dark) 76%, var(--color-ink-2));
}

.news-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 7px 8px;
}
.news-list { display: flex; flex-direction: column; gap: 2px; }
.news-item {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px 9px;
  border: 1px solid transparent;
  border-radius: 10px;
  color: inherit;
  text-decoration: none;
  transition: background 150ms ease, border-color 150ms ease, transform 150ms ease;
}
.news-item::after {
  content: "↗";
  position: absolute;
  top: 11px;
  right: 9px;
  color: var(--color-ink-3);
  font-size: 0.62rem;
  opacity: 0;
  transform: translate(-2px, 2px);
  transition: opacity 150ms ease, transform 150ms ease;
}
.news-item:hover {
  border-color: color-mix(in srgb, var(--color-border) 66%, transparent);
  background: color-mix(in srgb, var(--color-surface) 48%, transparent);
}
.news-item:hover::after { opacity: 0.72; transform: translate(0, 0); }
.news-item:active { transform: scale(0.995); }
.news-item:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
.news-item-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  padding-right: 17px;
}
.news-source {
  display: inline-flex;
  align-items: center;
  height: 17px;
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 11%, transparent);
  color: color-mix(in srgb, var(--color-primary-hover) 68%, var(--color-ink));
  font-size: 0.53rem;
  font-weight: 720;
}
.news-source.is-tech {
  background: color-mix(in srgb, #3b82f6 10%, transparent);
  color: color-mix(in srgb, #2563eb 68%, var(--color-ink));
}
.news-source.is-business {
  background: color-mix(in srgb, #f59e0b 13%, transparent);
  color: color-mix(in srgb, #b45309 80%, var(--color-ink));
}
.news-source.is-gov {
  background: color-mix(in srgb, #ef4444 9%, transparent);
  color: color-mix(in srgb, #b91c1c 72%, var(--color-ink));
}
.news-source.is-local {
  background: color-mix(in srgb, #06b6d4 11%, transparent);
  color: color-mix(in srgb, #0e7490 72%, var(--color-ink));
}
.news-source.is-game {
  background: color-mix(in srgb, #8b5cf6 10%, transparent);
  color: color-mix(in srgb, #6d28d9 72%, var(--color-ink));
}
.news-source.is-deal {
  background: color-mix(in srgb, #10b981 11%, transparent);
  color: color-mix(in srgb, #047857 76%, var(--color-ink));
}
.news-source.is-film {
  background: color-mix(in srgb, #ec4899 9%, transparent);
  color: color-mix(in srgb, #be185d 72%, var(--color-ink));
}
.news-item time {
  color: var(--color-ink-3);
  font-size: 0.54rem;
  font-variant-numeric: tabular-nums;
}
.news-title {
  color: var(--color-ink);
  font-size: 0.73rem;
  font-weight: 660;
  line-height: 1.5;
  letter-spacing: 0.005em;
  padding-right: 9px;
}
.news-summary {
  display: -webkit-box;
  overflow: hidden;
  color: var(--color-ink-2);
  font-size: 0.61rem;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.news-summary-tooltip {
  position: fixed;
  z-index: 2600;
  width: min(460px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-surface) 94%, transparent);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.2);
  color: var(--color-ink);
  font-size: 0.7rem;
  line-height: 1.62;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  pointer-events: none;
}
.news-summary-tooltip.is-above { transform: translateY(-100%); }
.news-tooltip-enter-active,
.news-tooltip-leave-active {
  transition: opacity 130ms ease, transform 130ms ease;
}
.news-tooltip-enter-from,
.news-tooltip-leave-to { opacity: 0; }
.news-tooltip-enter-from:not(.is-above),
.news-tooltip-leave-to:not(.is-above) { transform: translateY(-3px); }
.news-tooltip-enter-from.is-above,
.news-tooltip-leave-to.is-above { transform: translateY(calc(-100% + 3px)); }

.news-state {
  min-height: 240px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px;
  color: var(--color-ink-3);
  text-align: center;
}
.news-state-icon { margin-bottom: 3px; font-size: 30px; opacity: 0.62; }
.news-state strong { color: var(--color-ink-2); font-size: 0.74rem; }
.news-state p { font-size: 0.62rem; line-height: 1.5; }
.news-state button {
  min-height: 28px;
  margin-top: 4px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-ink-2);
  cursor: pointer;
  font: 650 0.62rem/1 var(--font-family);
}
.news-state button:hover {
  border-color: var(--color-primary);
  color: var(--color-primary-hover);
}

.news-skeleton-list { display: flex; flex-direction: column; gap: 2px; }
.news-skeleton {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px 9px;
}
.news-skeleton span,
.news-skeleton strong {
  display: block;
  height: 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-ink) 7%, transparent);
}
.news-skeleton span { width: 52px; height: 15px; }
.news-skeleton strong { width: 92%; }
.news-skeleton strong.is-short { width: 66%; }
.news-skeleton > * {
  animation: news-placeholder 1.15s ease-in-out infinite alternate;
}

.news-resize-controls {
  position: absolute;
  z-index: 30;
  inset: 26px 0 0;
  pointer-events: none;
}
.news-resize-handle {
  position: absolute;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-ink-3);
  pointer-events: auto;
  touch-action: none;
}
.news-resize-handle::before {
  content: "";
  position: absolute;
  background: color-mix(in srgb, var(--color-primary) 56%, transparent);
  opacity: 0;
  transition: opacity 140ms ease;
}
.news-resize-handle:hover::before,
.news-resize-handle:focus-visible::before,
.is-resizing .news-resize-handle::before { opacity: 1; }
.news-resize-right {
  top: 0;
  right: 0;
  bottom: 8px;
  width: 7px;
  cursor: ew-resize;
}
.news-resize-right::before {
  top: 12px;
  right: 2px;
  bottom: 12px;
  width: 1px;
}
.news-resize-bottom {
  right: 8px;
  bottom: 0;
  left: 0;
  height: 7px;
  cursor: ns-resize;
}
.news-resize-bottom::before {
  right: 12px;
  bottom: 2px;
  left: 12px;
  height: 1px;
}
.news-resize-corner {
  right: 6px;
  bottom: 6px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  border-radius: 6px;
  cursor: nwse-resize;
}
.news-resize-corner span {
  width: 8px;
  height: 8px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  opacity: 0;
  transition: opacity 140ms ease, color 140ms ease;
}
.news-radar:hover .news-resize-corner span { opacity: 0.28; }
.news-resize-corner:hover span,
.news-resize-corner:focus-visible span,
.is-resizing .news-resize-corner span {
  color: var(--color-primary);
  opacity: 1;
}

/* Settings dialog */
.news-config-tabs {
  display: flex;
  gap: 5px;
  overflow-x: auto;
  padding: 0 0 10px;
  scrollbar-width: none;
}
.news-config-tabs::-webkit-scrollbar { display: none; }
.news-config-tabs button {
  min-width: max-content;
  height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-ink-3);
  cursor: pointer;
  font: 650 0.64rem/1 var(--font-family);
}
.news-config-tabs button.active {
  border-color: color-mix(in srgb, var(--color-primary) 44%, var(--color-border));
  background: var(--color-primary-soft);
  color: var(--color-ink);
}
.news-config-add-tab {
  width: 30px;
  min-width: 30px !important;
  justify-content: center;
  padding: 0 !important;
  font-size: 1rem !important;
}
.news-config-editor {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
}
.news-config-heading {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  padding: 13px 14px;
  background: color-mix(in srgb, var(--color-surface-soft) 58%, transparent);
  border-bottom: 1px solid var(--color-border);
}
.news-config-fields {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: flex-end;
  gap: 14px;
}
.news-config-category {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--color-ink-3);
  font-size: 0.58rem;
  font-weight: 700;
}
.news-config-category > div {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-ink) 5%, transparent);
}
.news-config-category button {
  min-height: 28px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-ink-3);
  cursor: pointer;
  font: 650 0.6rem/1 var(--font-family);
  white-space: nowrap;
}
.news-config-category button:hover { color: var(--color-ink-2); }
.news-config-category button.active {
  background: var(--color-surface);
  color: var(--color-ink);
  box-shadow: 0 2px 7px rgba(15, 23, 42, 0.07);
}
.news-config-name { min-width: 160px; }
.news-config-name small {
  color: var(--color-ink-3);
  font-size: 0.53rem;
  font-weight: 500;
  line-height: 1.4;
}
.news-config-heading label {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--color-ink-3);
  font-size: 0.58rem;
  font-weight: 700;
}
.news-config-heading input {
  height: 34px;
  padding: 0 9px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  outline: none;
  background: var(--color-surface);
  color: var(--color-ink);
  font: 600 0.74rem/1 var(--font-family);
}
.news-config-heading input:focus {
  border-color: color-mix(in srgb, var(--color-primary) 48%, var(--color-border));
  box-shadow: var(--focus-ring);
}
.news-config-remove-tab {
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--color-danger) 24%, var(--color-border));
  border-radius: 8px;
  background: transparent;
  color: var(--color-danger);
  cursor: pointer;
  font: 650 0.6rem/1 var(--font-family);
}
.news-config-remove-tab:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-danger) 7%, transparent);
}
.news-config-remove-tab:disabled { cursor: default; opacity: 0.35; }
.news-source-group {
  padding: 12px 14px;
}
.news-source-group + .news-source-group {
  border-top: 1px solid color-mix(in srgb, var(--color-border) 74%, transparent);
}
.news-source-group-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 7px;
  color: var(--color-ink-2);
  font-size: 0.62rem;
  font-weight: 760;
}
.news-source-group-title small {
  color: var(--color-ink-3);
  font-size: 0.54rem;
  font-weight: 500;
}
.news-source-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}
.news-source-option {
  position: relative;
  min-height: 66px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--color-border) 86%, transparent);
  border-radius: 9px;
  background: color-mix(in srgb, var(--color-surface) 62%, transparent);
  cursor: pointer;
  transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease;
}
.news-source-option:hover {
  border-color: color-mix(in srgb, var(--color-primary) 36%, var(--color-border));
}
.news-source-option:has(input:focus-visible) {
  border-color: var(--color-primary);
  box-shadow: var(--focus-ring);
}
.news-source-option.selected {
  border-color: color-mix(in srgb, var(--color-primary) 62%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary-soft) 66%, var(--color-surface));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 8%, transparent);
}
.news-source-option input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.news-source-option-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.news-source-option-copy strong {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  color: var(--color-ink);
  font-size: 0.67rem;
}
.news-source-option-copy strong small {
  padding: 2px 4px;
  border-radius: 4px;
  background: var(--status-idle-soft);
  color: color-mix(in srgb, var(--status-idle-dark) 82%, var(--color-ink-2));
  font-size: 0.48rem;
  font-weight: 700;
}
.news-source-option-copy > span {
  color: var(--color-ink-3);
  font-size: 0.56rem;
  line-height: 1.4;
}
.news-source-option-check {
  width: 17px;
  height: 17px;
  flex: 0 0 17px;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  color: transparent;
  font-size: 0.56rem;
  font-weight: 900;
}
.news-source-option.selected .news-source-option-check {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #10382f;
}
.news-config-footnote {
  min-height: 26px;
  padding-top: 10px;
  color: var(--color-ink-3);
  font-size: 0.6rem;
  text-align: right;
}

.news-list-enter-active,
.news-list-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}
.news-list-enter-from,
.news-list-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

@keyframes news-spin { to { transform: rotate(360deg); } }
@keyframes news-pulse { to { opacity: 0.42; } }
@keyframes news-placeholder { to { opacity: 0.44; } }

@media (max-width: 620px) {
  .news-source-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .news-config-heading { align-items: stretch; flex-direction: column; }
  .news-config-fields { flex-direction: column; align-items: stretch; }
  .news-config-remove-tab { align-self: flex-start; }
}

@media (prefers-reduced-motion: reduce) {
  .news-live-dot.is-loading,
  .news-refresh.is-spinning,
  .news-skeleton > * {
    animation: none;
  }
}
</style>
