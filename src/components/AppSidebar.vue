<script setup lang="ts">
import { ref, computed, onMounted, inject, watch, type Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { selectedProjectId, selectProject, weatherWallpaper, customWallpaper } from '../store'
import { getProjects, deleteProject, updateProject } from '../db'
import { handleExport, handleImport } from '../utils/io'
import { db } from '../db'
import type { Project } from '../types'

const openAddModal = inject<() => void>('openAddModal')!
const showModal = inject<Ref<boolean>>('showModal')!
const MAX_PROJECTS = 3

const projects = ref<Project[]>([])
const fileInput = ref<HTMLInputElement>()
const collapsed = ref(true)
const activeModule = ref('')

const currentProject = computed(() => projects.value.find(p => p.id === selectedProjectId.value))

async function loadProjects() {
  projects.value = await getProjects()
  // Restore last-used project, or fallback to first
  const saved = localStorage.getItem('last-project')
  const lastId = saved ? parseInt(saved) : 0
  if (lastId && projects.value.some(p => p.id === lastId)) {
    selectProject(lastId)
  } else if (!selectedProjectId.value && projects.value.length > 0) {
    selectProject(projects.value[0].id!)
  }
}

async function onDelete(id: number, e: Event) {
  e.stopPropagation()
  if (!confirm('确定删除？相关打卡数据也会清除。')) return
  await deleteProject(id)
  if (selectedProjectId.value === id) selectedProjectId.value = null
  await loadProjects()
  if (!selectedProjectId.value && projects.value.length > 0) selectProject(projects.value[0].id!)
}

function onAddClick() {
  if (projects.value.length >= MAX_PROJECTS) {
    ElMessage.warning(`最多只能创建 ${MAX_PROJECTS} 个项目`)
    return
  }
  openAddModal()
}

function openWelcome() {
  localStorage.removeItem('dake-welcomed')
  location.reload()
}

async function onClearData() {
  try {
    await ElMessageBox.confirm('⚠️ 将清除当前项目所有数据及 IndexedDB 全部记录，数据将彻底丢失且不可恢复！确定继续？', '危险操作', {
      confirmButtonText: '我已知晓，确定清除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    // Clear ALL IndexedDB data
    await Promise.all([
      db.projects.clear(), db.checkins.clear(), db.photos.clear(),
      db.memos.clear(), db.sites.clear(), db.widgets.clear(), db.wallpaper.clear(),
    ])
    // Clear all localStorage
    localStorage.clear()
    ElMessage.success('全部数据已清除')
    location.reload()
  } catch { /* cancelled */ }
}

const wallpaperInput = ref<HTMLInputElement>()

function toggleWeatherWallpaper() {
  if (!weatherWallpaper.value) {
    ElMessage.warning('需要开启天气组件才能使用天气壁纸')
  }
  weatherWallpaper.value = !weatherWallpaper.value
}

function triggerWallpaper() {
  if (weatherWallpaper.value) {
    ElMessage.warning('请先关闭天气壁纸开关')
    return
  }
  wallpaperInput.value?.click()
}

async function onWallpaperChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    customWallpaper.value = reader.result as string
    activeModule.value = ''
    ElMessage.success('壁纸已更新')
  }
  reader.readAsDataURL(file)
  if (wallpaperInput.value) wallpaperInput.value.value = ''
}

function toggleModule(name: string) {
  activeModule.value = activeModule.value === name ? '' : name
}

function onImportClick() { fileInput.value?.click() }

function editProjectName(p: Project) {
  const name = prompt('输入新名称：', p.name)
  if (name && name.trim()) {
    updateProject(p.id!, { name: name.trim() })
    loadProjects()
  }
}

async function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    await handleImport(file)
    await loadProjects()
    if (projects.value.length > 0) selectProject(projects.value[0].id!)
    ElMessage.success('导入成功')
  } catch (err: any) {
    ElMessage.error(err.message || '导入失败')
  }
  if (fileInput.value) fileInput.value.value = ''
}

onMounted(loadProjects)

watch(showModal, async (visible) => {
  if (!visible) await loadProjects()
})
</script>

