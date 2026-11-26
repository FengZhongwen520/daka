<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch, computed } from 'vue'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import DragBar from '../common/DragBar.vue'

import { getItem, setItem } from '../../storage'
type TodoStatus = 'todo' | 'doing' | 'done'

interface TodoItem {
  id: number
  text: string
  status: TodoStatus
  groupId?: number
  parentId?: number
}

interface TodoGroup {
  id: number
  title: string
  collapsed: boolean
}

const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()

// Persistence keys (per instance)
const key = `todo${props.widgetId != null ? '-' + props.widgetId : ''}`
const itemsKey = `${key}-items`
const titleKey = `${key}-title`
const groupsKey = `${key}-groups`

// Items — first run seeds 3 demo items to show the 3 states
const DEFAULT_ITEMS: TodoItem[] = [
  { id: 1, text: '用待办记录你的打卡', status: 'todo' },
  { id: 2, text: '点击圆圈切换状态', status: 'doing' },
  { id: 3, text: '完成一项任务 ✓', status: 'done' },
]
let parsedItems: TodoItem[] | null = null
try {
  const raw = getItem(itemsKey)
  parsedItems = raw ? JSON.parse(raw) : null
} catch { /* 忽略损坏数据 */ }
let parsedGroups: TodoGroup[] = []
try {
  const raw = getItem(groupsKey)
  parsedGroups = raw ? JSON.parse(raw) : []
} catch { /* 忽略损坏数据 */ }

const initialItems = parsedItems ?? DEFAULT_ITEMS
const initialGroups = Array.isArray(parsedGroups)
  ? parsedGroups.filter(group => Number.isInteger(group.id) && typeof group.title === 'string')
  : []

// Migrate the previous parent-task grouping model into a real titled group.
if (initialGroups.length === 0) {
  const legacyParents = new Set<number>()
  for (const item of initialItems) {
    if (item.parentId != null) legacyParents.add(item.parentId)
  }
  let legacyIndex = 1
  for (const parentId of legacyParents) {
    const id = Math.max(0, ...initialItems.map(item => item.id), ...initialGroups.map(group => group.id)) + legacyIndex
    initialGroups.push({ id, title: `分组 ${legacyIndex}`, collapsed: false })
    for (const item of initialItems) {
      if (item.id === parentId || item.parentId === parentId) {
        item.groupId = id
        delete item.parentId
      }
    }
    legacyIndex++
  }
}

const items = ref<TodoItem[]>(initialItems)
const groups = ref<TodoGroup[]>(initialGroups)
let nextId = items.value.reduce((m, i) => Math.max(m, i.id), 0) + 1
let nextGroupId = groups.value.reduce((m, group) => Math.max(m, group.id), 0) + 1
watch(items, (v) => setItem(itemsKey, JSON.stringify(v)), { deep: true })
watch(groups, (v) => setItem(groupsKey, JSON.stringify(v)), { deep: true })
if (initialGroups.length > 0 && !getItem(groupsKey)) {
  setItem(groupsKey, JSON.stringify(initialGroups))
  setItem(itemsKey, JSON.stringify(initialItems))
}

// Title
const savedTitle = JSON.parse(getItem(titleKey) || 'null')
const title = ref(savedTitle ?? '✅ 待办')
watch(title, (v) => setItem(titleKey, JSON.stringify(v)))

const statusLabel: Record<TodoStatus, string> = {
  todo: '待办',
  doing: '进行中',
  done: '已完成',
}

// Tabs: 待办(含进行中) / 已完成 — 已完成单独分页
const tab = ref<'active' | 'done'>('active')
const activeItems = computed(() => items.value.filter(i => i.status !== 'done'))
const doneItems = computed(() => items.value.filter(i => i.status === 'done'))
const activeCount = computed(() => activeItems.value.length)
const doneCount = computed(() => doneItems.value.length)

interface VisibleTask {
  kind: 'task'
  item: TodoItem
  groupId?: number
}

interface VisibleGroup {
  kind: 'group'
  group: TodoGroup
  count: number
}

type VisibleTodo = VisibleTask | VisibleGroup

