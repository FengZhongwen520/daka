<script setup lang="ts">
import { provide } from 'vue'
import { useContextMenu } from '../../composables/useContextMenu'
import ContextMenu from '../common/ContextMenu.vue'

const props = defineProps<{
  widgetId: number
  type: string
  zIndex: number
  active: boolean
  overlapping: boolean
}>()
const emit = defineEmits<{ delete: []; activate: [] }>()

const { showMenu, menuX, menuY, onContextMenu, closeMenu } = useContextMenu()

function onDelete() {
  closeMenu()
  emit('delete')
}

provide('widgetId', props.widgetId)
provide('widgetType', props.type)
</script>

<template>
  <div
    class="widget-wrapper"
    :class="{ 'is-active': active, 'is-overlapping': overlapping }"
    :style="{ zIndex }"
    :data-widget-id="widgetId"
    @pointerdown.capture="emit('activate')"
    @contextmenu="onContextMenu"
  >
    <slot />
    <ContextMenu :show="showMenu" :x="menuX" :y="menuY">
      <button class="widget-menu-item" @click="onDelete">🗑 删除组件</button>
    </ContextMenu>
  </div>
</template>

<style scoped>
.widget-wrapper { position: absolute; inset: 0; pointer-events: none; }
.widget-wrapper > :deep(*) { pointer-events: auto; }
.widget-wrapper.is-active > :deep(*) {
  outline: 1px solid color-mix(in srgb, var(--color-primary) 18%, transparent);
  outline-offset: 2px;
}
.widget-wrapper.is-overlapping > :deep(*) {
  outline: 2px dashed color-mix(in srgb, var(--color-danger) 72%, transparent);
  outline-offset: 3px;
}

.widget-menu-item {
  display: flex; align-items: center; gap: 6px;
  width: 100%; padding: 8px 12px; border: none;
  background: transparent; border-radius: 7px;
  cursor: pointer; font-size: 0.8rem; color: var(--color-danger);
  transition: background 0.15s; font-family: inherit;
}
.widget-menu-item:hover { background: color-mix(in srgb, var(--color-danger) 8%, transparent); }
</style>
