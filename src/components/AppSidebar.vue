<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject, watch, type Ref } from 'vue'
import {
  selectedProjectId,
  selectProject,
  weatherWallpaper,
  customWallpaper,
  themeMode,
  snapToGrid,
  showLayoutGrid,
  glassOpacity,
  requestLayoutArrangement,
  type ThemeMode,
} from '../store'
import { clearAllData, getProjects, deleteProject, updateProject } from '../db'
import { handleExport, handleImport } from '../utils/io'
import { refreshWeather, weatherError } from '../utils/weather'
import type { Project } from '../types'
import SidebarIcon from './common/SidebarIcon.vue'
import { askConfirm, notify } from '../utils/feedback'
import { getItem, removeItem } from '../storage'
import {
  cloudUser,
  loginCloud,
  logoutCloud,
  registerCloud,
  storageBusy,
  storageError,
  storageMode,
  switchStorageMode,
} from '../storage'

const openAddModal = inject<() => void>('openAddModal')!
const showModal = inject<Ref<boolean>>('showModal')!
const MAX_PROJECTS = 3

const projects = ref<Project[]>([])
const fileInput = ref<HTMLInputElement>()
const collapsed = ref(true)
const activeModule = ref('')
const authMode = ref<'login' | 'register'>('login')
const cloudLoginId = ref('')
const cloudPassword = ref('')
const authError = ref('')
let weatherTimer: ReturnType<typeof setInterval> | null = null

const currentProject = computed(() => projects.value.find(p => p.id === selectedProjectId.value))
const themeOptions: Array<{
  value: ThemeMode
  label: string
  icon: 'sun' | 'moon' | 'system'
}> = [
  { value: 'light', label: '浅色', icon: 'sun' },
  { value: 'dark', label: '深色', icon: 'moon' },
  { value: 'system', label: '跟随系统', icon: 'system' },
]
const themeIcon = computed(() => themeOptions.find(option => option.value === themeMode.value)?.icon || 'system')
const themeLabel = computed(() => themeOptions.find(option => option.value === themeMode.value)?.label || '跟随系统')

async function loadProjects() {
  projects.value = await getProjects()
  // Auto-expand sidebar if no projects
  if (projects.value.length === 0) collapsed.value = false
  // Restore last-used project, or fallback to first
  const saved = getItem('last-project')
  const lastId = saved ? parseInt(saved) : 0
  if (lastId && projects.value.some(p => p.id === lastId)) {
    selectProject(lastId)
  } else if (!selectedProjectId.value && projects.value.length > 0) {
    selectProject(projects.value[0].id!)
  }
}

async function onDelete(id: number, e: Event) {
  e.stopPropagation()
  const confirmed = await askConfirm(
    '确定删除？相关打卡数据也会清除。',
    '删除项目',
    { confirmText: '删除', danger: true },
  )
  if (!confirmed) return
  await deleteProject(id)
  if (selectedProjectId.value === id) selectedProjectId.value = null
  await loadProjects()
  if (!selectedProjectId.value && projects.value.length > 0) selectProject(projects.value[0].id!)
}

function onAddClick() {
  if (projects.value.length >= MAX_PROJECTS) {
    notify(`最多只能创建 ${MAX_PROJECTS} 个项目`, 'warning')
    return
  }
  openAddModal()
}

function openWelcome() {
  removeItem('dake-welcomed')
  location.reload()
}

async function onClearData() {
  try {
    const confirmed = await askConfirm(
      `⚠️ 将清除当前“${storageMode.value === 'cloud' ? '云端' : '本地'}”存储中的全部数据，且不可恢复！确定继续？`,
      '危险操作',
      { confirmText: '我已知晓，确定清除', danger: true },
    )
    if (!confirmed) return
    await clearAllData()
    notify(`${storageMode.value === 'cloud' ? '云端' : '本地'}数据已清除`, 'success')
    location.reload()
  } catch { /* cancelled */ }
}