const visibleEntries = computed<VisibleTodo[]>(() => {
  const visibleItems = tab.value === 'done' ? doneItems.value : activeItems.value
  const visibleIds = new Set(visibleItems.map(item => item.id))
  const entries: VisibleTodo[] = []
  const renderedGroups = new Set<number>()

  for (const item of items.value) {
    if (!visibleIds.has(item.id)) continue
    const group = item.groupId != null
      ? groups.value.find(candidate => candidate.id === item.groupId)
      : null

    if (!group) {
      entries.push({ kind: 'task', item })
      continue
    }
    if (renderedGroups.has(group.id)) continue
    renderedGroups.add(group.id)
    const members = items.value.filter(member => (
      member.groupId === group.id && visibleIds.has(member.id)
    ))
    entries.push({
      kind: 'group',
      group,
      count: members.length,
    })
    if (!group.collapsed) {
      for (const member of members) {
        entries.push({ kind: 'task', item: member, groupId: group.id })
      }
    }
  }
  return entries
})

// Add / delete / cycle status / inline edit
const draft = ref('')
const addInputRef = ref<HTMLInputElement>()
const rootRef = ref<HTMLElement>()
const editingId = ref<number | null>(null)
const editDraft = ref('')
const editingGroupId = ref<number | null>(null)
const groupTitleDraft = ref('')
const todoTooltip = ref<{
  visible: boolean
  text: string
  left: number
  top: number
  placement: 'above' | 'below'
} | null>(null)
let todoTooltipTimer: number | null = null

function hideTodoTextTooltip() {
  if (todoTooltipTimer != null) {
    window.clearTimeout(todoTooltipTimer)
    todoTooltipTimer = null
  }
  if (todoTooltip.value) todoTooltip.value.visible = false
}

function showTodoTextTooltip(event: Event, text: string) {
  hideTodoTextTooltip()
  const row = event.currentTarget as HTMLElement
  const target = row.querySelector<HTMLElement>('.todo-text') || row
  todoTooltipTimer = window.setTimeout(() => {
    if (
      !target.isConnected
      || !text.trim()
      || target.scrollHeight <= target.clientHeight + 1
    ) return
    const rect = target.getBoundingClientRect()
    const maxWidth = Math.min(320, window.innerWidth - 24)
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - maxWidth - 12)
    const placement = rect.top > 110 ? 'above' : 'below'
    todoTooltip.value = {
      visible: true,
      text: text.trim(),
      left,
      top: placement === 'above' ? rect.top - 8 : rect.bottom + 8,
      placement,
    }
  }, 320)
}

function addItem() {
  const text = draft.value.trim()
  if (!text) return
  items.value.push({ id: nextId++, text, status: 'todo' })
  draft.value = ''
}
function onAddKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') addItem()
}
function removeItem(id: number) {
  items.value = items.value.filter(i => i.id !== id)
  pruneEmptyGroups()
}

function toggleGroup(id: number) {
  const group = groups.value.find(candidate => candidate.id === id)
  if (group) group.collapsed = !group.collapsed
}

function switchToActiveAndAdd() {
  tab.value = 'active'
  nextTick(() => addInputRef.value?.focus())
}
function cycleStatus(id: number) {
  const item = items.value.find(i => i.id === id)
  if (!item) return
  item.status = item.status === 'todo' ? 'doing' : item.status === 'doing' ? 'done' : 'todo'
}
function moveItemByKeyboard(id: number, direction: -1 | 1) {
  const item = items.value.find(candidate => candidate.id === id)
  if (!item) return
  const visibleSiblingIndexes = items.value
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => (
      candidate.groupId === item.groupId
      && (tab.value === 'done' ? candidate.status === 'done' : candidate.status !== 'done')
    ))
    .map(({ index }) => index)
  const position = visibleSiblingIndexes.findIndex(index => items.value[index].id === id)
  const targetPosition = position + direction
  if (position < 0 || targetPosition < 0 || targetPosition >= visibleSiblingIndexes.length) return
  const sourceIndex = visibleSiblingIndexes[position]
  const targetIndex = visibleSiblingIndexes[targetPosition]
  ;[items.value[sourceIndex], items.value[targetIndex]] = [items.value[targetIndex], items.value[sourceIndex]]
}
function onStatusKeydown(e: KeyboardEvent, id: number) {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycleStatus(id) }
}
function startEdit(id: number) {
  const item = items.value.find(i => i.id === id)
  if (!item) return
  editingId.value = id
  editDraft.value = item.text
}
function saveEdit(id: number) {
  const item = items.value.find(i => i.id === id)
  if (!item) return
  const text = editDraft.value.trim()
  if (text) item.text = text
  editingId.value = null
}
function onEditKeydown(e: KeyboardEvent, id: number) {
  if (e.key === 'Enter') saveEdit(id)
  if (e.key === 'Escape') editingId.value = null
}

