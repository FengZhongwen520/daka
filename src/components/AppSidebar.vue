<script setup lang="ts">
import { ref, onMounted, inject, watch, type Ref } from 'vue'
import { selectedProjectId, selectProject } from '../store'
import { getProjects, deleteProject } from '../db'
import { handleExport, handleImport } from '../utils/io'
import type { Project } from '../types'

const openAddModal = inject<() => void>('openAddModal')!
const showModal = inject<Ref<boolean>>('showModal')!

const projects = ref<Project[]>([])
const fileInput = ref<HTMLInputElement>()

async function loadProjects() {
  try {
    console.log('[Sidebar] loadProjects start')
    projects.value = await getProjects()
    console.log('[Sidebar] loadProjects got:', projects.value.length, 'projects')
    if (!selectedProjectId.value && projects.value.length > 0) {
      selectProject(projects.value[0].id!)
    }
  } catch (e) {
    console.error('[Sidebar] loadProjects error:', e)
  }
}

async function onDelete(id: number, e: Event) {
  e.stopPropagation()
  if (!confirm('确定要删除这个项目吗？相关的打卡数据也会被清除。')) return
  await deleteProject(id)
  if (selectedProjectId.value === id) {
    selectedProjectId.value = null
  }
  await loadProjects()
  if (!selectedProjectId.value && projects.value.length > 0) {
    selectProject(projects.value[0].id!)
  }
}

function onImportClick() {
  fileInput.value?.click()
}

async function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    await handleImport(file)
    await loadProjects()
    if (projects.value.length > 0) {
      selectProject(projects.value[0].id!)
    }
    alert('数据导入成功！')
  } catch (err: any) {
    alert(err.message || '导入失败')
  }
  if (fileInput.value) fileInput.value.value = ''
}

onMounted(loadProjects)

watch(showModal, async (visible) => {
  console.log('[Sidebar] showModal changed to:', visible)
  if (!visible) await loadProjects()
})
</script>

<template>
  <aside class="app-sidebar">
    <div class="sidebar-projects">
      <div v-if="projects.length === 0" class="sidebar-empty">
        <span class="empty-icon">📋</span>
        <span>还没有打卡项目</span>
        <span>点击下方按钮创建</span>
      </div>

      <div
        v-for="p in projects"
        :key="p.id"
        class="sidebar-project-item"
        :class="{ active: selectedProjectId === p.id }"
        @click="selectProject(p.id!)"
      >
        <span class="project-color-dot" :style="{ background: p.color }"></span>
        <span class="project-icon">{{ p.icon }}</span>
        <span class="project-name">{{ p.name }}</span>
        <button class="project-delete" @click="onDelete(p.id!, $event)" title="删除项目">✕</button>
      </div>
    </div>

    <div class="sidebar-actions">
      <el-button type="primary" class="btn-block" @click="openAddModal">
        + 新增项目
      </el-button>
      <el-button class="btn-block" @click="handleExport">
        ↥ 导出数据
      </el-button>
      <el-button class="btn-block" @click="onImportClick">
        ↧ 导入数据
      </el-button>
      <input
        ref="fileInput"
        type="file"
        accept=".json"
        style="display: none"
        @change="onFileChange"
      />
    </div>
  </aside>
</template>
