<script setup lang="ts">
import { ref, watch } from 'vue'
import UiDialog from './common/UiDialog.vue'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const welcomeStep = ref(0)
const steps = [
  { title: '核心亮点', eyebrow: '认识页巢' },
  { title: '搭建工作台', eyebrow: '开始使用' },
  { title: '专注与资讯', eyebrow: '每天都会用' },
  { title: '存储与隐私', eyebrow: '放心使用' },
]

watch(() => props.modelValue, (open) => {
  if (open) welcomeStep.value = 0
})

function close() {
  emit('update:modelValue', false)
}

function goToStep(index: number) {
  welcomeStep.value = index
}
</script>

<template>
  <UiDialog
    :model-value="modelValue"
    title="页巢使用指南"
    width="664px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="welcome-shell">
      <nav class="guide-nav" aria-label="指南章节">
        <button
          v-for="(step, index) in steps"
          :key="step.title"
          type="button"
          class="guide-nav-item"
          :class="{ active: welcomeStep === index }"
          :aria-current="welcomeStep === index ? 'step' : undefined"
          @click="goToStep(index)"
        >
          <span>{{ String(index + 1).padStart(2, '0') }}</span>
          <strong>{{ step.title }}</strong>
        </button>
      </nav>

      <div class="guide-content">
        <div v-show="welcomeStep === 0" class="welcome-page">
          <p class="guide-eyebrow">PAGE NEST · PERSONAL START PAGE</p>
          <h3>把每天要打开的东西，放到同一张桌面。</h3>
          <p class="guide-lead">页巢不是一排链接，而是一个会记住你工作方式的新标签页：搜索、收藏、专注、生活记录和私人资讯都可以自由组合。</p>
          <div class="feature-grid">
            <article class="feature-card">
              <span>01</span>
              <h4>私人资讯雷达</h4>
              <p>AI、深圳、游戏、影视专题自由组合；每个 Tab 可单独选媒体源，停留时每 5 分钟更新。</p>
            </article>
            <article class="feature-card">
              <span>02</span>
              <h4>专注与生活</h4>
              <p>番茄钟、白噪音、饮水、日记和待办，用一套组件承接工作节奏与日常记录。</p>
            </article>
            <article class="feature-card">
              <span>03</span>
              <h4>搜索与收藏</h4>
              <p>多引擎即时切换，可导入浏览器收藏夹，把高频入口整理成自己的导航面板。</p>
            </article>
            <article class="feature-card">
              <span>04</span>
              <h4>多项目工作台</h4>
              <p>最多三个项目，各自保存独立布局与数据。工作、生活、临时项目互不打扰。</p>
            </article>
          </div>
        </div>

        <div v-show="welcomeStep === 1" class="welcome-page">
          <p class="guide-eyebrow">FIRST 60 SECONDS</p>
          <h3>四步搭出第一张工作台。</h3>
          <p class="guide-lead">首次进入会自动创建“默认项目”，并放好天气、待办、搜索、时钟、收藏夹、日历、资讯雷达、日记、翻译、计算器和照片框。你可以直接使用，也可以自由删除、移动和缩放。</p>
          <div class="setup-list">
            <div class="setup-item">
              <span>01</span>
              <div>
                <h4>添加需要的组件</h4>
                <p>点击右上角 <kbd>＋</kbd>，从组件画廊选择天气、待办、资讯、番茄钟等。</p>
              </div>
            </div>
            <div class="setup-item">
              <span>02</span>
              <div>
                <h4>移动与调整大小</h4>
                <p>拖住组件顶部手柄移动位置，拖动边缘或右下角调整尺寸；重叠时会出现“点击整理”。</p>
              </div>
            </div>
            <div class="setup-item">
              <span>03</span>
              <div>
                <h4>为不同场景建项目</h4>
                <p>侧边栏“项目”最多可建三个项目，每个项目拥有独立布局和内容。</p>
              </div>
            </div>
            <div class="setup-item">
              <span>04</span>
              <div>
                <h4>统一调整外观</h4>
                <p>在“个性化”里设置天气或自定义壁纸、网格吸附、玻璃质感，以及浅色、深色或跟随系统主题。</p>
              </div>
            </div>
          </div>
          <div class="guide-callout">先添加一个最常用的组件，再慢慢增加。桌面不必一次布置完整。</div>
        </div>

        <div v-show="welcomeStep === 2" class="welcome-page">
          <p class="guide-eyebrow">THE DAILY LOOP</p>
          <h3>把“找信息”和“进入状态”放在手边。</h3>
          <div class="daily-grid">
            <article class="daily-card">
              <h4>资讯雷达</h4>
              <p>每个专题 Tab 可自由挑选媒体源。页面重新进入时刷新，停留页面时每 5 分钟更新；离开页面后停止请求。</p>
              <ul>
                <li>专题和媒体源按 Tab 独立配置</li>
                <li>未读数字可一键标为已读</li>
                <li>隐私模式会隐藏标题和内容</li>
              </ul>
            </article>
            <article class="daily-card">
              <h4>专注组合</h4>
              <p>番茄钟负责节奏，白噪音负责环境，饮水和待办负责身体与任务，不必在多个网站间切换。</p>
              <ul>
                <li>番茄钟与饮水支持云端实时同步</li>
                <li>白噪音由浏览器实时合成</li>
                <li>日记在切页或失去焦点时自动隐藏</li>
              </ul>
            </article>
          </div>
          <div class="workflow-strip">
            <span>搜索</span><i />
            <span>收藏常用入口</span><i />
            <span>订阅私人资讯</span><i />
            <span>进入专注状态</span>
          </div>
        </div>

        <div v-show="welcomeStep === 3" class="welcome-page">
          <p class="guide-eyebrow">YOUR DATA, YOUR CHOICE</p>
          <h3>本地与云端完全隔离，按需要选择。</h3>
          <div class="storage-choice-grid">
            <article>
              <span>LOCAL</span>
              <h4>本地存储</h4>
              <p>数据只保存在当前浏览器。适合只在这一台设备使用，不登录也可以完整使用。</p>
            </article>
            <article>
              <span>CLOUD</span>
              <h4>云端存储</h4>
              <p>登录后保存到服务端并加密，可在不同设备使用。番茄钟和饮水支持实时同步。</p>
            </article>
          </div>
          <div class="account-list">
            <div>
              <strong>绑定邮箱</strong>
              <p>用于找回密码。绑定后刷新页面，邮箱状态仍会保留。</p>
            </div>
            <div>
              <strong>项目同步</strong>
              <p>本地与云端项目可双向同步；覆盖前会二次确认。</p>
            </div>
            <div>
              <strong>切换前先备份</strong>
              <p>两种存储不会自动迁移或合并。切换前可在“项目”中导出 JSON，避免遗漏。</p>
            </div>
          </div>
          <div class="privacy-note">
            <strong>隐私提醒</strong>
            <span>日记、资讯等私人内容会进入隐私模式。清除入口本身保持中性，只有最终不可撤销确认使用红色。</span>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="guide-footer-meta">
        <span v-for="(_, index) in steps" :key="index" :class="{ active: welcomeStep === index }" />
        <small>{{ welcomeStep + 1 }} / {{ steps.length }}</small>
      </div>
      <button
        v-if="welcomeStep > 0"
        type="button"
        class="ui-button"
        @click="welcomeStep--"
      >上一步</button>
      <button
        v-if="welcomeStep < steps.length - 1"
        type="button"
        class="ui-button ui-button-primary"
        @click="welcomeStep++"
      >下一步</button>
      <button
        v-else
        type="button"
        class="ui-button ui-button-primary"
        @click="close"
      >开始使用</button>
    </template>
  </UiDialog>