<template>
  <aside class="app-sidebar" :class="{ collapsed }">
    <!-- Brand -->
    <div class="sidebar-brand">
      <img src="/daka.png" alt="Dake" class="brand-logo" />
    </div>

    <!-- Sidebar menu (3 items) -->
    <div v-show="!collapsed" class="sidebar-menu">
      <!-- Current project indicator -->
      <div class="sidebar-current-project" v-if="currentProject">
        <span class="project-color-dot" :style="{ background: currentProject.color }"></span>
        <span class="project-icon">{{ currentProject.icon }}</span>
        <span class="project-name">{{ currentProject.name }}</span>
      </div>

      <!-- Projects -->
      <div class="sidebar-menu-item" :class="{ active: activeModule === 'projects' }" @click="toggleModule('projects')">
        <span class="menu-icon">📋</span>
        <span class="menu-label">项目</span>
      </div>
      <div v-if="activeModule === 'projects'" class="sidebar-bubble">
        <div class="bubble-project-list">
          <div
            v-for="p in projects"
            :key="p.id"
            class="bubble-project-item"
            :class="{ active: selectedProjectId === p.id }"
          >
            <span class="project-color-dot" :style="{ background: p.color }" @click="selectProject(p.id!); activeModule = ''"></span>
            <span @click="selectProject(p.id!); activeModule = ''">{{ p.icon }} {{ p.name }}</span>
            <button class="bubble-project-edit" @click.stop="editProjectName(p)" title="重命名">✎</button>
            <button class="bubble-project-del" @click.stop="onDelete(p.id!, $event)" title="删除">✕</button>
          </div>
          <div v-if="projects.length === 0" class="bubble-empty">暂无项目</div>
        </div>
        <el-button class="btn-block btn-sm" @click="onAddClick" :disabled="projects.length >= MAX_PROJECTS">
          {{ projects.length >= MAX_PROJECTS ? '项目已满' : `+ 新增 (${projects.length}/${MAX_PROJECTS})` }}
        </el-button>
        <div class="bubble-row">
          <button class="sidebar-text-btn" @click="handleExport">↥ 导出</button>
          <button class="sidebar-text-btn" @click="onImportClick">↧ 导入</button>
        </div>
        <input ref="fileInput" type="file" accept=".json" style="display:none" @change="onFileChange" />
      </div>

            <!-- Wallpaper -->
      <div class="sidebar-menu-item" :class="{ active: activeModule === 'wallpaper' }" @click="toggleModule('wallpaper')">
        <span class="menu-icon">🖼</span>
        <span class="menu-label">壁纸</span>
      </div>
      <div v-if="activeModule === 'wallpaper'" class="sidebar-bubble">
        <div class="bubble-row">
          <span class="bubble-label">天气壁纸</span>
          <el-switch :model-value="weatherWallpaper" size="small" @change="toggleWeatherWallpaper" />
        </div>
        <div class="bubble-row">
          <span class="bubble-label">自定义壁纸</span>
          <el-button size="small" @click="triggerWallpaper">上传图片</el-button>
        </div>
        <input ref="wallpaperInput" type="file" accept="image/*" style="display:none" @change="onWallpaperChange" />
        <button v-if="customWallpaper" class="sidebar-text-btn" @click="customWallpaper = ''">清除自定义壁纸</button>
      </div>

      <!-- Help -->
      <div class="sidebar-menu-item" :class="{ active: activeModule === 'help' }" @click="toggleModule('help')">
        <span class="menu-icon">❓</span>
        <span class="menu-label">帮助</span>
      </div>
      <div v-if="activeModule === 'help'" class="sidebar-bubble">
        <p class="bubble-title">✊ Dake 哒咔</p>
        <p class="bubble-desc">浏览器导航页，你的个人工作台。</p>
        <p class="bubble-ver">v2.0 拖拽组件、多项目<br>v1.5 天气、白噪音、番茄钟<br>v1.0 基础打卡、导入导出</p>
        <el-button class="btn-block btn-sm" @click="openWelcome">重新查看引导</el-button>
      </div>

      <!-- Clear -->
      <div class="sidebar-menu-item danger" :class="{ active: activeModule === 'clear' }" @click="toggleModule('clear')">
        <span class="menu-icon">🗑</span>
        <span class="menu-label">清除</span>
      </div>
      <div v-if="activeModule === 'clear'" class="sidebar-bubble">
        <p class="bubble-warn">清除当前项目全部数据</p>
        <el-button class="btn-block btn-sm" type="danger" @click="onClearData">确认清除</el-button>
      </div>


    </div>

    <!-- Sidebar toggle button -->
    <button class="sidebar-collapse-btn" @click="collapsed = !collapsed" :title="collapsed ? '展开侧边栏' : '收起侧边栏'">
      {{ collapsed ? '▶' : '◀' }}
    </button>
  </aside>
</template>

<style scoped>
.app-sidebar {
  width: 220px; background: #ecf0ee;
  border-right: 1px solid var(--color-border);
  display: flex; flex-direction: column; flex-shrink: 0; overflow: visible;
  transition: width 0.25s ease; position: relative;
}
.app-sidebar.collapsed { width: 0; border-right: none; overflow: visible; }

/* Brand */
.sidebar-brand {
  display: flex; align-items: center; gap: 6px;
  padding: 14px 10px 10px; flex-shrink: 0;
}
.brand-logo { height: 24px; width: auto; }