async function submitCloudAuth() {
  authError.value = ''
  const loginId = cloudLoginId.value.trim()
  if (!loginId || !cloudPassword.value) {
    authError.value = '请输入账号和密码'
    return
  }
  try {
    if (authMode.value === 'register') {
      await registerCloud(loginId, cloudPassword.value)
    } else {
      await loginCloud(loginId, cloudPassword.value)
    }
    location.reload()
  } catch (reason) {
    authError.value = reason instanceof Error ? reason.message : '登录失败'
  }
}

async function applyStorageMode(mode: 'local' | 'cloud') {
  authError.value = ''
  try {
    await switchStorageMode(mode)
    location.reload()
  } catch (reason) {
    authError.value = reason instanceof Error ? reason.message : '切换存储模式失败'
  }
}

async function onCloudLogout() {
  try {
    await logoutCloud()
    location.reload()
  } catch (reason) {
    authError.value = reason instanceof Error ? reason.message : '退出登录失败'
  }
}

const wallpaperInput = ref<HTMLInputElement>()

async function toggleWeatherWallpaper() {
  if (weatherWallpaper.value) {
    weatherWallpaper.value = false
    return
  }

  const ready = await refreshWeather()
  if (!ready) {
    notify(weatherError.value || '天气服务暂时不可用', 'warning')
    return
  }
  weatherWallpaper.value = true
}

function triggerWallpaper() {
  if (weatherWallpaper.value) {
    notify('请先关闭天气壁纸开关', 'warning')
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
    notify('壁纸已更新', 'success')
  }
  reader.readAsDataURL(file)
  if (wallpaperInput.value) wallpaperInput.value.value = ''
}

function toggleModule(name: string) {
  activeModule.value = activeModule.value === name ? '' : name
}

function selectTheme(mode: ThemeMode) {
  themeMode.value = mode
  activeModule.value = ''
}

function onDocClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.menu-item-wrap') && !target.closest('.sidebar-bubble')) {
    activeModule.value = ''
  }
}

function onImportClick() { fileInput.value?.click() }

function editProjectName(p: Project) {
  const name = prompt('输入新名称：', p.name)
  if (name && name.trim()) {
    updateProject(p.id!, { name: name.trim() })
    loadProjects()
  }
}

function projectAvatarStyle(project: Project) {
  return {
    color: project.color,
    background: `color-mix(in srgb, ${project.color} 16%, transparent)`,
    borderColor: `color-mix(in srgb, ${project.color} 28%, transparent)`,
  }
}

async function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    await handleImport(file)
    await loadProjects()
    if (projects.value.length > 0) selectProject(projects.value[0].id!)
    notify('导入成功', 'success')
  } catch (err: any) {
    notify(err.message || '导入失败', 'error')
  }
  if (fileInput.value) fileInput.value.value = ''
}

onMounted(() => {
  loadProjects()
  if (weatherWallpaper.value) {
    const refreshInBackground = () => refreshWeather()
    const requestIdle = (window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
    }).requestIdleCallback
    if (requestIdle) {
      requestIdle(refreshInBackground, { timeout: 1800 })
    } else {
      window.setTimeout(refreshInBackground, 600)
    }
  }
  weatherTimer = setInterval(() => {
    if (weatherWallpaper.value) refreshWeather(true)
  }, 10 * 60 * 1000)
  document.addEventListener('click', onDocClick)
})

onUnmounted(() => {
  if (weatherTimer) clearInterval(weatherTimer)
  document.removeEventListener('click', onDocClick)
})

watch(showModal, async (visible) => {
  if (!visible) await loadProjects()
})
</script>

