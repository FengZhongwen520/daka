<script setup lang="ts">
import { ref, provide } from 'vue'

const props = defineProps<{ widgetId: number; type: string }>()
const emit = defineEmits<{ delete: [] }>()

// Global shared state — all instances use the same menu
let activeMenu: { close: () => void } | null = null

const showMenu = ref(false)
const menuX = ref(0)
const menuY = ref(0)

function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  // Close any previous menu (even from other widget instances)
  if (activeMenu && activeMenu !== menuState) activeMenu.close()
  menuX.value = e.clientX
  menuY.value = e.clientY
  showMenu.value = true
  activeMenu = menuState
  setTimeout(() => document.addEventListener('click', closeMenu, { once: true }), 0)
}

const menuState = { close }

function close() { showMenu.value = false; if (activeMenu === menuState) activeMenu = null }
function closeMenu() { close() }

function onDelete() {
  close()
  emit('delete')
}

provide('widgetId', props.widgetId)
provide('widgetType', props.type)
</script>

<template>
  <div class="widget-wrapper" @contextmenu="onContextMenu">
    <slot />
    <Teleport to="body">
      <div v-if="showMenu" class="widget-menu" :style="{ left: menuX + 'px', top: menuY + 'px' }" @click.stop>
        <button class="widget-menu-item" @click="onDelete">🗑 删除组件</button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.widget-wrapper { position: absolute; inset: 0; pointer-events: none; }
.widget-wrapper > :deep(*) { pointer-events: auto; }
</style>

<style>
.widget-menu {
  position: fixed; z-index: 9999;
  background: rgba(255,255,255,0.95); backdrop-filter: blur(12px);
  border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  padding: 4px; min-width: 120px;
}
.widget-menu-item {
  display: flex; align-items: center; gap: 6px;
  width: 100%; padding: 8px 12px; border: none;
  background: transparent; border-radius: 7px;
  cursor: pointer; font-size: 0.8rem; color: #e74c3c;
  transition: background 0.15s; font-family: inherit;
}
.widget-menu-item:hover { background: rgba(231,76,60,0.08); }
</style>
