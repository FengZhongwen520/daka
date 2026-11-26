<script setup lang="ts">
import { ref, watch } from 'vue'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import DragBar from '../common/DragBar.vue'

import { getItem, setItem } from '../../storage'
const props = defineProps<{ widgetId?: number; initialX?: number; initialY?: number }>()

// Load saved text
const textKey = `sticky-text${props.widgetId != null ? '-' + props.widgetId : ''}`
const text = ref(getItem(textKey) || '')
watch(text, (v) => setItem(textKey, v))

// Position
const posKey = `sticky-pos${props.widgetId != null ? '-' + props.widgetId : ''}`
const { x, y, onDragStart } = useWidgetDrag(props, posKey, 80, 12)
</script>

<template>
  <div class="sticky-note" :style="{ left: x + 'px', top: y + 'px' }">
    <DragBar variant="overlay" :on-drag-start="onDragStart" />
    <textarea
      v-model="text"
      class="sticky-textarea"
      placeholder="写点什么..."
      @mousedown.stop
    ></textarea>
  </div>
</template>

<style scoped>
/* Physical paper object — yellow note stays light in both themes */
.sticky-note {
  position: absolute; width: 180px; min-height: 80px; padding: 26px 12px 14px;
  background: #fff385; transform: rotate(-3deg);
  box-shadow: var(--shadow-paper); z-index: 56;
  border-bottom-right-radius: 60px 5px;
}
.sticky-note:hover :deep(.drag-bar--overlay) { opacity: 1; }
.sticky-textarea {
  width: 100%; min-height: 60px; border: none; outline: none; resize: vertical;
  background: transparent; font-size: 0.78rem; color: #555; line-height: 1.5;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
.sticky-textarea::placeholder { color: rgba(0,0,0,0.2); }
</style>
