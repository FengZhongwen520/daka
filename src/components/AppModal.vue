<script setup lang="ts">
import { ref, watch, nextTick, inject, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { addProject, updateProject, getProjects } from '../db'
import { PRESET_COLORS, PRESET_ICONS } from '../types'

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
      ElMessage.error('加载项目信息失败')
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
      ElMessage.success('项目创建成功')
    } else if (editingProjectId.value != null) {
      await updateProject(editingProjectId.value, {
        name: trimmed,
        color: color.value,
        icon: icon.value,
      })
      ElMessage.success('项目已更新')
    }
    closeModal()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="true"
    :title="modalMode === 'add' ? '新增打卡项目' : '编辑项目'"
    width="420px"
    :close-on-click-modal="false"
    @close="closeModal"
  >
    <el-form label-position="top" @submit.prevent="onSubmit">
      <el-form-item label="项目名称">
        <el-input
          ref="nameInput"
          v-model="name"
          placeholder="例如：每天跑步"
          size="large"
          @keyup.enter="onSubmit"
        />
      </el-form-item>

      <el-form-item label="颜色">
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
      </el-form-item>

      <el-form-item label="图标">
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
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="closeModal">取消</el-button>
      <el-button
        type="primary"
        :disabled="!name.trim() || saving"
        :loading="saving"
        @click="onSubmit"
      >
        {{ saving ? '保存中' : '确定' }}
      </el-button>
    </template>
  </el-dialog>
</template>