<template>
  <aside class="app-sidebar" :class="{ collapsed }">
    <!-- Brand -->
    <div class="sidebar-brand" aria-label="页巢">
      <span class="brand-mark" aria-hidden="true">
        <img src="/yechao-icon.png" alt="" />
      </span>
      <span class="brand-copy">
        <span class="brand-word">页巢</span>
        <span class="brand-tagline">PAGE NEST</span>
      </span>
    </div>

    <!-- Sidebar menu (3 items) -->
    <div v-show="!collapsed" class="sidebar-menu">
      <!-- Current project indicator -->
      <div class="sidebar-current-project" v-if="currentProject">
        <span class="project-avatar" :style="projectAvatarStyle(currentProject)">
          {{ currentProject.name.charAt(0).toUpperCase() }}
        </span>
        <span class="project-name">{{ currentProject.name }}</span>
      </div>

      <!-- Projects -->
      <div class="menu-item-wrap">
        <div class="sidebar-menu-item" :class="{ active: activeModule === 'projects' }" @click="toggleModule('projects')">
          <span class="menu-icon"><SidebarIcon name="projects" /></span>
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
              <span
                class="project-avatar small"
                :style="projectAvatarStyle(p)"
                @click="selectProject(p.id!); activeModule = ''"
              >{{ p.name.charAt(0).toUpperCase() }}</span>
              <span @click="selectProject(p.id!); activeModule = ''">{{ p.name }}</span>
              <button class="bubble-project-edit" @click.stop="editProjectName(p)" title="重命名">✎</button>
              <button class="bubble-project-del" @click.stop="onDelete(p.id!, $event)" title="删除">✕</button>
            </div>
            <div v-if="projects.length === 0" class="bubble-empty">暂无项目</div>
          </div>
          <button type="button" class="ui-button ui-button-small btn-block" @click="onAddClick" :disabled="projects.length >= MAX_PROJECTS">
            {{ projects.length >= MAX_PROJECTS ? '项目已满' : `+ 新增 (${projects.length}/${MAX_PROJECTS})` }}
          </button>
          <div class="bubble-row">
            <button class="sidebar-text-btn" @click="handleExport">↥ 导出</button>
            <button class="sidebar-text-btn" @click="onImportClick">↧ 导入</button>
          </div>
          <input ref="fileInput" type="file" accept=".json" style="display:none" @change="onFileChange" />
        </div>
      </div>

      <!-- Storage mode -->
      <div class="menu-item-wrap">
        <div class="sidebar-menu-item" :class="{ active: activeModule === 'storage' }" @click="toggleModule('storage')">
          <span class="menu-icon"><SidebarIcon name="storage" /></span>
          <span class="menu-label">存储</span>
          <span class="theme-current">{{ storageMode === 'cloud' ? '云端' : '本地' }}</span>
        </div>
        <div v-if="activeModule === 'storage'" class="sidebar-bubble storage-bubble">
          <div class="storage-mode-row">
            <div>
              <strong>{{ storageMode === 'cloud' ? '云端存储' : '本地存储' }}</strong>
              <small>{{ storageMode === 'cloud' ? '登录账号 · 服务端加密' : '仅当前浏览器' }}</small>
            </div>
            <span class="storage-mode-dot" :class="storageMode" />
          </div>

          <template v-if="cloudUser">
            <p class="storage-account">已登录：{{ cloudUser.loginId }}</p>
            <div class="storage-actions">
              <button
                type="button"
                class="ui-button ui-button-small"
                :class="{ 'ui-button-primary': storageMode === 'local' }"
                :disabled="storageBusy || storageMode === 'local'"
                @click="applyStorageMode('local')"
              >本地</button>
              <button
                type="button"
                class="ui-button ui-button-small"
                :class="{ 'ui-button-primary': storageMode === 'cloud' }"
                :disabled="storageBusy || storageMode === 'cloud'"
                @click="applyStorageMode('cloud')"
              >云端</button>
            </div>
            <p class="storage-note">两种存储完全隔离，切换不会自动迁移或合并数据。</p>
            <button type="button" class="sidebar-text-btn" :disabled="storageBusy" @click="onCloudLogout">退出登录</button>
          </template>

          <template v-else>
            <p class="storage-note">登录后才会解锁云端模式。云端数据在服务端加密保存。</p>
            <form class="storage-auth-form" @submit.prevent="submitCloudAuth">
              <input
                v-model="cloudLoginId"
                class="ui-input"
                type="text"
                autocomplete="username"
                maxlength="64"
                placeholder="账号"
              />
              <input
                v-model="cloudPassword"
                class="ui-input"
                type="password"
                :autocomplete="authMode === 'register' ? 'new-password' : 'current-password'"
                minlength="8"
                maxlength="128"
                placeholder="密码（至少 8 位）"
              />
              <button type="submit" class="ui-button ui-button-small ui-button-primary btn-block" :disabled="storageBusy">
                {{ storageBusy ? '处理中…' : authMode === 'register' ? '注册并启用云端' : '登录云端' }}
              </button>
            </form>
            <button
              type="button"
              class="sidebar-text-btn storage-auth-switch"
              @click="authMode = authMode === 'login' ? 'register' : 'login'; authError = ''"
            >
              {{ authMode === 'login' ? '没有账号？注册' : '已有账号？登录' }}
            </button>
          </template>

          <p v-if="authError || storageError" class="storage-error">{{ authError || storageError }}</p>
        </div>
      </div>

      <!-- Wallpaper -->
      <div class="menu-item-wrap">
        <div class="sidebar-menu-item" :class="{ active: activeModule === 'wallpaper' }" @click="toggleModule('wallpaper')">
          <span class="menu-icon"><SidebarIcon name="wallpaper" /></span>
          <span class="menu-label">壁纸</span>
        </div>
        <div v-if="activeModule === 'wallpaper'" class="sidebar-bubble">
          <div class="bubble-row">
            <span class="bubble-label">天气壁纸</span>
            <button
              type="button"
              class="ui-switch"
              role="switch"
              :aria-checked="weatherWallpaper"
              aria-label="天气壁纸"
              @click="toggleWeatherWallpaper"
            />
          </div>
          <div class="bubble-row">
            <span class="bubble-label">自定义壁纸</span>
            <button type="button" class="ui-button ui-button-small" @click="triggerWallpaper">上传图片</button>
          </div>
          <input ref="wallpaperInput" type="file" accept="image/*" style="display:none" @change="onWallpaperChange" />
          <button v-if="customWallpaper" class="sidebar-text-btn" @click="customWallpaper = ''">清除自定义壁纸</button>
        </div>
      </div>

      <!-- Layout -->
      <div class="menu-item-wrap">
        <div
          class="sidebar-menu-item"
          :class="{ active: activeModule === 'layout' }"
          @click="toggleModule('layout')"
        >
          <span class="menu-icon"><SidebarIcon name="layout" /></span>
          <span class="menu-label">布局</span>
        </div>
        <div v-if="activeModule === 'layout'" class="sidebar-bubble layout-bubble">
          <button
            type="button"
            class="ui-button ui-button-small btn-block"
            @click="requestLayoutArrangement(); activeModule = ''"
          >
            自动整理布局
          </button>
          <div class="bubble-row">
            <span class="bubble-label">吸附 8px 网格</span>
            <button
              type="button"
              class="ui-switch"
              role="switch"
              :aria-checked="snapToGrid"
              aria-label="吸附网格"
              @click="snapToGrid = !snapToGrid"
            />
          </div>
          <div class="bubble-row">
            <span class="bubble-label">显示布局网格</span>
            <button
              type="button"
              class="ui-switch"
              role="switch"
              :aria-checked="showLayoutGrid"
              aria-label="显示布局网格"
              @click="showLayoutGrid = !showLayoutGrid"
            />
          </div>
          <label class="glass-opacity-control">
            <span>
              <span>玻璃不透明度</span>
              <strong>{{ Math.round(glassOpacity * 100) }}%</strong>
            </span>
            <input
              v-model.number="glassOpacity"
              type="range"
              min="0.24"
              max="0.8"
              step="0.02"
              aria-label="玻璃不透明度"
            />
          </label>
        </div>
      </div>

      <!-- Help -->
      <div class="menu-item-wrap">
        <div class="sidebar-menu-item" :class="{ active: activeModule === 'help' }" @click="toggleModule('help')">
          <span class="menu-icon"><SidebarIcon name="help" /></span>
          <span class="menu-label">帮助</span>
        </div>
        <div v-if="activeModule === 'help'" class="sidebar-bubble">
          <p class="bubble-title">页巢</p>
          <p class="bubble-desc">浏览器导航页，你的个人工作台。</p>
          <p class="bubble-ver">v2.0 拖拽组件、多项目<br>v1.5 天气、白噪音、番茄钟<br>v1.0 基础打卡、导入导出</p>
          <button type="button" class="ui-button ui-button-small btn-block" @click="openWelcome">重新查看引导</button>
        </div>
      </div>

      <!-- Clear -->
      <div class="menu-item-wrap">
        <div class="sidebar-menu-item danger" :class="{ active: activeModule === 'clear' }" @click="toggleModule('clear')">
          <span class="menu-icon"><SidebarIcon name="trash" /></span>
          <span class="menu-label">清除</span>
        </div>
        <div v-if="activeModule === 'clear'" class="sidebar-bubble">
          <p class="bubble-warn">清除当前项目全部数据</p>
          <button type="button" class="ui-button ui-button-small btn-block ui-button-danger" @click="onClearData">确认清除</button>
        </div>
      </div>

      <!-- Theme -->
      <div class="menu-item-wrap">
        <button
          type="button"
          class="sidebar-menu-item"
          :class="{ active: activeModule === 'theme' }"
          :title="`当前主题：${themeLabel}`"
          :aria-expanded="activeModule === 'theme'"
          aria-haspopup="menu"
          @click="toggleModule('theme')"
        >
          <span class="menu-icon"><SidebarIcon :name="themeIcon" /></span>
          <span class="menu-label">主题</span>
          <span class="theme-current">{{ themeLabel }}</span>
        </button>
        <div
          v-if="activeModule === 'theme'"
          class="sidebar-bubble theme-bubble"
          role="radiogroup"
          aria-label="主题模式"
          @keydown.escape="activeModule = ''"
        >
          <button
            v-for="option in themeOptions"
            :key="option.value"
            type="button"
            class="theme-option"
            :class="{ active: themeMode === option.value }"
            role="radio"
            :aria-checked="themeMode === option.value"
            @click="selectTheme(option.value)"
          >
            <span class="theme-option-icon"><SidebarIcon :name="option.icon" /></span>
            <span>{{ option.label }}</span>
            <span class="theme-option-check" aria-hidden="true">✓</span>
          </button>
        </div>
      </div>

    </div>

    <!-- Sidebar toggle button -->
    <button class="sidebar-collapse-btn" @click="collapsed = !collapsed" :title="collapsed ? '展开侧边栏' : '收起侧边栏'">
      <SidebarIcon :name="collapsed ? 'chevron-right' : 'chevron-left'" />
    </button>
  </aside>