function startGroupEdit(group: TodoGroup) {
  editingGroupId.value = group.id
  groupTitleDraft.value = group.title
  nextTick(() => {
    const input = rootRef.value?.querySelector<HTMLInputElement>(`[data-group-title-input="${group.id}"]`)
    input?.focus()
    input?.select()
  })
}

function saveGroupTitle(group: TodoGroup) {
  const title = groupTitleDraft.value.trim()
  if (title) group.title = title
  editingGroupId.value = null
}

function onGroupTitleKeydown(event: KeyboardEvent, group: TodoGroup) {
  if (event.key === 'Enter') saveGroupTitle(group)
  if (event.key === 'Escape') editingGroupId.value = null
}

function pruneEmptyGroups() {
  const usedGroupIds = new Set(
    items.value
      .map(item => item.groupId)
      .filter((id): id is number => id != null),
  )
  groups.value = groups.value.filter(group => usedGroupIds.has(group.id))
}

function leaveGroup(item: TodoItem) {
  if (item.groupId == null) return
  item.groupId = undefined
  pruneEmptyGroups()
}

// Drag
const draggingId = ref<number | null>(null)
const dragOverId = ref<number | null>(null)
const dragOverGroupId = ref<number | null>(null)
const draggingItem = computed(() => items.value.find(item => item.id === draggingId.value) || null)
const canUngroupDragged = computed(() => draggingItem.value?.groupId != null)
let pointerDrag: {
  id: number
  startX: number
  startY: number
  active: boolean
  previousUserSelect: string
  previousCursor: string
} | null = null

function beginItemDrag(item: TodoItem, event: PointerEvent) {
  if (!beginDragSession(item, event)) return
  window.addEventListener('pointermove', onItemPointerMove, { passive: false })
  window.addEventListener('pointerup', finishItemPointerDrag, { once: true })
  window.addEventListener('pointercancel', cancelItemPointerDrag, { once: true })
}

function beginItemMouseDrag(item: TodoItem, event: MouseEvent) {
  if (!beginDragSession(item, event)) return
  window.addEventListener('mousemove', onItemMouseMove, { passive: false })
  window.addEventListener('mouseup', finishItemPointerDrag, { once: true })
}

function beginDragSession(item: TodoItem, event: MouseEvent | PointerEvent): boolean {
  if (pointerDrag) return false
  if (event.button !== 0) return false
  if ('pointerType' in event && event.pointerType === 'touch') return false
  if ((event.target as HTMLElement).closest('button, input')) return false

  hideTodoTextTooltip()
  pointerDrag = {
    id: item.id,
    startX: event.clientX,
    startY: event.clientY,
    active: false,
    previousUserSelect: document.body.style.userSelect,
    previousCursor: document.body.style.cursor,
  }
  return true
}

function onItemPointerMove(event: PointerEvent) {
  handleItemDragMove(event)
}

function onItemMouseMove(event: MouseEvent) {
  handleItemDragMove(event)
}

function handleItemDragMove(event: MouseEvent | PointerEvent) {
  if (!pointerDrag) return
  if (!pointerDrag.active) {
    const distance = Math.hypot(
      event.clientX - pointerDrag.startX,
      event.clientY - pointerDrag.startY,
    )
    if (distance < 6) return
    pointerDrag.active = true
    draggingId.value = pointerDrag.id
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'
  }

  event.preventDefault()
  const element = document.elementFromPoint(event.clientX, event.clientY)
  const groupHeader = element?.closest<HTMLElement>('[data-todo-group-id]')
  const groupId = Number(groupHeader?.dataset.todoGroupId)
  if (Number.isInteger(groupId)) {
    dragOverGroupId.value = groupId === draggingItem.value?.groupId ? null : groupId
    dragOverId.value = null
    return
  }
  dragOverGroupId.value = null
  const row = element?.closest<HTMLElement>('[data-todo-id]')
  const id = Number(row?.dataset.todoId)
  dragOverId.value = Number.isInteger(id) && id !== pointerDrag.id ? id : null
}

function finishItemPointerDrag(event: MouseEvent | PointerEvent) {
  if (pointerDrag?.active) {
    const element = document.elementFromPoint(event.clientX, event.clientY)
    if (element?.closest('[data-todo-ungroup]')) {
      dropOutsideGroup()
    } else {
      const groupHeader = element?.closest<HTMLElement>('[data-todo-group-id]')
      if (groupHeader) {
        const group = groups.value.find(candidate => candidate.id === Number(groupHeader.dataset.todoGroupId))
        if (group) dropIntoGroup(group)
      }
      const row = element?.closest<HTMLElement>('[data-todo-id]')
      const target = items.value.find(item => item.id === Number(row?.dataset.todoId))
      if (target) dropOnItem(target)
    }
  }
  endItemDrag()
}