.sidebar-collapse-btn {
  position: absolute; right: -14px; top: 50%; transform: translateY(-50%);
  width: 32px; height: 72px; border-radius: 0 12px 12px 0;
  border: 2px solid #2DD4A8; border-left: none;
  background: #2DD4A8; cursor: pointer;
  font-size: 14px; color: #fff; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s; z-index: 10;
  box-shadow: 2px 0 14px rgba(45,212,168,0.35);
}
.app-sidebar:not(.collapsed) .sidebar-collapse-btn {
  background: #ecf0ee;
  color: #2DD4A8;
  border-color: #2DD4A8;
}
.sidebar-collapse-btn:hover {
  transform: translateY(-50%) scale(1.08);
  box-shadow: 2px 0 18px rgba(45,212,168,0.45);
}

/* Current project indicator */
.sidebar-current-project {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 12px; margin-bottom: 6px;
  border-radius: 10px; background: rgba(45,212,168,0.08);
}
.project-color-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.project-icon { font-size: 16px; flex-shrink: 0; }
.project-name { font-size: 13px; font-weight: 500; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Sidebar menu */
.sidebar-menu {
  flex: 1; padding: 10px; display: flex; flex-direction: column; gap: 2px;
}
.btn-block { width: 100%; }
.btn-sm { font-size: 12px; padding: 5px 10px; }

.sidebar-menu-item {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border-radius: 8px; cursor: pointer;
  transition: all 0.2s; position: relative;
}
.sidebar-menu-item:hover { background: rgba(0,0,0,0.04); }
.sidebar-menu-item.active { background: rgba(45,212,168,0.1); }
.menu-icon { font-size: 16px; width: 22px; text-align: center; flex-shrink: 0; }
.menu-label { font-size: 0.8rem; font-weight: 600; color: rgba(0,0,0,0.5); }
.sidebar-menu-item.danger .menu-label { color: rgba(231,76,60,0.5); }

/* Bubble pops to the RIGHT */
.sidebar-bubble {
  position: absolute; left: calc(100% + 8px); top: 0;
  width: 200px; padding: 10px;
  background: #fff; border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.12);
  z-index: 100; display: flex; flex-direction: column; gap: 6px;
}
.bubble-row { display: flex; gap: 4px; align-items: center; justify-content: space-between; }
.bubble-label { font-size: 0.72rem; color: #555; }
.sidebar-text-btn {
  flex: 1; padding: 6px 0; border: none; border-radius: 6px;
  background: rgba(0,0,0,0.04); cursor: pointer; font-size: 0.7rem;
  color: rgba(0,0,0,0.45); transition: all 0.2s; font-family: inherit;
  text-align: center;
}
.sidebar-text-btn:hover { background: rgba(0,0,0,0.08); color: rgba(0,0,0,0.7); }

.bubble-project-list { max-height: 120px; overflow-y: auto; }
.bubble-project-item {
  display: flex; align-items: center; gap: 6px; padding: 6px 8px;
  border-radius: 6px; cursor: pointer; font-size: 0.75rem; color: #444;
  transition: background 0.15s;
}
.bubble-project-item:hover { background: rgba(0,0,0,0.04); }
.bubble-project-item { gap: 4px; }
.bubble-project-item span { flex: 1; cursor: pointer; }
.bubble-project-item.active { background: rgba(45,212,168,0.1); color: #2DD4A8; }
.bubble-project-edit, .bubble-project-del {
  width: 18px; height: 18px; border-radius: 50%; border: none;
  cursor: pointer; font-size: 9px; display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.15s; flex-shrink: 0;
}
.bubble-project-edit { background: rgba(0,0,0,0.06); color: #888; }
.bubble-project-del { background: rgba(0,0,0,0.06); color: #888; }
.bubble-project-item:hover .bubble-project-edit,
.bubble-project-item:hover .bubble-project-del { opacity: 1; }
.bubble-project-edit:hover { background: #2DD4A8; color: #fff; }
.bubble-project-del:hover { background: #e74c3c; color: #fff; }
.bubble-empty { font-size: 0.7rem; color: #ccc; text-align: center; padding: 8px; }

.bubble-title { font-size: 0.8rem; font-weight: 700; color: #444; margin-bottom: 2px; }
.bubble-desc { font-size: 0.7rem; color: #999; margin-bottom: 4px; }
.bubble-ver { font-size: 0.65rem; color: #aaa; line-height: 1.5; }
.bubble-warn { font-size: 0.72rem; color: #e74c3c; text-align: center; }

.help-content { font-size: 0.85rem; color: #555; line-height: 1.6; }
.help-content h3 { font-size: 1.2rem; margin-bottom: 4px; }
.help-content h4 { margin: 10px 0 4px; font-size: 0.9rem; }
.help-content ul { padding-left: 18px; }
.help-content li { margin-bottom: 2px; }
</style>
