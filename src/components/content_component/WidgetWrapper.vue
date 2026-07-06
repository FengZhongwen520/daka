<script setup lang="ts">
import { provide } from 'vue'
import { useContextMenu } from '../../composables/useContextMenu'
import ContextMenu from '../common/ContextMenu.vue'

const props = defineProps<{ widgetId: number; type: string }>()
const emit = defineEmits<{ delete: [] }>()

const { showMenu, menuX, menuY, onContextMenu, closeMenu } = useContextMenu()

function onDelete() {
  closeMenu()
  emit('delete')
}

provide('widgetId', props.widgetId)
provide('widgetType', props.type)
</script>

<template>
  <div class="widget-wrapper" @contextmenu="onContextMenu">
    <slot />
    <ContextMenu :show="showMenu" :x="menuX" :y="menuY">
      <button class="widget-menu-item" @click="onDelete">🗑 删除组件</button>
    </ContextMenu>
  </div>
</template>

<style scoped>
.widget-wrapper { position: absolute; inset: 0; pointer-events: none; }
.widget-wrapper > :deep(*) { pointer-events: auto; }

.widget-menu-item {
  display: flex; align-items: center; gap: 6px;
  width: 100%; padding: 8px 12px; border: none;
  background: transparent; border-radius: 7px;
  cursor: pointer; font-size: 0.8rem; color: #e74c3c;
  transition: background 0.15s; font-family: inherit;
}
.widget-menu-item:hover { background: rgba(231,76,60,0.08); }
</style>