</template>

<style scoped>
.storage-bubble {
  min-width: 236px;
}
.storage-mode-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border);
}
.storage-mode-row > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.storage-mode-row strong {
  color: var(--color-ink);
  font-size: 0.74rem;
}
.storage-mode-row small,
.storage-account,
.storage-note {
  color: var(--color-ink-3);
  font-size: 0.62rem;
  line-height: 1.45;
}
.storage-mode-dot {
  width: 9px;
  height: 9px;
  flex: 0 0 9px;
  border-radius: 50%;
  background: var(--color-ink-3);
}
.storage-mode-dot.cloud {
  background: var(--color-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-primary) 14%, transparent);
}
.storage-account {
  margin: 9px 0 7px;
  overflow: hidden;
  color: var(--color-ink-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.storage-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}
.storage-note {
  margin: 9px 0;
}
.storage-auth-form {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.storage-auth-form .ui-input {
  height: 30px;
  font-size: 0.68rem;
}
.storage-auth-switch {
  display: block;
  margin: 8px auto 0;
}
.storage-error {
  margin-top: 8px;
  color: var(--color-danger);
  font-size: 0.62rem;
  line-height: 1.45;
}

.app-sidebar {
  width: var(--sidebar-width); background: var(--color-surface-soft);
  border-right: 1px solid var(--color-border);
  display: flex; flex-direction: column; flex-shrink: 0; overflow: visible;
  transition: width 0.25s ease; position: relative;
}
.app-sidebar.collapsed { width: 22px; border-right: none; overflow: visible; }

/* Brand */
.sidebar-brand {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 12px 13px; flex-shrink: 0;
  color: var(--color-ink);
}
.app-sidebar.collapsed .sidebar-brand { display: none; }
.brand-mark {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  flex: 0 0 38px;
}
.brand-mark img { width: 100%; height: 100%; display: block; object-fit: contain; }
.brand-copy { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.brand-word {
  font-size: 1.18rem;
  font-weight: 790;
  letter-spacing: -0.065em;
  line-height: 0.88;
}
.brand-tagline {
  color: var(--color-ink-3);
  font-size: 0.47rem;
  font-weight: 720;
  letter-spacing: 0.13em;
  line-height: 1;
}

.sidebar-collapse-btn {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 54px;
  border-radius: 9px 0 0 9px;
  border: 1px solid var(--color-border);
  border-right: 0;
  background: color-mix(in srgb, var(--color-surface-soft) 92%, transparent);
  color: var(--color-ink-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 180ms ease, color 180ms ease, border-color 180ms ease;
  z-index: 10;
  box-shadow: none;
}
.app-sidebar.collapsed .sidebar-collapse-btn {
  border-radius: 0 9px 9px 0;
  border-right: 1px solid var(--color-border);
  border-left: 0;
}
.sidebar-collapse-btn:hover {
  background: var(--color-surface);
  color: var(--color-primary);
  border-color: color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
}
.sidebar-collapse-btn :deep(.sidebar-icon) {
  width: 12px;
  height: 12px;
}

/* Current project indicator */
.sidebar-current-project {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 12px; margin-bottom: 6px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-ink) 4%, transparent);
}
.project-color-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; min-width: 10px; }
.project-avatar {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 7px;
  font-size: 0.56rem;
  font-weight: 750;
}
.project-avatar.small {
  width: 20px;
  height: 20px;
  flex-basis: 20px;
  border-radius: 6px;
}

.bubble-backdrop { position: fixed; inset: 0; z-index: 99; }
.project-icon { font-size: 16px; flex-shrink: 0; }
.project-name { font-size: 13px; font-weight: 500; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Sidebar menu */
.sidebar-menu {
  flex: 1; padding: 10px; display: flex; flex-direction: column; gap: 2px;
}
.btn-block { width: 100%; }
.btn-sm { font-size: 12px; padding: 5px 10px; }

.menu-item-wrap { position: relative; }

.sidebar-menu-item {
  width: 100%;
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border-radius: 8px; cursor: pointer;
  border: 0; background: transparent; color: inherit; font-family: inherit;
  text-align: left; appearance: none;
  transition: all 0.2s;
}
.sidebar-menu-item:hover { background: rgba(0,0,0,0.04); }
.sidebar-menu-item.active { background: var(--color-primary-soft); }
.menu-icon {
  width: 22px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--color-ink-3);
  transition: color 160ms ease;
}
.sidebar-menu-item:hover .menu-icon,
.sidebar-menu-item.active .menu-icon { color: var(--color-primary); }
.sidebar-menu-item.danger .menu-icon,
.sidebar-menu-item.danger:hover .menu-icon { color: var(--color-danger); }
.menu-label { font-size: 0.8rem; font-weight: 600; color: var(--color-ink-2); }
.sidebar-menu-item.danger .menu-label { color: var(--color-danger); }
.theme-current {
  margin-left: auto;
  color: var(--color-ink-3);
  font-size: 0.62rem;
  font-weight: 500;
  white-space: nowrap;
}

.theme-bubble { gap: 4px; }
.theme-option {
  width: 100%;
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--color-ink-2);
  cursor: pointer;
  font: 600 0.72rem/1 var(--font-family);
  text-align: left;
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
}
.theme-option:hover { background: color-mix(in srgb, var(--color-ink) 5%, transparent); color: var(--color-ink); }
.theme-option.active {
  border-color: color-mix(in srgb, var(--color-primary) 28%, var(--color-border));
  background: var(--color-primary-soft);
  color: var(--color-primary-hover);
}
.theme-option-icon { width: 18px; height: 18px; display: grid; place-items: center; }
.theme-option-check { margin-left: auto; opacity: 0; color: var(--color-primary); font-size: 0.68rem; }
.theme-option.active .theme-option-check { opacity: 1; }