function cancelItemPointerDrag() {
  endItemDrag()
}

function cleanupPointerDrag() {
  window.removeEventListener('pointermove', onItemPointerMove)
  window.removeEventListener('pointerup', finishItemPointerDrag)
  window.removeEventListener('pointercancel', cancelItemPointerDrag)
  window.removeEventListener('mousemove', onItemMouseMove)
  window.removeEventListener('mouseup', finishItemPointerDrag)
  if (pointerDrag) {
    document.body.style.userSelect = pointerDrag.previousUserSelect
    document.body.style.cursor = pointerDrag.previousCursor
  }
  pointerDrag = null
}

function endItemDrag() {
  draggingId.value = null
  dragOverId.value = null
  dragOverGroupId.value = null
  cleanupPointerDrag()
}

async function dropOnItem(target: TodoItem) {
  const dragged = draggingItem.value
  if (!dragged || dragged.id === target.id) return
  if (target.groupId != null) {
    if (target.groupId === dragged.groupId) return
    dragged.groupId = target.groupId
    const group = groups.value.find(candidate => candidate.id === target.groupId)
    if (group) group.collapsed = false
  } else {
    const group: TodoGroup = {
      id: nextGroupId++,
      title: `分组 ${nextGroupId - 1}`,
      collapsed: false,
    }
    groups.value.push(group)
    target.groupId = group.id
    dragged.groupId = group.id
  }
  pruneEmptyGroups()
  dragOverId.value = null
  draggingId.value = null
}

function dropOutsideGroup() {
  const dragged = draggingItem.value
  if (dragged?.groupId != null) dragged.groupId = undefined
  pruneEmptyGroups()
  endItemDrag()
}

function dropIntoGroup(group: TodoGroup) {
  const dragged = draggingItem.value
  if (!dragged || dragged.groupId === group.id) return
  dragged.groupId = group.id
  group.collapsed = false
  pruneEmptyGroups()
  dragOverGroupId.value = null
  draggingId.value = null
}

function clearDragOver(id: number) {
  if (dragOverId.value === id) dragOverId.value = null
}

function setDragOver(id: number) {
  if (draggingId.value != null && draggingId.value !== id) dragOverId.value = id
}

function setGroupDragOver(id: number) {
  if (draggingId.value != null && draggingItem.value?.groupId !== id) {
    dragOverGroupId.value = id
    dragOverId.value = null
  }
}

function clearGroupDragOver(id: number) {
  if (dragOverGroupId.value === id) dragOverGroupId.value = null
}

watch(tab, endItemDrag)

onUnmounted(endItemDrag)
onUnmounted(hideTodoTextTooltip)