</template>

<style scoped>
.welcome-shell {
  display: grid;
  grid-template-columns: 128px minmax(0, 1fr);
  gap: 22px;
}
.guide-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 14px;
  border-right: 1px solid var(--color-border);
}
.guide-nav-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 7px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--color-ink-3);
  cursor: pointer;
  font-family: var(--font-family);
  text-align: left;
  transition: background 150ms ease, color 150ms ease;
}
.guide-nav-item > span {
  font: 650 0.55rem/1 var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.guide-nav-item > strong {
  font-size: 0.64rem;
  font-weight: 600;
}
.guide-nav-item:hover {
  background: color-mix(in srgb, var(--color-ink) 4%, transparent);
  color: var(--color-ink-2);
}
.guide-nav-item.active {
  background: var(--color-primary-soft);
  color: var(--color-primary-hover);
}
.guide-content {
  min-width: 0;
  min-height: 344px;
}
.welcome-page {
  animation: guide-enter 180ms ease both;
}
.guide-eyebrow {
  color: var(--color-primary-hover);
  font: 720 0.55rem/1.3 var(--font-mono);
  letter-spacing: 0.06em;
}
.guide-content h3 {
  max-width: 430px;
  margin-top: 7px;
  color: var(--color-ink);
  font-size: 1.16rem;
  font-weight: 760;
  letter-spacing: -0.025em;
  line-height: 1.35;
}
.guide-lead {
  max-width: 470px;
  margin-top: 8px;
  color: var(--color-ink-2);
  font-size: 0.72rem;
  line-height: 1.65;
}
.feature-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 16px;
}
.feature-card {
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  background: color-mix(in srgb, var(--color-surface-soft) 68%, transparent);
}
.feature-card > span {
  color: var(--color-primary-hover);
  font: 700 0.54rem/1 var(--font-mono);
}
.feature-card h4,
.daily-card h4,
.setup-item h4,
.storage-choice-grid h4 {
  margin-top: 6px;
  color: var(--color-ink);
  font-size: 0.72rem;
  font-weight: 700;
}
.feature-card p,
.daily-card p,
.setup-item p,
.storage-choice-grid p,
.account-list p {
  margin-top: 5px;
  color: var(--color-ink-3);
  font-size: 0.64rem;
  line-height: 1.55;
}
.setup-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-top: 15px;
}
.setup-item {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  gap: 9px;
  padding: 9px 0;
}
.setup-item + .setup-item {
  border-top: 1px solid var(--color-border);
}
.setup-item > span {
  padding-top: 2px;
  color: var(--color-primary-hover);
  font: 700 0.59rem/1.2 var(--font-mono);
}
.setup-item h4 {
  margin-top: 0;
}
kbd {
  min-width: 17px;
  display: inline-grid;
  place-items: center;
  padding: 1px 4px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface-soft);
  color: var(--color-ink-2);
  font: inherit;
}
.guide-callout {
  margin-top: 12px;
  padding: 9px 11px;
  border-left: 2px solid var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 7%, transparent);
  color: var(--color-ink-2);
  font-size: 0.65rem;
  line-height: 1.55;
}
.daily-grid,
.storage-choice-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
  margin-top: 16px;
}
.daily-card,
.storage-choice-grid article {
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 9px;
}
.daily-card h4,
.storage-choice-grid h4 {
  margin-top: 0;
}
.daily-card ul {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 8px;
  padding-left: 15px;
  color: var(--color-ink-2);
  font-size: 0.62rem;
  line-height: 1.45;
}
.workflow-strip {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 14px;
  padding: 10px 11px;
  border-radius: 8px;
  background: var(--color-surface-soft);
  color: var(--color-ink-2);
  font-size: 0.58rem;
  white-space: nowrap;
}
.workflow-strip i {
  width: 12px;
  height: 1px;
  flex: 1;
  background: var(--color-border);
}
.storage-choice-grid article > span {
  color: var(--color-primary-hover);
  font: 700 0.53rem/1 var(--font-mono);
  letter-spacing: 0.06em;
}
.account-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 9px;
}
.account-list > div {
  padding: 10px;
  border-radius: 8px;
  background: var(--color-surface-soft);
}
.account-list strong {
  color: var(--color-ink-2);
  font-size: 0.65rem;
}
.account-list p {
  margin-top: 4px;
}
.privacy-note {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 11px;
  padding: 10px 11px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 22%, var(--color-border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 6%, transparent);
}
.privacy-note strong {
  color: var(--color-ink-2);
  font-size: 0.64rem;
}
.privacy-note span {
  color: var(--color-ink-3);
  font-size: 0.62rem;
  line-height: 1.5;
}
.guide-footer-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-right: auto;
}
.guide-footer-meta > span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-border);
  transition: width 150ms ease, background 150ms ease;
}
.guide-footer-meta > span.active {
  width: 16px;
  border-radius: 999px;
  background: var(--color-primary);
}
.guide-footer-meta small {
  margin-left: 4px;
  color: var(--color-ink-3);
  font: 600 0.56rem/1 var(--font-mono);
}
@keyframes guide-enter {
  from { opacity: 0; transform: translateX(5px); }
  to { opacity: 1; transform: translateX(0); }
}
@media (max-width: 680px) {
  .welcome-shell {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .guide-nav {
    flex-direction: row;
    overflow-x: auto;
    padding: 0 0 10px;
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
  }
  .guide-nav-item {
    flex: 0 0 auto;
  }
  .guide-content {
    min-height: 0;
  }
  .feature-grid,
  .daily-grid,
  .storage-choice-grid {
    grid-template-columns: 1fr;
  }
  .account-list {
    grid-template-columns: 1fr;
  }
  .workflow-strip {
    flex-wrap: wrap;
    white-space: normal;
  }
}
@media (prefers-reduced-motion: reduce) {
  .welcome-page { animation: none; }
}
</style>