/* Bubble pops to the RIGHT */
.sidebar-bubble {
  position: absolute; left: calc(100% + 8px); top: 0;
  width: 220px; padding: 12px;
  background: var(--color-surface); border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-pop);
  z-index: 100; display: flex; flex-direction: column; gap: 6px;
}
.bubble-row { display: flex; gap: 4px; align-items: center; justify-content: space-between; }
.bubble-label { font-size: 0.72rem; color: var(--color-ink-2); }
.layout-bubble { gap: 8px; }
.glass-opacity-control {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding-top: 3px;
}
.glass-opacity-control > span {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--color-ink-2);
  font-size: 0.7rem;
}
.glass-opacity-control strong {
  color: var(--color-primary-hover);
  font-size: 0.63rem;
  font-variant-numeric: tabular-nums;
}
.glass-opacity-control input {
  width: 100%;
  accent-color: var(--color-primary);
}
.sidebar-text-btn {
  flex: 1; padding: 6px 0; border: none; border-radius: 6px;
  background: rgba(0,0,0,0.04); cursor: pointer; font-size: 0.7rem;
  color: var(--color-ink-2); transition: all 0.2s; font-family: inherit;
  text-align: center;
}
.sidebar-text-btn:hover { background: rgba(0,0,0,0.08); color: var(--color-ink); }