const posKey = `todo-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const { x, y, onDragStart } = useWidgetDrag(props, posKey, 340, 140)

type ResizeAxis = 'width' | 'height' | 'both'
const sizeKey = `todo-size${props.widgetId != null ? '-' + props.widgetId : ''}`
const MIN_WIDTH = 220
const MIN_HEIGHT = 220
const MAX_WIDTH = 560
const MAX_HEIGHT = 620
const RESIZE_STEP = 8

function readCardSize() {
  try {
    const saved = JSON.parse(getItem(sizeKey) || 'null')
    return {
      width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Number(saved?.width) || 240)),
      height: Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Number(saved?.height) || 248)),
    }
  } catch {
    return { width: 240, height: 248 }
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

watch(cardSize, value => {
  setItem(sizeKey, JSON.stringify(value))
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

onMounted(() => window.addEventListener('resize', updateViewport))
onUnmounted(() => {
  stopResize()
  window.removeEventListener('resize', updateViewport)
})
</script>

<template>
  <div
    ref="rootRef"
    class="todo-pad widget-card"
    :class="{ 'is-resizing': resizeAxis != null }"
    :style="{
      left: displayX + 'px',
      top: displayY + 'px',
      width: displayWidth + 'px',
      height: displayHeight + 'px',
    }"
  >
    <!-- Header: title + progress badge -->
    <DragBar
      variant="header"
      :on-drag-start="beginWidgetDrag"
      v-model:title="title"
      :editable="true"
      title-placeholder="✅ 待办"
    >
      <div class="todo-tabs" title="切换视图">
        <button class="todo-tab" :class="{ active: tab === 'active' }" @click="tab = 'active'">
          待办<span class="tab-count">{{ activeCount }}</span>
        </button>
        <button class="todo-tab" :class="{ active: tab === 'done' }" @click="tab = 'done'">
          已完成<span class="tab-count">{{ doneCount }}</span>
        </button>
      </div>
    </DragBar>

    <!-- List -->
    <div class="todo-list">
      <div v-if="draggingItem" class="todo-drag-tip">
        拖到另一条任务上创建分组
      </div>
      <template v-for="entry in visibleEntries" :key="entry.kind === 'group' ? `group-${entry.group.id}` : `task-${entry.item.id}`">
        <div
          v-if="entry.kind === 'group'"
          class="todo-group-header"
          :class="{ 'drop-target': dragOverGroupId === entry.group.id }"
          :data-todo-group-id="entry.group.id"
          @pointerenter="setGroupDragOver(entry.group.id)"
          @pointerleave="clearGroupDragOver(entry.group.id)"
        >
          <button
            type="button"
            class="todo-group-toggle"
            :aria-expanded="!entry.group.collapsed"
            :aria-label="entry.group.collapsed ? '展开分组' : '收起分组'"
            @click="toggleGroup(entry.group.id)"
          >
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="m4 2.5 3.5 3.5L4 9.5" />
            </svg>
          </button>

          <input
            v-if="editingGroupId === entry.group.id"
            v-model="groupTitleDraft"
            class="todo-group-title-input"
            :data-group-title-input="entry.group.id"
            @blur="saveGroupTitle(entry.group)"
            @keydown="onGroupTitleKeydown($event, entry.group)"
          />
          <span
            v-else
            class="todo-group-title"
            title="双击编辑分组标题"
            @dblclick="startGroupEdit(entry.group)"
          >{{ entry.group.title }}</span>

          <span class="todo-group-count">{{ entry.count }}</span>
          <button
            class="todo-act todo-edit"
            title="编辑分组标题"
            @click="startGroupEdit(entry.group)"
          >✎</button>
        </div>

        <div
          v-else
          class="todo-item"
          :class="[
            entry.item.status,
            {
              'is-child': entry.groupId != null,
              'is-dragging': draggingId === entry.item.id,
              'drop-target': dragOverId === entry.item.id && draggingId !== entry.item.id,
            },
          ]"
          :data-todo-id="entry.item.id"
          @pointerdown="beginItemDrag(entry.item, $event)"
          @mousedown="beginItemMouseDrag(entry.item, $event)"
          @pointerenter="setDragOver(entry.item.id)"
          @pointerleave="clearDragOver(entry.item.id)"
          @mouseenter="showTodoTextTooltip($event, entry.item.text)"
          @mouseleave="hideTodoTextTooltip"
        >
          <button
            class="todo-status"
            :class="entry.item.status"
            :title="statusLabel[entry.item.status]"
            :aria-label="`状态：${statusLabel[entry.item.status]}，点击切换`"
            @click="cycleStatus(entry.item.id)"
            @keydown="onStatusKeydown($event, entry.item.id)"
          >
            <span v-if="entry.item.status === 'done'" class="todo-check">✓</span>
            <span v-else-if="entry.item.status === 'doing'" class="todo-dot"></span>
          </button>

          <input
            v-if="editingId === entry.item.id"
            v-model="editDraft"
            class="todo-edit-input"
            @blur="saveEdit(entry.item.id)"
            @keydown="onEditKeydown($event, entry.item.id)"
          />
          <span
            v-else
            class="todo-text"
            tabindex="0"
            :aria-label="`${entry.item.text}。双击编辑，Alt 加上下方向键移动`"
            @focus="showTodoTextTooltip($event, entry.item.text)"
            @blur="hideTodoTextTooltip"
            @click="showTodoTextTooltip($event, entry.item.text)"
            @keydown.alt.up.prevent="moveItemByKeyboard(entry.item.id, -1)"
            @keydown.alt.down.prevent="moveItemByKeyboard(entry.item.id, 1)"
            @keydown.escape="hideTodoTextTooltip"
            @dblclick="startEdit(entry.item.id)"
          >{{ entry.item.text }}</span>

          <button
            v-if="entry.groupId != null"
            class="todo-act todo-leave"
            title="移出分组"
            @click="leaveGroup(entry.item)"
          >↗</button>
          <button class="todo-act todo-edit" title="编辑" @click="startEdit(entry.item.id)">✎</button>
          <button class="todo-act todo-del" title="删除" @click="removeItem(entry.item.id)">✕</button>
        </div>
      </template>

      <div
        v-if="draggingItem && canUngroupDragged"
        class="todo-ungroup-zone"
        data-todo-ungroup
      >拖到这里移出分组</div>

      <div v-if="visibleEntries.length === 0" class="todo-empty">
        {{ tab === 'done' ? '还没有完成的待办' : '暂无待办，添加一条吧 ✍️' }}
      </div>
    </div>

    <!-- Fixed add slot keeps both tabs at the same height -->
    <div class="todo-add-slot">
      <div v-if="tab === 'active'" class="todo-add-row">
        <button class="todo-add-btn" title="添加" @click="addItem">＋</button>
        <input
          ref="addInputRef"
          v-model="draft"
          class="todo-add-input"
          placeholder="添加待办..."
          @keydown="onAddKeydown"
        />
      </div>
      <button v-else type="button" class="todo-add-switch" @click="switchToActiveAndAdd">
        ＋ 到待办页添加
      </button>
    </div>

    <!-- Status legend -->
    <div class="todo-legend">
      <span>○ 待办</span>
      <span class="lg-doing">● 进行中</span>
      <span class="lg-done">✓ 完成</span>
    </div>

    <div class="todo-resize-controls">
      <button
        type="button"
        class="todo-resize-handle todo-resize-right"
        :aria-label="`调整宽度，当前 ${displayWidth} 像素，使用左右方向键`"
        title="拖动调整宽度"
        @pointerdown="beginResize($event, 'width')"
        @keydown="nudgeResize($event, 'width')"
      />
      <button
        type="button"
        class="todo-resize-handle todo-resize-bottom"
        :aria-label="`调整高度，当前 ${displayHeight} 像素，使用上下方向键`"
        title="拖动调整高度"
        @pointerdown="beginResize($event, 'height')"
        @keydown="nudgeResize($event, 'height')"
      />
      <button
        type="button"
        class="todo-resize-handle todo-resize-corner"
        :aria-label="`调整宽高，当前 ${displayWidth} × ${displayHeight}，使用方向键`"
        title="拖动调整宽高"
        @pointerdown="beginResize($event, 'both')"
        @keydown="nudgeResize($event, 'both')"
      >
        <span aria-hidden="true" />
      </button>
    </div>
  </div>

  <Teleport to="body">
    <Transition name="todo-tooltip">
      <div
        v-if="todoTooltip?.visible"
        class="todo-text-tooltip"
        :class="{ 'is-above': todoTooltip.placement === 'above' }"
        :style="{ left: todoTooltip.left + 'px', top: todoTooltip.top + 'px' }"
        role="tooltip"
      >{{ todoTooltip.text }}</div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 待办清单 — 白色清单纸卡（实体纸张：明暗主题下都保持浅色，不反转） */
.todo-pad {
  position: absolute;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-md);
  overflow: hidden;
  z-index: 56;
}
.todo-pad.is-resizing { user-select: none; }

.todo-resize-controls {
  position: absolute;
  z-index: 30;
  inset: 26px 0 0;
  pointer-events: none;
}
.todo-resize-handle {
  position: absolute;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-ink-3);
  pointer-events: auto;
  touch-action: none;
}
.todo-resize-handle::before {
  content: "";
  position: absolute;
  background: color-mix(in srgb, var(--color-primary) 56%, transparent);
  opacity: 0;
  transition: opacity 140ms ease;
}
.todo-resize-handle:hover::before,
.todo-resize-handle:focus-visible::before,
.is-resizing .todo-resize-handle::before { opacity: 1; }
.todo-resize-right {
  top: 0;
  right: 0;
  bottom: 8px;
  width: 7px;
  cursor: ew-resize;
}
.todo-resize-right::before {
  top: 12px;
  right: 2px;
  bottom: 12px;
  width: 1px;
}
.todo-resize-bottom {
  right: 8px;
  bottom: 0;
  left: 0;
  height: 7px;
  cursor: ns-resize;
}
.todo-resize-bottom::before {
  right: 12px;
  bottom: 2px;
  left: 12px;
  height: 1px;
}
.todo-resize-corner {
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
.todo-resize-corner span {
  width: 8px;
  height: 8px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  opacity: 0;
  transition: opacity 140ms ease, color 140ms ease;
}
.todo-pad:hover .todo-resize-corner span { opacity: 0.28; }
.todo-resize-corner:hover span,
.todo-resize-corner:focus-visible span,
.is-resizing .todo-resize-corner span {
  color: var(--color-primary);
  opacity: 1;
}

/* Header tabs — 待办 / 已完成 分段切换 */
.todo-tabs {
  display: flex;
  gap: 2px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: var(--radius-sm);
  padding: 2px;
}
.todo-tab {
  border: none;
  background: transparent;
  border-radius: 5px;
  padding: 1px 7px;
  font-size: 0.62rem;
  font-weight: 700;
  color: var(--color-ink-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 3px;
  transition: all 0.15s;
  font-family: inherit;
  white-space: nowrap;
}
.todo-tab:hover { color: var(--color-ink); }
.todo-tab.active {
  background: var(--color-paper);
  color: var(--color-ink);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}
.todo-tab .tab-count {
  font-size: 0.55rem;
  color: var(--color-ink-3);
  min-width: 13px;
  text-align: center;
}
.todo-tab.active .tab-count { color: var(--color-primary); }

/* List — fixed viewport across both tabs */
.todo-list {
  position: relative;
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.todo-item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  height: auto;
  padding: 4px;
  border-radius: 6px;
  transition: background 0.15s;
  flex-shrink: 0;
  cursor: grab;
  user-select: none;
}
.todo-item:active { cursor: grabbing; }
.todo-item:hover { background: rgba(0, 0, 0, 0.035); }
.todo-item.is-child {
  position: relative;
  padding-left: 21px;
}
.todo-item.is-child::before {
  content: "";
  position: absolute;
  left: 9px;
  top: -3px;
  bottom: -3px;
  width: 1px;
  background: color-mix(in srgb, var(--color-border) 72%, transparent);
}
.todo-item.is-dragging { opacity: 0.35; }
.todo-item.drop-target {
  background: var(--color-primary-soft);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 42%, transparent);
}

.todo-group-header {
  height: 28px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 4px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--color-ink) 4%, transparent);
  flex-shrink: 0;
}
.todo-group-header:hover { background: color-mix(in srgb, var(--color-ink) 7%, transparent); }
.todo-group-header.drop-target {
  background: var(--color-primary-soft);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 42%, transparent);
}
.todo-group-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--color-ink);
  cursor: text;
  font-size: 0.71rem;
  font-weight: 720;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.todo-group-title-input {
  min-width: 0;
  flex: 1;
  height: 21px;
  padding: 0 5px;
  border: 1px solid var(--color-primary);
  border-radius: 5px;
  outline: none;
  background: var(--color-surface);
  color: var(--color-ink);
  font-family: inherit;
  font-size: 0.7rem;
}

.todo-group-toggle {
  width: 14px;
  height: 18px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--color-ink-3);
  cursor: pointer;
}
.todo-group-toggle:hover { color: var(--color-ink); background: rgba(0, 0, 0, 0.04); }
.todo-group-toggle svg {
  width: 11px;
  height: 11px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 150ms ease;
}
.todo-group-toggle[aria-expanded="true"] svg { transform: rotate(90deg); }
.todo-group-count {
  min-width: 16px;
  padding: 1px 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-ink) 6%, transparent);
  color: var(--color-ink-3);
  font-size: 0.54rem;
  text-align: center;
  flex-shrink: 0;
}
.todo-drag-tip {
  position: absolute;
  z-index: 2;
  top: 3px;
  right: 10px;
  left: 10px;
  margin: 0;
  padding: 4px 7px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--color-surface) 92%, transparent);
  color: var(--color-ink-2);
  box-shadow: 0 3px 10px rgba(15, 23, 42, 0.08);
  font-size: 0.59rem;
  text-align: center;
  pointer-events: none;
}
.todo-ungroup-zone {
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 4px;
  border: 1px dashed color-mix(in srgb, var(--color-ink-3) 36%, transparent);
  border-radius: 6px;
  color: var(--color-ink-3);
  font-size: 0.6rem;
}
.todo-ungroup-zone:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

/* Status dot — 三态循环：○ 待办 → ● 进行中 → ✓ 已完成 */
.todo-status {
  position: relative;
  width: 24px; height: 24px;
  border-radius: 50%;
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 0;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: all 0.18s;
  font-family: inherit;
}
.todo-status::before {
  content: "";
  width: 15px;
  height: 15px;
  border: 1.8px solid var(--color-ink-3);
  border-radius: 50%;
}
.todo-status.doing {
  background: color-mix(in srgb, var(--status-idle) 18%, transparent);
}
.todo-status.doing::before {
  border-color: var(--status-idle);
  background: var(--status-idle);
}
.todo-status.done {
  background: color-mix(in srgb, var(--color-primary) 15%, transparent);
}
.todo-status.done::before {
  border-color: var(--color-primary);
  background: var(--color-primary);
}
.todo-check {
  font-size: 9px; font-weight: 800;
  color: #fff; line-height: 1;
  position: absolute;
}
.todo-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: #fff;
  animation: todo-pulse 1.2s ease infinite;
  position: absolute;
}
@keyframes todo-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

/* Text */
.todo-text {
  flex: 1;
  min-width: 0;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 0.75rem;
  line-height: 1.35;
  color: var(--color-ink);
  overflow-wrap: anywhere;
  white-space: normal;
  cursor: pointer;
  user-select: none;
}
.todo-item.doing .todo-text {
  color: var(--color-ink);
  font-weight: 600;
}
.todo-item.done .todo-text {
  color: var(--color-ink-3);
  text-decoration: line-through;
}

.todo-text-tooltip {
  position: fixed;
  z-index: 5000;
  width: max-content;
  max-width: min(320px, calc(100vw - 24px));
  padding: 9px 11px;
  border: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-surface) 94%, transparent);
  backdrop-filter: blur(14px) saturate(1.2);
  -webkit-backdrop-filter: blur(14px) saturate(1.2);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.18);
  color: var(--color-ink);
  font-size: 0.72rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  pointer-events: none;
}
.todo-text-tooltip.is-above { transform: translateY(-100%); }
.todo-tooltip-enter-active,
.todo-tooltip-leave-active { transition: opacity 120ms ease, transform 120ms ease; }
.todo-tooltip-enter-from,
.todo-tooltip-leave-to { opacity: 0; }
.todo-tooltip-enter-from:not(.is-above),
.todo-tooltip-leave-to:not(.is-above) { transform: translateY(-3px); }
.todo-tooltip-enter-from.is-above,
.todo-tooltip-leave-to.is-above { transform: translateY(calc(-100% + 3px)); }

/* Hover actions — 编辑 / 删除 */
.todo-act {
  width: 24px; height: 24px;
  border: none; border-radius: 4px;
  background: transparent;
  color: var(--color-ink-3);
  font-size: 10px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  opacity: 0;
  padding: 0;
  flex-shrink: 0;
  transition: opacity 0.15s, background 0.15s, color 0.15s;
  font-family: inherit;
}
.todo-item:hover .todo-act,
.todo-group-header:hover .todo-act,
.todo-act:focus-visible { opacity: 1; }
@media (hover: none) {
  .todo-act { opacity: 0.72; }
  .todo-edit { display: none; }
}
.todo-edit:hover { background: var(--color-primary-soft); color: var(--color-primary); }
.todo-leave:hover { background: var(--color-primary-soft); color: var(--color-primary); }
.todo-del:hover { background: color-mix(in srgb, var(--color-danger) 10%, transparent); color: var(--color-danger); }

/* Inline edit input */
.todo-edit-input {
  flex: 1;
  min-width: 0;
  height: 20px;
  border: 1.5px solid var(--color-primary);
  border-radius: 5px;
  padding: 0 4px;
  font-size: 0.75rem;
  outline: none;
  font-family: inherit;
  background: var(--color-surface);
  color: var(--color-ink);
}

/* Empty state */
.todo-empty {
  height: 52px;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.72rem;
  color: var(--color-ink-3);
  user-select: none;
}

/* Add row — 紧凑 */
.todo-add-slot {
  height: 34px;
  flex-shrink: 0;
  border-top: 1px dashed var(--color-line);
}
.todo-add-row {
  height: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
}
.todo-add-switch {
  width: 100%;
  height: 100%;
  padding: 0 10px;
  border: 0;
  background: transparent;
  color: var(--color-ink-3);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.68rem;
  text-align: center;
}
.todo-add-switch:hover { color: var(--color-primary); }
.todo-add-btn {
  width: 16px; height: 16px;
  border: none; border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  font-size: 11px; line-height: 1;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  padding: 0;
  flex-shrink: 0;
  transition: background 0.2s, transform 0.2s;
  font-family: inherit;
}
.todo-add-btn:hover { background: var(--color-primary-hover); transform: scale(1.12); }
.todo-add-input {
  flex: 1;
  min-width: 0;
  border: none; outline: none;
  background: transparent;
  font-size: 0.75rem;
  color: var(--color-ink);
  font-family: inherit;
  padding: 2px 0;
}
.todo-add-input::placeholder { color: var(--color-ink-3); }

/* Status legend — 一行说明 */
.todo-legend {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 4px 0 7px;
  border-top: 1px solid var(--color-line);
  font-size: 0.58rem;
  color: var(--color-ink-3);
  user-select: none;
}
.todo-legend .lg-doing { color: var(--status-idle); font-weight: 700; }
.todo-legend .lg-done { color: var(--color-primary); font-weight: 700; }
</style>
