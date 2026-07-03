<script setup lang="ts">
import { ref, provide, onMounted } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import AppCalendar from './components/AppContent.vue'
import AppModal from './components/AppModal.vue'

const showModal = ref(false)
const modalMode = ref<'add' | 'edit'>('add')
const editingProjectId = ref<number | null>(null)

function openAddModal() {
  modalMode.value = 'add'
  editingProjectId.value = null
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

provide('showModal', showModal)
provide('modalMode', modalMode)
provide('editingProjectId', editingProjectId)
provide('openAddModal', openAddModal)
provide('closeModal', closeModal)

// Welcome dialog
const showWelcome = ref(false)
const welcomeStep = ref(0)

onMounted(() => {
  if (!localStorage.getItem('dake-welcomed')) {
    showWelcome.value = true
    localStorage.setItem('dake-welcomed', '1')
  }
})

function closeWelcome() { showWelcome.value = false }
</script>

<template>
  <div class="app-layout">
    <div class="app-body">
      <AppSidebar />
      <AppCalendar />
    </div>
    <AppModal v-if="showModal" />
  </div>

  <!-- Welcome dialog -->
  <el-dialog v-model="showWelcome" title="👋 欢迎使用 Dake 哒咔" width="560px" :close-on-click-modal="false">
    <div class="welcome-body">
      <div class="welcome-page" v-show="welcomeStep === 0">
        <p class="welcome-intro">Dake 是你的<strong>浏览器导航页</strong>和<strong>个人工作台</strong>。</p>

        <h4>🔎 搜索引擎</h4>
        <p>内置多引擎搜索，直接在桌面搜索，快速便捷。</p>

        <h4>🔒 数据安全</h4>
        <p>所有数据<strong>仅存储在本地浏览器</strong>（IndexedDB），不上传任何服务器，你的隐私完全由你掌控。</p>

        <h4>📑 收藏夹（重点功能）</h4>
        <p>网址导航网格，支持<strong>导入浏览器收藏夹 HTML</strong>，自动解析目录结构。图标自动获取，多种布局切换，是你网上冲浪的起点。</p>
      </div>

      <div class="welcome-page" v-show="welcomeStep === 1">
        <h4>📅 日历书 — 3D 翻页打卡</h4>
        <p>钢笔圆圈特效，三种尺寸可选。</p>

        <h4>🌤 天气 + 桌面特效</h4>
        <p>实时天气，根据天气自动变换桌面背景和粒子特效（雨/雪/雾/云）。</p>

        <h4>🍅 番茄钟</h4>
        <p>25+5 专注倒计时，可自定义时长，专注/休息双模式专属配色。</p>

        <h4>📻 白噪音收音机</h4>
        <p>6 种环境音（雨声/咖啡馆/森林/壁炉/海浪/冥想），Web Audio 实时合成。</p>

        <h4>💧 饮水追踪 · 📝 便签 · 🖼 照片框 · 🔢 计算器</h4>
        <p>更多实用小组件等你探索。</p>
      </div>

      <div class="welcome-page" v-show="welcomeStep === 2">
        <h4>✨ 自由布局</h4>
        <p>点击右上角 <strong>＋</strong> 添加组件，拖拽 <strong>⋮⋮</strong> 移动位置，右键删除。</p>

        <h4>📂 多项目管理</h4>
        <p>侧边栏展开 → 项目菜单，支持最多 3 个项目，每个项目独立布局和数据。</p>

        <h4>💡 提示</h4>
        <p>本页面可随时在侧边栏 <strong>？帮助</strong> 中重新打开。</p>
        <p>侧边栏 <strong>🗑 清除</strong> 将清空当前项目 <strong>全部 IndexedDB 数据</strong>，不可恢复，请谨慎操作。</p>
      </div>
    </div>

    <template #footer>
      <div class="welcome-footer">
        <el-button v-if="welcomeStep > 0" @click="welcomeStep--">上一步</el-button>
        <el-button v-if="welcomeStep < 2" type="primary" @click="welcomeStep++">下一步</el-button>
        <el-button v-if="welcomeStep === 2" type="primary" @click="closeWelcome">开始使用</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style>
.welcome-body { min-height: 280px; }
.welcome-intro { font-size: 0.95rem; margin-bottom: 12px; line-height: 1.6; }
.welcome-page h4 { margin: 10px 0 4px; font-size: 0.9rem; color: #444; }
.welcome-page p { font-size: 0.8rem; color: #666; line-height: 1.5; margin-bottom: 6px; }
.welcome-footer { display: flex; justify-content: space-between; }
</style>
