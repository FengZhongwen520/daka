<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiDialog from './common/UiDialog.vue'
import { askConfirm, notify } from '../utils/feedback'
import {
  getProjectSyncCatalog,
  syncProjects,
  type ProjectSummary,
  type SyncDirection,
  type SyncStrategy,
} from '../services/projectSync'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  completed: []
}>()

const direction = ref<SyncDirection>('local-to-cloud')
const strategy = ref<SyncStrategy>('append')
const selectedIds = ref<number[]>([])
const localProjects = ref<ProjectSummary[]>([])
const cloudProjects = ref<ProjectSummary[]>([])
const loading = ref(false)
const syncing = ref(false)
const error = ref('')

const sourceProjects = computed(() => (
  direction.value === 'local-to-cloud' ? localProjects.value : cloudProjects.value
))
const targetProjects = computed(() => (
  direction.value === 'local-to-cloud' ? cloudProjects.value : localProjects.value
))
const conflicts = computed(() => {
  const targetIds = new Set(targetProjects.value.map(project => project.id))
  return sourceProjects.value.filter(project => (
    selectedIds.value.includes(project.id) && targetIds.has(project.id)
  ))
})

watch(() => props.modelValue, (open) => {
  if (!open) return
  selectedIds.value = []
  strategy.value = 'append'
  direction.value = 'local-to-cloud'
  error.value = ''
  void loadCatalog()
})

watch(direction, () => {
  selectedIds.value = []
  error.value = ''
})

async function loadCatalog() {
  loading.value = true
  error.value = ''
  try {
    const catalog = await getProjectSyncCatalog()
    localProjects.value = catalog.local
    cloudProjects.value = catalog.cloud
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '项目列表加载失败'
  } finally {
    loading.value = false
  }
}

function toggleAll(checked: boolean) {
  selectedIds.value = checked ? sourceProjects.value.map(project => project.id) : []
}

async function runSync() {
  if (selectedIds.value.length === 0 || syncing.value) return
  if (strategy.value === 'overwrite' && conflicts.value.length > 0) {
    const confirmed = await askConfirm(
      `以下项目 ID 已存在，将覆盖目标端同 ID 项目及关联组件数据：${conflicts.value.map(project => `${project.id} ${project.name}`).join('、')}`,
      '确认覆盖项目',
      { confirmText: '覆盖并同步', danger: true },
    )
    if (!confirmed) return
  }

  syncing.value = true
  error.value = ''
  try {
    const result = await syncProjects({
      direction: direction.value,
      projectIds: selectedIds.value,
      strategy: strategy.value,
    })
    notify(
      `同步完成：${result.projects} 个项目、${result.widgets} 个组件${result.skippedPhotos ? `，${result.skippedPhotos} 张云端照片引用无法在本地还原` : ''}`,
      'success',
    )
    emit('update:modelValue', false)
    emit('completed')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '项目同步失败'
  } finally {
    syncing.value = false
  }
}
</script>

