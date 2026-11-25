<script setup lang="ts">
import { ref, watch, nextTick, inject, type Ref } from 'vue'
import { addProject, updateProject, getProjects } from '../db'
import { PRESET_COLORS, PRESET_ICONS } from '../types'
import { notify } from '../utils/feedback'
import UiDialog from './common/UiDialog.vue'

const closeModal = inject<() => void>('closeModal')!
const modalMode = inject<Ref<'add' | 'edit'>>('modalMode')!
const editingProjectId = inject<Ref<number | null>>('editingProjectId')!

const name = ref('')
const color = ref(PRESET_COLORS[0])
const icon = ref(PRESET_ICONS[0])
const saving = ref(false)
const nameInput = ref<HTMLInputElement>()

watch(modalMode, async (mode) => {
  if (mode === 'add') {
    name.value = ''
    color.value = PRESET_COLORS[0]
    icon.value = PRESET_ICONS[0]
  } else if (mode === 'edit' && editingProjectId.value != null) {
    try {
      const projects = await getProjects()
      const p = projects.find(p => p.id === editingProjectId.value)
      if (p) {
        name.value = p.name
        color.value = p.color
        icon.value = p.icon
      }
    } catch (e) {
      notify('加载项目信息失败', 'error')
    }
  }
  await nextTick()
  nameInput.value?.focus()
}, { immediate: true })

async function onSubmit() {
  const trimmed = name.value.trim()
  if (!trimmed) return

  saving.value = true

  try {
    if (modalMode.value === 'add') {
      await addProject({ name: trimmed, color: color.value, icon: icon.value })
      notify('项目创建成功', 'success')
    } else if (editingProjectId.value != null) {
      await updateProject(editingProjectId.value, {
        name: trimmed,
        color: color.value,
        icon: icon.value,
      })
      notify('项目已更新', 'success')
    }
    closeModal()
  } catch (e: any) {
    notify(e?.message || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UiDialog
    :model-value="true"
    :title="modalMode === 'add' ? '新增打卡项目' : '编辑项目'"
    width="420px"
    :close-on-click-modal="false"
    @update:model-value="closeModal"
  >
    <form class="project-form" @submit.prevent="onSubmit">
      <label class="project-field">
        <span>项目名称</span>
        <input
          ref="nameInput"
          v-model="name"
          class="ui-input"
          placeholder="例如：每天跑步"
          @keyup.enter="onSubmit"
        />
      </label>

      <div class="project-field">
        <span>颜色</span>
        <div class="color-picker">
          <button
            v-for="c in PRESET_COLORS"
            :key="c"
            class="color-dot"
            :class="{ selected: color === c }"
            :style="{ background: c }"
            type="button"
            @click="color = c"
          ></button>
        </div>
      </div>

      <div class="project-field">
        <span>图标</span>
        <div class="icon-picker">
          <button
            v-for="ico in PRESET_ICONS"
            :key="ico"
            class="icon-option"
            :class="{ selected: icon === ico }"
            type="button"
            @click="icon = ico"
          >
            {{ ico }}
          </button>
        </div>
      </div>
    </form>

    <template #footer>
      <button type="button" class="ui-button" @click="closeModal">取消</button>
      <button
        type="button"
        class="ui-button ui-button-primary"
        :disabled="!name.trim() || saving"
        @click="onSubmit"
      >
        {{ saving ? '保存中' : '确定' }}
      </button>
    </template>
  </UiDialog>
</template>

<style scoped>
.project-form { display: flex; flex-direction: column; gap: 16px; }
.project-field { display: flex; flex-direction: column; gap: 8px; }
.project-field > span { color: var(--color-ink-2); font-size: 0.72rem; font-weight: 650; }
</style>
