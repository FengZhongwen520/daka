<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import DragBar from '../common/DragBar.vue'

type TodoStatus = 'todo' | 'doing' | 'done'

interface TodoItem {
  id: number
  text: string
  status: TodoStatus
}

const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()

// Persistence keys (per instance)
const key = `todo${props.widgetId != null ? '-' + props.widgetId : ''}`
const itemsKey = `${key}-items`
const titleKey = `${key}-title`

// Items — first run seeds 3 demo items to show the 3 states
const DEFAULT_ITEMS: TodoItem[] = [
  { id: 1, text: '用待办记录你的打卡', status: 'todo' },
  { id: 2, text: '点击圆圈切换状态', status: 'doing' },
  { id: 3, text: '完成一项任务 ✓', status: 'done' },
]
let parsedItems: TodoItem[] | null = null
try {
  const raw = localStorage.getItem(itemsKey)
  parsedItems = raw ? JSON.parse(raw) : null
} catch { /* 忽略损坏数据 */ }
const items = ref<TodoItem[]>(parsedItems ?? DEFAULT_ITEMS)
let nextId = items.value.reduce((m, i) => Math.max(m, i.id), 0) + 1
watch(items, (v) => localStorage.setItem(itemsKey, JSON.stringify(v)), { deep: true })

// Title
const savedTitle = JSON.parse(localStorage.getItem(titleKey) || 'null')
const title = ref(savedTitle ?? '✅ 待办')
watch(title, (v) => localStorage.setItem(titleKey, JSON.stringify(v)))

const statusLabel: Record<TodoStatus, string> = {
  todo: '待办',
  doing: '进行中',
  done: '已完成',
}

// Tabs: 待办(含进行中) / 已完成 — 已完成单独分页
const tab = ref<'active' | 'done'>('active')
const activeItems = computed(() => items.value.filter(i => i.status !== 'done'))
const doneItems = computed(() => items.value.filter(i => i.status === 'done'))
const visibleItems = computed(() => tab.value === 'done' ? doneItems.value : activeItems.value)
const activeCount = computed(() => activeItems.value.length)
const doneCount = computed(() => doneItems.value.length)

// Add / delete / cycle status / inline edit
const draft = ref('')
const editingId = ref<number | null>(null)
const editDraft = ref('')

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
}
function cycleStatus(id: number) {
  const item = items.value.find(i => i.id === id)
  if (!item) return
  item.status = item.status === 'todo' ? 'doing' : item.status === 'doing' ? 'done' : 'todo'
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

// Drag
const posKey = `todo-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const { x, y, onDragStart } = useWidgetDrag(props, posKey, 340, 140)
</script>

<template>
  <div class="todo-pad" :style="{ left: x + 'px', top: y + 'px' }">
    <!-- Header: title + progress badge -->
    <DragBar
      variant="header"
      :on-drag-start="onDragStart"
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
      <div
        v-for="item in visibleItems"
        :key="item.id"
        class="todo-item"
        :class="item.status"
      >
        <button
          class="todo-status"
          :class="item.status"
          :title="statusLabel[item.status]"
          @click="cycleStatus(item.id)"
          @keydown="onStatusKeydown($event, item.id)"
        >
          <span v-if="item.status === 'done'" class="todo-check">✓</span>
          <span v-else-if="item.status === 'doing'" class="todo-dot"></span>
        </button>

        <input
          v-if="editingId === item.id"
          v-model="editDraft"
          class="todo-edit-input"
          @blur="saveEdit(item.id)"
          @keydown="onEditKeydown($event, item.id)"
        />
        <span
          v-else
          class="todo-text"
          :title="'双击编辑'"
          @dblclick="startEdit(item.id)"
        >{{ item.text }}</span>

        <button class="todo-act todo-edit" title="编辑" @click="startEdit(item.id)">✎</button>
        <button class="todo-act todo-del" title="删除" @click="removeItem(item.id)">✕</button>
      </div>

      <div v-if="visibleItems.length === 0" class="todo-empty">
        {{ tab === 'done' ? '还没有完成的待办' : '暂无待办，添加一条吧 ✍️' }}
      </div>
    </div>

    <!-- Compact add row (仅待办 tab) -->
    <div v-if="tab === 'active'" class="todo-add-row">
      <button class="todo-add-btn" title="添加" @click="addItem">＋</button>
      <input
        v-model="draft"
        class="todo-add-input"
        placeholder="添加待办..."
        @keydown="onAddKeydown"
      />
    </div>

    <!-- Status legend -->
    <div class="todo-legend">
      <span>○ 待办</span>
      <span class="lg-doing">● 进行中</span>
      <span class="lg-done">✓ 完成</span>
    </div>
  </div>
</template>

<style scoped>
/* 待办清单 — 白色清单纸卡（实体纸张：明暗主题下都保持浅色，不反转） */
.todo-pad {
  position: absolute;
  width: 240px;
  display: flex;
  flex-direction: column;
  background: var(--color-paper);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-paper);
  overflow: hidden;
  z-index: 56;
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

/* List — 限高 6 项，超出内滚 */
.todo-list {
  max-height: 168px;
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
  height: 26px;
  padding: 0 4px;
  border-radius: 6px;
  transition: background 0.15s;
  flex-shrink: 0;
}
.todo-item:hover { background: rgba(0, 0, 0, 0.035); }

/* Status dot — 三态循环：○ 待办 → ● 进行中 → ✓ 已完成 */
.todo-status {
  width: 15px; height: 15px;
  border-radius: 50%;
  border: 1.8px solid var(--color-ink-3);
  background: transparent;
  cursor: pointer;
  padding: 0;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: all 0.18s;
  font-family: inherit;
}
.todo-status.doing {
  border-color: var(--status-idle);
  background: var(--status-idle);
}
.todo-status.done {
  border-color: var(--color-primary);
  background: var(--color-primary);
}
.todo-check {
  font-size: 9px; font-weight: 800;
  color: #fff; line-height: 1;
}
.todo-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: #fff;
  animation: todo-pulse 1.2s ease infinite;
}
@keyframes todo-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

/* Text */
.todo-text {
  flex: 1;
  min-width: 0;
  font-size: 0.75rem;
  color: var(--color-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* Hover actions — 编辑 / 删除 */
.todo-act {
  width: 16px; height: 16px;
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
.todo-item:hover .todo-act { opacity: 1; }
.todo-edit:hover { background: var(--color-primary-soft); color: var(--color-primary); }
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
.todo-add-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-top: 1px dashed var(--color-line);
}
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