<template>
  <UiDialog
    :model-value="modelValue"
    title="项目同步"
    width="680px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="sync-form">
      <section class="sync-section">
        <div class="sync-section-head">
          <strong>同步方向</strong>
          <small>云端项目同步到本地时，云端照片引用无法还原图片内容。</small>
        </div>
        <div class="sync-segments">
          <button type="button" :class="{ active: direction === 'local-to-cloud' }" @click="direction = 'local-to-cloud'">
            本地 → 云端
          </button>
          <button type="button" :class="{ active: direction === 'cloud-to-local' }" @click="direction = 'cloud-to-local'">
            云端 → 本地
          </button>
        </div>
      </section>

      <section class="sync-section">
        <div class="sync-section-head">
          <strong>选择项目</strong>
          <label class="sync-select-all">
            <input
              type="checkbox"
              :checked="selectedIds.length === sourceProjects.length && sourceProjects.length > 0"
              @change="toggleAll(($event.target as HTMLInputElement).checked)"
            />
            全选
          </label>
        </div>
        <div v-if="loading" class="sync-empty">正在读取项目…</div>
        <div v-else-if="sourceProjects.length === 0" class="sync-empty">
          {{ direction === 'local-to-cloud' ? '本地没有可同步项目' : '云端没有可同步项目' }}
        </div>
        <div v-else class="sync-project-list">
          <label v-for="project in sourceProjects" :key="project.id" class="sync-project">
            <input v-model="selectedIds" type="checkbox" :value="project.id" />
            <span class="sync-project-id">#{{ project.id }}</span>
            <span class="sync-project-name">{{ project.name }}</span>
            <span v-if="targetProjects.some(item => item.id === project.id)" class="sync-conflict">同 ID</span>
          </label>
        </div>
      </section>

      <section class="sync-section">
        <div class="sync-section-head">
          <strong>遇到相同项目 ID</strong>
          <small>覆盖会替换目标端对应项目及其关联组件数据。</small>
        </div>
        <div class="sync-strategies">
          <button type="button" :class="{ active: strategy === 'append' }" @click="strategy = 'append'">
            <strong>作为新项目增加</strong>
            <span>自动分配新项目 ID，不覆盖已有数据。</span>
          </button>
          <button type="button" class="danger" :class="{ active: strategy === 'overwrite' }" @click="strategy = 'overwrite'">
            <strong>覆盖同 ID 项目</strong>
            <span>同步前再次确认，覆盖后原项目数据不可恢复。</span>
          </button>
        </div>
      </section>

      <p v-if="error" class="sync-error">{{ error }}</p>
      <p v-else-if="conflicts.length" class="sync-warning">
        检测到 {{ conflicts.length }} 个同 ID 项目：{{ conflicts.map(project => project.name).join('、') }}
      </p>
    </div>

    <template #footer>
      <button type="button" class="ui-button" @click="emit('update:modelValue', false)">取消</button>
      <button
        type="button"
        class="ui-button ui-button-primary"
        :disabled="selectedIds.length === 0 || loading || syncing"
        @click="runSync"
      >{{ syncing ? '同步中…' : `同步 ${selectedIds.length} 个项目` }}</button>
    </template>
  </UiDialog>
</template>

<style scoped>
.sync-form { display: flex; flex-direction: column; gap: 18px; }
.sync-section { display: flex; flex-direction: column; gap: 10px; }
.sync-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.sync-section-head strong { color: var(--color-ink); font-size: .78rem; }
.sync-section-head small { color: var(--color-ink-3); font-size: .63rem; text-align: right; }
.sync-segments { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.sync-segments button, .sync-strategies button {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface);
  color: var(--color-ink-2);
  padding: 10px 12px;
  cursor: pointer;
  font-family: inherit;
}
.sync-segments button.active, .sync-strategies button.active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-ink);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 10%, transparent);
}
.sync-strategies { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.sync-strategies button { display: flex; flex-direction: column; gap: 4px; text-align: left; }
.sync-strategies button strong { font-size: .72rem; }
.sync-strategies button span { color: var(--color-ink-3); font-size: .62rem; line-height: 1.45; }
.sync-strategies button.danger.active { border-color: var(--color-danger); background: color-mix(in srgb, var(--color-danger) 7%, var(--color-surface)); }
.sync-project-list { max-height: 250px; overflow: auto; display: flex; flex-direction: column; gap: 6px; }
.sync-project {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border: 1px solid var(--color-line);
  border-radius: 8px;
  cursor: pointer;
}
.sync-project:hover { background: var(--color-surface-soft); }
.sync-project-id { color: var(--color-ink-3); font-size: .62rem; font-variant-numeric: tabular-nums; }
.sync-project-name { flex: 1; color: var(--color-ink); font-size: .73rem; font-weight: 650; }
.sync-conflict { color: var(--color-danger); font-size: .58rem; }
.sync-select-all { display: flex; align-items: center; gap: 5px; color: var(--color-ink-3); font-size: .65rem; }
.sync-empty { padding: 28px; text-align: center; color: var(--color-ink-3); font-size: .7rem; }
.sync-error { color: var(--color-danger); font-size: .68rem; }
.sync-warning { color: var(--color-danger); font-size: .68rem; line-height: 1.5; }
</style>