.bubble-project-list { max-height: 120px; overflow-y: auto; }
.bubble-project-item {
  display: flex; align-items: center; gap: 4px; padding: 6px 8px;
  border-radius: 6px; cursor: pointer; font-size: 0.75rem; color: var(--color-ink-2);
  transition: background 0.15s;
}
.bubble-project-item:hover { background: rgba(0,0,0,0.04); }
.bubble-project-item span.project-avatar { flex: 0 0 20px; }
.bubble-project-item span:not(.project-avatar) { flex: 1; cursor: pointer; }
.bubble-project-item.active { background: var(--color-primary-soft); color: var(--color-primary); }
.bubble-project-edit, .bubble-project-del {
  width: 18px; height: 18px; border-radius: 50%; border: none;
  cursor: pointer; font-size: 9px; display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.15s; flex-shrink: 0;
}
.bubble-project-edit { background: rgba(0,0,0,0.06); color: var(--color-ink-3); }
.bubble-project-del { background: rgba(0,0,0,0.06); color: var(--color-ink-3); }
.bubble-project-item:hover .bubble-project-edit,
.bubble-project-item:hover .bubble-project-del { opacity: 1; }
.bubble-project-edit:hover { background: var(--color-primary); color: #fff; }
.bubble-project-del:hover { background: var(--color-danger); color: #fff; }
.bubble-empty { font-size: 0.7rem; color: var(--color-ink-3); text-align: center; padding: 8px; }

.bubble-title { font-size: 0.8rem; font-weight: 700; color: var(--color-ink); margin-bottom: 2px; }
.bubble-desc { font-size: 0.7rem; color: var(--color-ink-3); margin-bottom: 4px; }
.bubble-ver { font-size: 0.65rem; color: var(--color-ink-3); line-height: 1.5; }
.bubble-warn { font-size: 0.72rem; color: var(--color-danger); text-align: center; }

.help-content { font-size: 0.85rem; color: var(--color-ink-2); line-height: 1.6; }
.help-content h3 { font-size: 1.2rem; margin-bottom: 4px; }
.help-content h4 { margin: 10px 0 4px; font-size: 0.9rem; }
.help-content ul { padding-left: 18px; }
.help-content li { margin-bottom: 2px; }

/* === Dark mode overrides === */
html.dark .sidebar-menu-item:hover { background: rgba(255,255,255,0.06); }
html.dark .sidebar-text-btn { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.6); }
html.dark .sidebar-text-btn:hover { background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.85); }
html.dark .bubble-project-item:hover { background: rgba(255,255,255,0.06); }
html.dark .bubble-project-edit,
html.dark .bubble-project-del { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); }
</style>
